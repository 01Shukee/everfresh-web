import type { Order, OrderStatus } from "./types";

const next: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "completed", "cancelled"],
  out_for_delivery: ["completed"],
  completed: [],
  cancelled: [],
};

export function allowedNext(o: Pick<Order, "status" | "fulfilment">): OrderStatus[] {
  return next[o.status].filter((s) => !(s === "out_for_delivery" && o.fulfilment.type !== "delivery"));
}
/** Pickup orders go ready -> completed; delivery orders go ready -> out_for_delivery -> completed. */
export function canTransition(o: Pick<Order, "status" | "fulfilment" | "paymentStatus">, to: OrderStatus): { ok: true } | { ok: false; reason: string } {
  if (!allowedNext(o).includes(to)) return { ok: false, reason: `Cannot move an order from ${o.status} to ${to}.` };
  if (o.status === "ready" && to === "completed" && o.fulfilment.type === "delivery") return { ok: false, reason: "Delivery orders go out for delivery first." };
  if (o.status === "pending_payment" && to !== "cancelled") return { ok: false, reason: "An unpaid order cannot be processed." };
  return { ok: true };
}
