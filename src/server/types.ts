import type { Kobo } from "../lib/money";

export interface Category { id: string; name: string; slug: string; sort: number; active: boolean }
export interface Variant { id: string; name: string; priceKobo: Kobo }
export interface AddOn { id: string; name: string; priceKobo: Kobo; available: boolean }
export interface AddOnGroup { id: string; name: string; min: number; max: number; options: AddOn[] }
export interface MenuItem {
  id: string; categoryId: string; name: string; description: string;
  basePriceKobo: Kobo; variants: Variant[]; addOnGroups: AddOnGroup[]; tags: string[];
  imageUrl: string | null; imageAlt: string;
  active: boolean;     // false = disabled/hidden from customers
  available: boolean;  // false = visible but "sold out"
  sort: number; createdAt: string; updatedAt: string;
}
export interface DeliveryZone { id: string; name: string; feeKobo: Kobo; minOrderKobo: Kobo; active: boolean }
export interface PickupLocation { id: string; name: string; address: string; active: boolean }
export interface PromoCode { code: string; type: "percent" | "fixed"; value: number; minOrderKobo: Kobo; maxDiscountKobo?: Kobo; active: boolean; expiresAt?: string }

export type OrderStatus = "pending_payment" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "needs_review" | "refunded" | "partially_refunded";
export type AttemptStatus = "initiating" | "open" | "succeeded" | "failed" | "expired" | "needs_review";

export interface OrderLine {
  itemId: string; name: string; variantName: string | null;
  addOns: { id: string; name: string; priceKobo: Kobo }[];
  qty: number; unitKobo: Kobo; lineKobo: Kobo; note: string | null;
}
export interface PaymentAttempt {
  reference: string; checkoutId: string | null; checkoutUrl: string | null; status: AttemptStatus;
  chargeId: string | null; createdAt: string; error: string | null;
}
export interface Order {
  id: string; orderNumber: string; publicToken: string; idempotencyKey: string; fingerprint: string;
  customer: { name: string; phone: string; email: string };
  fulfilment: { type: "delivery" | "pickup"; zoneId: string | null; zoneName: string | null; address: string | null; instructions: string | null; pickupLocationId: string | null; pickupName: string | null; scheduledFor: string | null };
  lines: OrderLine[];
  subtotalKobo: Kobo; deliveryFeeKobo: Kobo; discountKobo: Kobo; promoCode: string | null; totalKobo: Kobo;
  status: OrderStatus; paymentStatus: PaymentStatus; attempts: PaymentAttempt[];
  notes: string[]; createdAt: string; updatedAt: string; paidAt: string | null;
}
