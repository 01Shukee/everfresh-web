import { getRepo } from "@/server/runtime";
import { adminGuard } from "@/server/route-utils";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await adminGuard(req); if (g) return g;
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const orders = await (await getRepo()).listOrders({ status, limit: 200 });
  return Response.json({ orders: orders.map(({ publicToken, idempotencyKey, fingerprint, ...o }) => o) }, { headers: { "Cache-Control": "no-store" } });
}
