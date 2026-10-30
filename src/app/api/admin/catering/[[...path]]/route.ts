import { adminCateringApi } from "@/server/catering/api";
import { getCateringDeps } from "@/server/runtime";
import { adminGuard, readJson, send } from "@/server/route-utils";
type Ctx = { params: Promise<{ path?: string[] }> };
async function run(req: Request, ctx: Ctx) {
  const g = await adminGuard(req); if (g) return g;
  const path = (await ctx.params).path ?? []; const body = ["GET", "DELETE"].includes(req.method) ? null : await readJson(req, 131_072).catch(() => null);
  return send(await adminCateringApi(await getCateringDeps(), req.method, path, body, new URL(req.url).searchParams));
}
export const GET = run; export const POST = run; export const PUT = run; export const DELETE = run;
