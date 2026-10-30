import type { Metadata } from "next";
import { CheckoutForm } from "@/components/order/CheckoutForm";
export const metadata: Metadata = { title: "Checkout", description: "Review your order and pay securely.", robots: { index: false, follow: false } };
export default function CheckoutPage() {
  return <section className="wrap sec"><span className="lab green">Checkout</span><h1 className="serif page-title">Almost there.</h1><CheckoutForm /></section>;
}
