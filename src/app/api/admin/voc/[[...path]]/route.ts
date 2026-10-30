import { adminVocApi } from "@/server/voc/api";
import { getVocDeps } from "@/server/runtime";
import { adminGuard, readJson, sendOut } from "@/server/route-utils";
type Ctx = { params: Promise<{ path?: string[] }> };
async function run(req: Request, ctx: Ctx) {
  const g = await adminGuard(req); if (g) return g;
  const path = (await ctx.params).path ?? []; const body = req.method === "GET" || req.method === "DELETE" ? null : await readJson(req, 262_144).catch(() => null);
  return sendOut(await adminVocApi(await getVocDeps(), req.method, path, body, new URL(req.url).searchParams));
}
export const GET = run; export const POST = run; export const PUT = run; export const PATCH = run; export const DELETE = run;
