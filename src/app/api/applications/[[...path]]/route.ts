import { applicationsApi } from "@/server/voc/api";
import { getVocDeps } from "@/server/runtime";
import { readJson, sendOut, tooMany } from "@/server/route-utils";
type Ctx = { params: Promise<{ path?: string[] }> };
async function run(req: Request, ctx: Ctx) {
  const path = (await ctx.params).path ?? []; const l = req.method === "POST" ? tooMany(req, path.length ? "app-pay" : "app-create", path.length ? 30 : 10, 3600) : null; if (l) return l; const body = req.method === "GET" ? null : await readJson(req).catch(() => null);
  return sendOut(await applicationsApi(await getVocDeps(), req.method, path, body, new URL(req.url).searchParams));
}
export const GET = run; export const POST = run; export const PUT = run;
