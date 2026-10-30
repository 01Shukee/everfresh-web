import { setOrderStatus } from "@/server/admin-api";
import { allowedNext } from "@/server/status";
import { getRepo } from "@/server/runtime";
import { adminGuard, readJson, send } from "@/server/route-utils";
import type { OrderStatus } from "@/server/types";
type Ctx = { params: Promise<{ number: string }> };
const STATUSES = ["confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"];
export async function GET(req: Request, ctx: Ctx) {
  const g = await adminGuard(req); if (g) return g; const o = await (await getRepo()).findOrderByNumber((await ctx.params).number);
  if (!o) return Response.json({ error: "Order not found." }, { status: 404 });
  const { publicToken, idempotencyKey, fingerprint, ...rest } = o; return Response.json({ ...rest, allowedNext: allowedNext(o) });
}
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await adminGuard(req); if (g) return g; const b = (await readJson(req).catch(() => null)) as { status?: string } | null;
  if (!b?.status || !STATUSES.includes(b.status)) return Response.json({ error: "Invalid status." }, { status: 422 });
  return send(await setOrderStatus(await getRepo(), (await ctx.params).number, b.status as OrderStatus));
}
