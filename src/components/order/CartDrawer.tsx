"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatNaira } from "@/lib/money";
import { useCart } from "./CartProvider";
import { Stepper } from "./Stepper";

export function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, quote, quoting, issues } = useCart();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const lineIssue = (i: number) => issues.find((x) => x.line === i)?.message;
  const price = (i: number, est: number, qty: number) => (quote && !quoting ? quote.lines[i]?.lineKobo : est * qty);
  return (
    <dialog ref={ref} className="drawer" aria-label="Your cart" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) setOpen(false); }}>
      <div className="drawer-in">
        <div className="drawer-head"><h2 className="serif">Your cart</h2><button className="pill ghost sm" onClick={() => setOpen(false)}>Close</button></div>
        {lines.length === 0 ? (
          <div className="empty"><p className="serif empty-title">Your cart is empty.</p><p>Add something from the menu.</p><Link href="/order-food" className="pill sm" onClick={() => setOpen(false)}>Browse the menu</Link></div>
        ) : (
          <>
            <ul className="cartlines">
              {lines.map((l, i) => (
                <li key={l.key} className={lineIssue(i) ? "bad" : ""}>
                  <div><b>{l.name}</b><div className="small dim0">{l.label}{l.note ? ` · "${l.note}"` : ""}</div>{lineIssue(i) && <div className="err" role="alert">{lineIssue(i)}</div>}</div>
                  <div className="cartright"><span className="tab">{formatNaira(price(i, l.estKobo, l.qty) ?? 0)}</span>
                    <Stepper value={l.qty} onChange={(n) => setQty(l.key, n)} label={`${l.name} quantity`} />
                    <button className="linkbtn" onClick={() => remove(l.key)} aria-label={`Remove ${l.name}`}>Remove</button></div>
                </li>
              ))}
            </ul>
            <div className="totals" aria-live="polite">
              {issues.filter((x) => x.line === undefined).map((x) => <p key={x.message} className="err" role="alert">{x.message}</p>)}
              <div><span>Subtotal</span><span className="tab">{quote ? formatNaira(quote.subtotalKobo) : "..."}</span></div>
              {quote && quote.discountKobo > 0 && <div><span>Discount</span><span className="tab">-{formatNaira(quote.discountKobo)}</span></div>}
              <div className="small dim0"><span>Delivery</span><span>Calculated at checkout</span></div>
              <div className="grand"><span>Total so far</span><span className="tab">{quote ? formatNaira(quote.totalKobo) : "..."}</span></div>
            </div>
            <Link href="/checkout" className={`pill block ${issues.length || !quote ? "disabled" : ""}`} aria-disabled={issues.length > 0 || !quote} onClick={(e) => { if (issues.length || !quote) e.preventDefault(); else setOpen(false); }}>Go to checkout</Link>
          </>
        )}
      </div>
    </dialog>
  );
}
