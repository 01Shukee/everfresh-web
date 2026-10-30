import { OrderLive } from "./OrderLive";
import { formatNaira } from "@/lib/money";
import type { PublicOrder } from "@/server/orders";

const PAY: Record<string, { t: string; d: string; tone: string }> = {
  paid: { t: "Payment received", d: "Your order is confirmed.", tone: "ok" },
  pending: { t: "Waiting for payment confirmation", d: "This page updates by itself. If you've already paid, it can take a moment to confirm.", tone: "wait" },
  failed: { t: "Payment didn't go through", d: "Nothing was charged for this attempt. You can try again.", tone: "bad" },
  expired: { t: "Payment session expired", d: "You haven't been charged. You can start the payment again.", tone: "bad" },
  needs_review: { t: "We're reviewing your payment", d: "Please keep your order number and contact us if you were charged.", tone: "wait" },
  refunded: { t: "Payment refunded", d: "This order was refunded in full.", tone: "wait" },
  partially_refunded: { t: "Payment partly refunded", d: "Part of this payment was refunded.", tone: "wait" },
};
const STATUS: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", preparing: "Preparing", ready: "Ready", out_for_delivery: "Out for delivery", completed: "Completed", cancelled: "Cancelled" };

export function OrderView({ o, token }: { o: PublicOrder; token: string }) {
  const p = PAY[o.paymentStatus] ?? PAY.pending; const f = o.fulfilment;
  return (
    <section className="wrap sec order">
      <span className="lab green">Order confirmation</span>
      <h1 className="serif page-title">Order <span className="ordnum">{o.orderNumber}</span></h1>
      <div className={`paybox ${p.tone}`} role="status"><b className="serif">{p.t}</b><span>{p.d}</span></div>
      <OrderLive number={o.orderNumber} token={token} paymentStatus={o.paymentStatus} canRetry={o.canRetryPayment} />
      <div className="co-grid">
        <div>
          <h2 className="serif">Summary</h2>
          <ul className="cartlines compact">{o.lines.map((l, i) => <li key={i}><span>{l.qty} × {l.name}<span className="small dim0 block">{[l.variantName, ...l.addOns.map((a) => a.name)].filter(Boolean).join(" · ") || "Standard"}{l.note ? ` · "${l.note}"` : ""}</span></span><span className="tab">{formatNaira(l.lineKobo)}</span></li>)}</ul>
          <div className="totals"><div><span>Subtotal</span><span className="tab">{formatNaira(o.subtotalKobo)}</span></div>
            {o.discountKobo > 0 && <div><span>Discount</span><span className="tab">-{formatNaira(o.discountKobo)}</span></div>}
            <div><span>Delivery</span><span className="tab">{f.type === "pickup" ? "Free (pickup)" : formatNaira(o.deliveryFeeKobo)}</span></div>
            <div className="grand"><span>Total</span><span className="tab">{formatNaira(o.totalKobo)}</span></div></div>
        </div>
        <div>
          <h2 className="serif">Fulfilment</h2>
          <dl className="dl"><dt>Order status</dt><dd>{STATUS[o.status]}</dd><dt>Method</dt><dd>{f.type === "delivery" ? `Delivery to ${f.zoneName ?? ""}` : `Pickup at ${f.pickupName ?? ""}`}</dd>
            {f.address && <><dt>Address</dt><dd>{f.address}</dd></>}{f.instructions && <><dt>Instructions</dt><dd>{f.instructions}</dd></>}
            <dt>When</dt><dd>{f.scheduledFor ? new Date(f.scheduledFor).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "As soon as possible"}</dd>
            <dt>Name</dt><dd>{o.customerName}</dd><dt>Phone</dt><dd>{o.phoneMasked}</dd></dl>
          <p className="small">Keep your order number. We&rsquo;ll use the phone number on this order if we need to reach you.</p>
        </div>
      </div>
    </section>
  );
}
