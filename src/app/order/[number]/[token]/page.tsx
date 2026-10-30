import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/order/OrderView";
import { getPublicOrder } from "@/server/orders";
import { getDeps } from "@/server/runtime";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ number: string; token: string }> }) {
  const { number, token } = await params;
  const o = await getPublicOrder(await getDeps(), number, token); if (!o) notFound();
  return <OrderView o={o} token={token} />;
}
