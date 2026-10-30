import type { ApiResult } from "./admin-api";
import { createCheckout, getPublicOrder, quote, retryPayment, type OrderDeps } from "./orders";

const asJson = (status: number, body: unknown): ApiResult => ({ status, body });

export async function handleMenu(deps: OrderDeps): Promise<ApiResult> {
  const [cats, items] = await Promise.all([deps.repo.listCategories(), deps.repo.listItems()]);
  const activeCats = cats.filter((c) => c.active);
  const ids = new Set(activeCats.map((c) => c.id));
  const c = deps.cfg;
  return asJson(200, {
    categories: activeCats.map(({ id, name, slug }) => ({ id, name, slug })),
    items: items.filter((i) => i.active && ids.has(i.categoryId)).map(({ active, createdAt, updatedAt, sort, ...i }) => i),
    ordering: {
      zones: c.zones.filter((z) => z.active).map(({ id, name, feeKobo, minOrderKobo }) => ({ id, name, feeKobo, minOrderKobo })),
      pickupLocations: c.pickupLocations.filter((p) => p.active).map(({ id, name, address }) => ({ id, name, address })),
      scheduling: c.scheduling, limits: { maxQtyPerLine: c.limits.maxQtyPerLine, maxNoteLen: c.limits.maxNoteLen },
    },
  });
}
export async function handleQuote(deps: OrderDeps, body: unknown): Promise<ApiResult> {
  const q = await quote(deps, body);
  if (!q.ok) return asJson(422, { errors: q.errors });
  return asJson(200, {
    lines: q.lines, subtotalKobo: q.subtotalKobo, deliveryFeeKobo: q.deliveryFeeKobo, discountKobo: q.discountKobo, promoCode: q.promoCode, totalKobo: q.totalKobo,
  });
}
export async function handleCheckout(deps: OrderDeps, body: unknown): Promise<ApiResult> {
  const r = await createCheckout(deps, body);
  if (r.ok) return asJson(200, { orderNumber: r.orderNumber, token: r.token, checkoutUrl: r.checkoutUrl, paymentStatus: r.paymentStatus });
  return asJson(r.status, { code: r.code, error: r.message, fieldErrors: r.fieldErrors, errors: r.errors });
}
export async function handleRetry(deps: OrderDeps, number: string, token: string): Promise<ApiResult> {
  const r = await retryPayment(deps, number, token);
  if (r.ok) return asJson(200, { checkoutUrl: r.checkoutUrl, paymentStatus: r.paymentStatus });
  return asJson(r.status, { code: r.code, error: r.message });
}
export async function handleOrder(deps: OrderDeps, number: string, token: string): Promise<ApiResult> {
  const o = await getPublicOrder(deps, number, token);
  return o ? asJson(200, o) : asJson(404, { error: "Order not found." });
}
