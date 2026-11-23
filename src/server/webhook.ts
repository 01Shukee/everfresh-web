import { createHmac, timingSafeEqual } from "node:crypto";
import { decimalToKobo } from "../lib/money";
import type { Repo } from "./repo";
import type { Order, PaymentAttempt } from "./types";
import { handleVocEvent, vocClaims } from "./voc/payments";
import type { Application, Invoice } from "./voc/model";
import { baseRef } from "../lib/refs";
import { mailOrderPaid, mailPaymentReview, mailRefund, notifyStaff } from "./notify";

/** Which record this event changes; all events for one order/application/invoice are processed one at a time. */
async function lockKeyFor(ev: { id: string; data: Record<string, any> }, repo: Repo): Promise<string> {
  const d = ev.data ?? {}; const r = typeof d.reference === "string" ? d.reference : "";
  if (r.startsWith("VA-")) return `app:${baseRef(r)}`; if (r.startsWith("VI-")) return `inv:${baseRef(r)}`;
  if (typeof d.charge_id === "string") { const x = await repo.docGet<{ kind: "app" | "inv"; ref: string }>("idx", `charge:${d.charge_id}`); if (x) return `${x.kind}:${x.ref}`; const o = await repo.findOrderByChargeId(d.charge_id); if (o) return `order:${o.orderNumber}`; }
  if (r) { const o = await repo.findOrderByReference(r); if (o) return `order:${o.orderNumber}`; }
  return `event:${ev.id}`;
}
const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sign = (secret: string, t: string | number, raw: string) => createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");

/** Verifies X-Bachs-Signature-V2 (t=...,v1=...[,v1=...]) or legacy X-Bachs-Timestamp/X-Bachs-Signature against the RAW body. */
export function verifyBachsSignature(rawBody: string, headers: { get(n: string): string | null }, secrets: string[], nowMs = Date.now(), toleranceSec = 300): boolean {
  const v2 = headers.get("x-bachs-signature-v2");
  const pairs: [string, string][] = []; let t: string | null = null;
  if (v2) {
    for (const part of v2.split(",")) { const i = part.indexOf("="); if (i > 0) pairs.push([part.slice(0, i).trim(), part.slice(i + 1).trim()]); }
    t = pairs.find(([k]) => k === "t")?.[1] ?? null;
    var sigs = pairs.filter(([k]) => k === "v1").map(([, v]) => v);
  } else { t = headers.get("x-bachs-timestamp"); const s = headers.get("x-bachs-signature"); var sigs = s ? [s] : []; }
  if (!t || !/^\d{9,12}$/.test(t) || !sigs.length || !secrets.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
  return secrets.some((sec) => { const exp = sign(sec, t!, rawBody); return sigs.some((s) => eq(exp, s)); });
}

export interface WebhookResult { status: number; body: string }
const ok = (b = "ok"): WebhookResult => ({ status: 200, body: b });

/** An event type we do not act on (for example a crypto payment event): record it on the matching order, application or invoice so staff can see exactly what Bachs sent, and alert staff if it looks like a payment. */
async function noteUnhandled(repo: Repo, ev: { id: string; type: string; data: Record<string, any> }, now: string) {
  const d = ev.data ?? {}; const text = `Bachs event "${ev.type}" received and not acted on (status ${d.status ?? "?"}, ${d.currency ?? "?"} ${d.amount ?? "?"}).`;
  console.log("[bachs webhook] ignored event type:", ev.type, JSON.stringify({ reference: d.reference, status: d.status, currency: d.currency, amount: d.amount }));
  const r = typeof d.reference === "string" ? d.reference : ""; let where = "";
  if (r.startsWith("VA-")) { const a = await repo.docGet<Application>("app", baseRef(r)); if (a) { a.notes.push(`${now} ${text}`); await repo.docPut("app", a.ref, a); where = a.ref; } }
  else if (r.startsWith("VI-")) { const i = await repo.docGet<Invoice>("invoice", baseRef(r)); if (i) { i.notes.push(`${now} ${text}`); await repo.docPut("invoice", i.number, i); where = i.number; } }
  else if (r) { const o = await repo.findOrderByReference(r); if (o) { o.notes.push(`${now} ${text}`); await repo.saveOrder(o); where = o.orderNumber; } }
  if (where && /collection|payment|crypto|paid|succe|settle/i.test(ev.type)) await notifyStaff(repo, `Bachs event not handled: ${ev.type}`, `${text}\nRecord: ${where}\nCheck the payment in Bachs. If the money arrived, confirm it in the admin.`);
}

/** Webhooks are the only thing that can mark an order paid. Redirects never do. */
export async function handleBachsWebhook(raw: string, headers: { get(n: string): string | null }, deps: { repo: Repo; secrets: string[]; now?: () => Date }): Promise<WebhookResult> {
  if (!verifyBachsSignature(raw, headers, deps.secrets, (deps.now?.() ?? new Date()).getTime())) return { status: 400, body: "invalid signature" };
  let ev: any; try { ev = JSON.parse(raw); } catch { return { status: 400, body: "invalid json" }; }
  if (!ev || typeof ev.id !== "string" || typeof ev.type !== "string" || typeof ev.data !== "object" || !ev.data) return { status: 400, body: "invalid event" };
  const now = (deps.now?.() ?? new Date()).toISOString();
  const d = ev.data as Record<string, any>;

  const find = async (): Promise<{ order: Order; attempt: PaymentAttempt } | null> => {
    const order = (typeof d.reference === "string" && (await deps.repo.findOrderByReference(d.reference))) || (typeof d.charge_id === "string" && (await deps.repo.findOrderByChargeId(d.charge_id))) || null;
    if (!order) return null;
    const attempt = order.attempts.find((a) => a.reference === d.reference) ?? order.attempts.find((a) => a.chargeId && a.chargeId === d.charge_id);
    return attempt ? { order, attempt } : null;
  };
  const note = (o: Order, m: string) => o.notes.push(`${now} ${m}`);
  let paidNow = false; let refundKobo: number | null | undefined;

  const known = ["collection.succeeded", "collection.failed", "collection.underpaid", "checkout.expired", "refund.paid"];
  if (!known.includes(ev.type)) { await deps.repo.withLock(await lockKeyFor(ev, deps.repo), () => noteUnhandled(deps.repo, ev, now)).catch(() => {}); return ok("ignored"); }
  const lockKey = await lockKeyFor(ev, deps.repo);
  return deps.repo.withLock(lockKey, async (): Promise<WebhookResult> => {
  const isNew = await deps.repo.markEventSeen(ev.id, ev.type);
  if (!isNew) return ok("duplicate");
  try {

  if (await vocClaims(ev, deps.repo)) return await handleVocEvent(ev, deps.repo, deps.now?.() ?? new Date());
  const hit = await find();
  if (!hit) return ok("unknown reference");
  const { order, attempt } = hit; const beforePay = order.paymentStatus;

  switch (ev.type) {
    case "collection.succeeded": {
      const paidKobo = decimalToKobo(d.amount);
      attempt.chargeId = typeof d.charge_id === "string" ? d.charge_id : attempt.chargeId;
      if (order.paymentStatus === "paid" && order.attempts.some((a) => a !== attempt && a.status === "succeeded")) {
        attempt.status = "needs_review"; order.paymentStatus = "needs_review";
        note(order, `DUPLICATE CHARGE: a second payment (${d.charge_id ?? "no charge id"}) arrived for an already-paid order. Refund it in Bachs.`);
      } else if (d.currency !== "NGN" || paidKobo !== order.totalKobo) {
        attempt.status = "needs_review"; order.paymentStatus = "needs_review";
        note(order, `AMOUNT MISMATCH: expected NGN ${order.totalKobo / 100}, received ${d.currency} ${d.amount}. Not confirmed.`);
      } else if (d.status !== "SUCCEEDED") {
        attempt.status = "needs_review"; order.paymentStatus = "needs_review";
        note(order, `Payment status ${d.status} needs manual review before confirming.`);
      } else if (order.status === "cancelled") {
        attempt.status = "needs_review"; order.paymentStatus = "needs_review";
        note(order, "Payment received for a cancelled order. Refund it in Bachs.");
      } else {
        attempt.status = "succeeded"; order.paymentStatus = "paid"; paidNow = !order.paidAt; order.paidAt = order.paidAt ?? now;
        if (order.status === "pending_payment") order.status = "confirmed";
      }
      break;
    }
    case "collection.failed":
      attempt.status = attempt.status === "succeeded" ? "succeeded" : "failed";
      if (order.paymentStatus !== "paid" && attempt.reference === order.attempts[order.attempts.length - 1].reference) { attempt.error = String(d.reason ?? "Payment failed"); order.paymentStatus = "failed"; note(order, `Payment attempt failed: ${attempt.error}`); }
      break;
    case "checkout.expired":
      if (attempt.status === "open" || attempt.status === "initiating") attempt.status = "expired";
      if (order.paymentStatus === "pending" && attempt.reference === order.attempts[order.attempts.length - 1].reference) order.paymentStatus = "expired";
      break;
    case "collection.underpaid":
      attempt.status = "needs_review"; if (order.paymentStatus !== "paid") order.paymentStatus = "needs_review";
      note(order, "Customer underpaid. Review in Bachs before confirming."); break;
    case "refund.paid": {
      const refunded = decimalToKobo(d.refunded_amount);
      order.paymentStatus = refunded !== null && refunded >= order.totalKobo ? "refunded" : "partially_refunded";
      note(order, `Refund ${d.refund_id ?? ""} paid (${d.refunded_amount ?? "?"}).`); refundKobo = refunded; break;
    }
  }
  order.updatedAt = now;
  await deps.repo.saveOrder(order);
  if (paidNow) await mailOrderPaid(deps.repo, order);
  if (beforePay !== "needs_review" && order.paymentStatus === "needs_review") await mailPaymentReview(deps.repo, { to: order.customer.email, name: order.customer.name, ref: order.orderNumber, what: "order", detail: order.notes[order.notes.length - 1] ?? "", path: `/order/${order.orderNumber}/${order.publicToken}` });
  if (refundKobo !== undefined) await mailRefund(deps.repo, { kind: "order", to: order.customer.email, name: order.customer.name, ref: order.orderNumber, what: "order", amountKobo: refundKobo, refundId: typeof d.refund_id === "string" ? d.refund_id : null, totalKobo: order.totalKobo, path: `/order/${order.orderNumber}/${order.publicToken}` });
  return ok();
  } catch (e) { await deps.repo.unmarkEvent(ev.id).catch(() => {}); throw e; }
  });
}