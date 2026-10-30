"use client";
import { useCart } from "./CartProvider";
export function CartButton() {
  const { count, setOpen } = useCart();
  return <button className="cartbtn" onClick={() => setOpen(true)} aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}><span aria-hidden="true">Cart</span><span className="cartn" aria-hidden="true">{count}</span></button>;
}
