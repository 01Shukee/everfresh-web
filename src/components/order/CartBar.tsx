"use client";
import { formatNaira } from "@/lib/money";
import { useCart } from "./CartProvider";

/** Floating "View cart" bar for phones: stays at the bottom of the menu once something is in the cart (hidden on wider screens, where the header Cart button is used). */
export function CartBar() {
  const { lines, count, quote, quoting, setOpen } = useCart();
  if (!count) return null;
  const total = quote && !quoting ? quote.subtotalKobo : lines.reduce((s, l) => s + l.estKobo * l.qty, 0);
  return (
    <div className="cartbar">
      <button type="button" onClick={() => setOpen(true)} aria-label={`View cart, ${count} item${count === 1 ? "" : "s"}, ${formatNaira(total)}`}>
        <span className="cb-count" aria-hidden="true">{count}</span><span className="cb-lab" aria-hidden="true">View cart</span><span className="tab" aria-hidden="true">{formatNaira(total)}</span>
      </button>
    </div>
  );
}
