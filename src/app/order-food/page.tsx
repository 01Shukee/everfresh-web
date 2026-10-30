import type { Metadata } from "next";
import { OrderFoodView } from "@/components/order/OrderFoodView";
import { handleMenu } from "@/server/api";
import { getDeps } from "@/server/runtime";

export const metadata: Metadata = { title: "Order Food", description: "Browse the Everfresh menu, choose delivery or pickup, and pay securely online." };
export const dynamic = "force-dynamic";

export default async function OrderFoodPage() {
  const { body } = (await handleMenu(await getDeps())) as { body: React.ComponentProps<typeof OrderFoodView>["body"] };
  return <OrderFoodView body={body} />;
}
