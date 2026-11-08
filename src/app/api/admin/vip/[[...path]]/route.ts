import { adminGuard, readJson, sendOut } from "@/server/route-utils";
import { getRepo } from "@/server/runtime";
import { adminVipApi } from "@/server/vip/service";
type Ctx = { params: Promise<{ path?: string[] }> };
async function run(req: Request, ctx: Ctx) {
  const g = await adminGuard(req); if (g) return g;
  const path = (await ctx.params).path ?? []; const body = req.method === "GET" || req.method === "DELETE" ? null : await readJson(req, 65_536).catch(() => null);
  return sendOut(await adminVipApi(await getRepo(), req.method, path, body));
}
export const GET = run; export const POST = run; export const PUT = run; export const PATCH = run; export const DELETE = run;
