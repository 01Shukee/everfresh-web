import type { Kobo } from "../lib/money";
import type { DeliveryZone, MenuItem, OrderLine, PickupLocation, PromoCode } from "./types";

export interface QuoteReq {
  lines: { itemId: string; variantId?: string | null; qty: number; addOnIds?: string[]; note?: string }[];
  fulfilment?: { type: "delivery" | "pickup"; zoneId?: string | null; pickupLocationId?: string | null };
  promoCode?: string | null;
}
export interface QuoteErrorItem { code: string; message: string; line?: number }
export type QuoteResult =
  | { ok: true; lines: OrderLine[]; subtotalKobo: Kobo; deliveryFeeKobo: Kobo; discountKobo: Kobo; promoCode: string | null; totalKobo: Kobo; zone: DeliveryZone | null; pickup: PickupLocation | null }
  | { ok: false; errors: QuoteErrorItem[] };
export interface PriceCtx {
  items: Map<string, MenuItem>; activeCategoryIds: Set<string>;
  zones: DeliveryZone[]; pickups: PickupLocation[]; promos: PromoCode[];
  limits: { maxQtyPerLine: number; maxLines: number; maxNoteLen: number }; now: Date;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Server-side pricing. Prices come ONLY from the catalog; any price sent by a client is ignored. */
export function priceCart(raw: unknown, ctx: PriceCtx): QuoteResult {
  const errors: QuoteErrorItem[] = [];
  const err = (code: string, message: string, line?: number) => errors.push({ code, message, line });
  if (!isRec(raw) || !Array.isArray(raw.lines) || raw.lines.length === 0) return { ok: false, errors: [{ code: "EMPTY_CART", message: "Your cart is empty." }] };
  if (raw.lines.length > ctx.limits.maxLines) return { ok: false, errors: [{ code: "TOO_MANY_LINES", message: `A cart can hold up to ${ctx.limits.maxLines} lines.` }] };

  const lines: OrderLine[] = [];
  raw.lines.forEach((l: unknown, i: number) => {
    if (!isRec(l)) return err("LINE_INVALID", "Invalid cart line.", i);
    const qty = l.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > ctx.limits.maxQtyPerLine) return err("QTY_INVALID", `Quantity must be a whole number from 1 to ${ctx.limits.maxQtyPerLine}.`, i);
    const item = typeof l.itemId === "string" ? ctx.items.get(l.itemId) : undefined;
    if (!item) return err("ITEM_NOT_FOUND", "An item in your cart is no longer on the menu.", i);
    if (!item.active || !ctx.activeCategoryIds.has(item.categoryId)) return err("ITEM_UNAVAILABLE", `${item.name} is not available.`, i);
    if (!item.available) return err("ITEM_UNAVAILABLE", `${item.name} is sold out.`, i);

    let unit: Kobo = item.basePriceKobo, variantName: string | null = null;
    const variantId = str(l.variantId) ?? null;
    if (item.variants.length) {
      if (!variantId) return err("VARIANT_REQUIRED", `Choose a size for ${item.name}.`, i);
      const v = item.variants.find((x) => x.id === variantId);
      if (!v) return err("VARIANT_INVALID", `That size is not available for ${item.name}.`, i);
      unit = v.priceKobo; variantName = v.name;
    } else if (variantId) return err("VARIANT_INVALID", `${item.name} has no size options.`, i);

    const ids = Array.isArray(l.addOnIds) ? l.addOnIds : [];
    if (!ids.every((x) => typeof x === "string") || new Set(ids).size !== ids.length) return err("ADDON_INVALID", "Invalid add-ons.", i);
    const chosen: OrderLine["addOns"] = [];
    let bad = false;
    for (const g of item.addOnGroups) {
      const sel = g.options.filter((o) => (ids as string[]).includes(o.id));
      if (sel.some((o) => !o.available)) { err("ADDON_UNAVAILABLE", `An add-on in ${g.name} is unavailable.`, i); bad = true; }
      if (sel.length < g.min) { err("ADDON_GROUP_MIN", `Choose at least ${g.min} for ${g.name}.`, i); bad = true; }
      if (sel.length > g.max) { err("ADDON_GROUP_MAX", `Choose at most ${g.max} for ${g.name}.`, i); bad = true; }
      sel.forEach((o) => chosen.push({ id: o.id, name: o.name, priceKobo: o.priceKobo }));
    }
    if (chosen.length !== ids.length) { err("ADDON_INVALID", "An add-on is not valid for this item.", i); bad = true; }
    if (bad) return;
    const note = str(l.note)?.trim().slice(0, ctx.limits.maxNoteLen) || null;
    unit += chosen.reduce((s, a) => s + a.priceKobo, 0);
    lines.push({ itemId: item.id, name: item.name, variantName, addOns: chosen, qty, unitKobo: unit, lineKobo: unit * qty, note });
  });
  if (errors.length) return { ok: false, errors };

  const subtotal = lines.reduce((s, l) => s + l.lineKobo, 0);
  let delivery = 0, zone: DeliveryZone | null = null, pickup: PickupLocation | null = null;
  const f = raw.fulfilment;
  if (isRec(f)) {
    if (f.type === "delivery") {
      zone = ctx.zones.find((z) => z.id === f.zoneId && z.active) ?? null;
      if (!zone) err("ZONE_INVALID", "Choose a delivery area.");
      else if (subtotal < zone.minOrderKobo) err("MIN_ORDER", "Your order is below the minimum for this delivery area.");
      else delivery = zone.feeKobo;
    } else if (f.type === "pickup") {
      pickup = ctx.pickups.find((p) => p.id === f.pickupLocationId && p.active) ?? null;
      if (!pickup) err("PICKUP_INVALID", "Choose a pickup location.");
    } else err("FULFILMENT_INVALID", "Choose delivery or pickup.");
  }

  let discount = 0, promoUsed: string | null = null;
  const code = str(raw.promoCode)?.trim().toUpperCase();
  if (code) {
    const p = ctx.promos.find((x) => x.code.toUpperCase() === code);
    if (!p || !p.active || (p.expiresAt && new Date(p.expiresAt) <= ctx.now)) err("PROMO_INVALID", "That promo code is not valid.");
    else if (subtotal < p.minOrderKobo) err("PROMO_MIN", "Your order is below the minimum for this promo code.");
    else {
      discount = p.type === "percent" ? Math.floor((subtotal * p.value) / 100) : p.value;
      if (p.maxDiscountKobo !== undefined) discount = Math.min(discount, p.maxDiscountKobo);
      discount = Math.min(Math.max(discount, 0), subtotal);
      promoUsed = p.code;
    }
  }
  if (errors.length) return { ok: false, errors };
  const total = subtotal - discount + delivery;
  if (!Number.isSafeInteger(total) || total <= 0) return { ok: false, errors: [{ code: "TOTAL_INVALID", message: "The order total is not valid." }] };
  return { ok: true, lines, subtotalKobo: subtotal, deliveryFeeKobo: delivery, discountKobo: discount, promoCode: promoUsed, totalKobo: total, zone, pickup };
}
