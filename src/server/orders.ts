import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { OrderingConfig } from "../config/ordering";
import { GatewayError, type PaymentGateway } from "./gateway";
import { priceCart, type PriceCtx, type QuoteErrorItem, type QuoteResult } from "./pricing";
import { UniqueViolation, type Repo } from "./repo";
import type { Order, PaymentAttempt } from "./types";
import { validateCheckout, type CheckoutInput } from "./validation";

export interface OrderDeps { repo: Repo; gateway: PaymentGateway; cfg: OrderingConfig; siteUrl: string; now?: () => Date }
export type Outcome =
  | { ok: true; orderNumber: string; token: string; checkoutUrl: string | null; paymentStatus: Order["paymentStatus"] }
  | { ok: false; status: number; code: string; message: string; fieldErrors?: Record<string, string>; errors?: QuoteErrorItem[] };

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const inflight = new Map<string, Promise<Outcome>>();
const nowOf = (d: OrderDeps) => (d.now?.() ?? new Date());
export const tokenOk = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function buildPriceCtx(deps: OrderDeps): Promise<PriceCtx> {
  const [items, cats] = await Promise.all([deps.repo.listItems(), deps.repo.listCategories()]);
  return {
    items: new Map(items.map((i) => [i.id, i])), activeCategoryIds: new Set(cats.filter((c) => c.active).map((c) => c.id)),
    zones: deps.cfg.zones, pickups: deps.cfg.pickupLocations, promos: deps.cfg.promos, limits: deps.cfg.limits, now: nowOf(deps),
  };
}
export async function quote(deps: OrderDeps, body: unknown): Promise<QuoteResult> { return priceCart(body, await buildPriceCtx(deps)); }

function orderNumber(d: Date) {
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, "");
  return `EF-${ymd}-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}
const fingerprint = (v: CheckoutInput, q: Extract<QuoteResult, { ok: true }>) =>
  createHash("sha256").update(JSON.stringify({ c: v.customer, f: v.fulfilment, l: q.lines.map((l) => [l.itemId, l.variantName, l.addOns.map((a) => a.id), l.qty, l.unitKobo, l.note]), t: q.totalKobo })).digest("hex");

/** Starts (or resumes) a payment attempt. Never creates a second open session while one is still valid. */
function startAttempt(deps: OrderDeps, order: Order): Promise<Outcome> {
  return deps.repo.withLock(`order:${order.orderNumber}`, async () => startAttemptLocked(deps, (await deps.repo.findOrderByNumber(order.orderNumber)) ?? order));
}
async function startAttemptLocked(deps: OrderDeps, order: Order): Promise<Outcome> {
  const latest = order.attempts[order.attempts.length - 1];
  const view = (url: string | null): Outcome => ({ ok: true, orderNumber: order.orderNumber, token: order.publicToken, checkoutUrl: url, paymentStatus: order.paymentStatus });
  if (order.paymentStatus === "paid") return view(null);
  if (latest && (latest.status === "needs_review" || latest.status === "succeeded")) return { ok: false, status: 409, code: "PAYMENT_UNDER_REVIEW", message: "This order's payment needs review. Please contact us." };
  if (latest && latest.status === "open" && latest.checkoutUrl) return view(latest.checkoutUrl);

  let attempt = latest && latest.status === "initiating" ? latest : null;
  if (!attempt) {
    const n = order.attempts.length + 1;
    attempt = { reference: n === 1 ? order.orderNumber : `${order.orderNumber}-A${n}`, checkoutId: null, checkoutUrl: null, status: "initiating", chargeId: null, createdAt: nowOf(deps).toISOString(), error: null };
    order.attempts.push(attempt); order.paymentStatus = "pending";
  }
  await deps.repo.saveOrder(order);
  try {
    const s = await deps.gateway.createCheckout({
      reference: attempt.reference, amountKobo: order.totalKobo, customer: order.customer,
      successUrl: `${deps.siteUrl}/order/${order.orderNumber}/${order.publicToken}`, cancelUrl: `${deps.siteUrl}/checkout`,
      metadata: { order_number: order.orderNumber }, expiresInMinutes: 60,
    });
    attempt.checkoutId = s.checkoutId; attempt.checkoutUrl = s.checkoutUrl; attempt.status = "open"; attempt.error = null;
    await deps.repo.saveOrder(order);
    return view(s.checkoutUrl);
  } catch (e) {
    attempt.error = e instanceof GatewayError ? e.message : "Payment could not be started";
    await deps.repo.saveOrder(order);
    return { ok: false, status: 502, code: "PAYMENT_START_FAILED", message: "We couldn't start the payment. Nothing was charged. Please try again." };
  }
}

export function createCheckout(deps: OrderDeps, raw: unknown): Promise<Outcome> {
  const key = typeof (raw as any)?.idempotencyKey === "string" ? (raw as any).idempotencyKey : "";
  const run = () => doCreate(deps, raw);
  if (!key) return run();
  const existing = inflight.get(key); if (existing) return existing;   // same key in flight: share the result
  const p = run().finally(() => inflight.delete(key)); inflight.set(key, p); return p;
}

async function doCreate(deps: OrderDeps, raw: unknown): Promise<Outcome> {
  const v = validateCheckout(raw, nowOf(deps), deps.cfg);
  if (!v.ok) return { ok: false, status: 422, code: "VALIDATION_FAILED", message: "Please check the highlighted fields.", fieldErrors: v.fieldErrors };
  const input = v.value;
  const q = await quote(deps, { lines: input.lines, fulfilment: { type: input.fulfilment.type, zoneId: input.fulfilment.zoneId, pickupLocationId: input.fulfilment.pickupLocationId }, promoCode: input.promoCode });
  if (!q.ok) return { ok: false, status: 422, code: "CART_INVALID", message: q.errors[0].message, errors: q.errors };
  const fp = fingerprint(input, q);

  const prior = await deps.repo.findOrderByKey(input.idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== fp) return { ok: false, status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "This checkout changed. Please review your order and try again." };
    return startAttempt(deps, prior);
  }
  const now = nowOf(deps);
  const order: Order = {
    id: randomUUID(), orderNumber: orderNumber(now), publicToken: randomBytes(18).toString("base64url"), idempotencyKey: input.idempotencyKey, fingerprint: fp,
    customer: input.customer,
    fulfilment: { type: input.fulfilment.type, zoneId: q.zone?.id ?? null, zoneName: q.zone?.name ?? null, address: input.fulfilment.address, instructions: input.fulfilment.instructions, pickupLocationId: q.pickup?.id ?? null, pickupName: q.pickup?.name ?? null, scheduledFor: input.fulfilment.scheduledFor },
    lines: q.lines, subtotalKobo: q.subtotalKobo, deliveryFeeKobo: q.deliveryFeeKobo, discountKobo: q.discountKobo, promoCode: q.promoCode, totalKobo: q.totalKobo,
    status: "pending_payment", paymentStatus: "pending", attempts: [], notes: [], createdAt: now.toISOString(), updatedAt: now.toISOString(), paidAt: null,
  };
  for (let i = 0; ; i++) {
    try { await deps.repo.createOrder(order); break; }
    catch (e) {
      if (!(e instanceof UniqueViolation)) throw e;
      const again = await deps.repo.findOrderByKey(input.idempotencyKey);           // lost a race on the same key
      if (again) return again.fingerprint === fp ? startAttempt(deps, again) : { ok: false, status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "This checkout changed. Please try again." };
      if (i >= 5) throw e; order.orderNumber = orderNumber(now);                    // order-number collision
    }
  }
  return startAttempt(deps, order);
}

export async function retryPayment(deps: OrderDeps, number: string, token: string): Promise<Outcome> {
  const o = await deps.repo.findOrderByNumber(number);
  if (!o || !tokenOk(o.publicToken, token)) return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found." };
  if (o.status === "cancelled") return { ok: false, status: 409, code: "ORDER_CANCELLED", message: "This order was cancelled." };
  return startAttempt(deps, o);
}

export interface PublicOrder {
  orderNumber: string; status: Order["status"]; paymentStatus: Order["paymentStatus"]; createdAt: string; paidAt: string | null;
  customerName: string; phoneMasked: string; fulfilment: Order["fulfilment"]; lines: Order["lines"];
  subtotalKobo: number; deliveryFeeKobo: number; discountKobo: number; totalKobo: number; canRetryPayment: boolean;
}
export async function getPublicOrder(deps: OrderDeps, number: string, token: string): Promise<PublicOrder | null> {
  const o = await deps.repo.findOrderByNumber(number);
  if (!o || !tokenOk(o.publicToken, token)) return null;
  return {
    orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus, createdAt: o.createdAt, paidAt: o.paidAt, customerName: o.customer.name,
    phoneMasked: o.customer.phone.replace(/^(\+234)\d{6}(\d{4})$/, "$1******$2"), fulfilment: o.fulfilment, lines: o.lines,
    subtotalKobo: o.subtotalKobo, deliveryFeeKobo: o.deliveryFeeKobo, discountKobo: o.discountKobo, totalKobo: o.totalKobo,
    canRetryPayment: o.status === "pending_payment" && (o.paymentStatus === "failed" || o.paymentStatus === "expired"),
  };
}
