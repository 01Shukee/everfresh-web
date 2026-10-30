import { cateringApi } from "@/server/catering/api";
import { getCateringDeps } from "@/server/runtime";
import { readJson, send, tooMany } from "@/server/route-utils";
type Ctx = { params: Promise<{ path?: string[] }> };
async function run(req: Request, ctx: Ctx) {
  const path = (await ctx.params).path ?? []; const l = req.method === "POST" && path.length === 1 ? tooMany(req, "enquiry", 10, 3600) : null; if (l) return l; const body = req.method === "GET" ? null : await readJson(req).catch(() => null);
  return send(await cateringApi(await getCateringDeps(), req.method, path, body, new URL(req.url).searchParams));
}
export const GET = run; export const POST = run;
