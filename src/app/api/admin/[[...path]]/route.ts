import { authApi } from "@/server/auth/api";
import { adminAuth, readJson, send } from "@/server/route-utils";
import { env, getRepo } from "@/server/runtime";
import { saveUpload } from "@/server/media";
import { getOrderingConfig, saveOrderingSettings } from "@/server/ordering-settings";
import { siteAdminApi } from "@/server/site/api";

type Ctx = { params: Promise<{ path?: string[] }> };
/** Catch-all for admin endpoints without their own route: me, users, audit (auth), site (content/settings), inbox, media (upload). Authorisation is by path inside adminAuth(). */
async function run(req: Request, ctx: Ctx) {
  const a = await adminAuth(req); if (!a.ok) return Response.json({ error: a.error }, { status: a.status });
  const path = (await ctx.params).path ?? []; const repo = await getRepo(); const q = new URL(req.url).searchParams;
  if (path[0] === "media") {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const len = Number(req.headers.get("content-length") ?? 0); if (len > 6 * 1024 * 1024) return Response.json({ error: "Images can be up to 5 MB." }, { status: 413 });
    let f: FormDataEntryValue | null = null; try { f = (await req.formData()).get("file"); } catch { /* not multipart */ }
    if (!f || typeof f === "string") return Response.json({ error: "Choose an image to upload." }, { status: 422 });
    let r; try { r = await saveUpload(repo, new Uint8Array(await f.arrayBuffer())); } catch { return Response.json({ error: "The photo could not be saved. Please try again." }, { status: 500 }); } return r.ok ? Response.json({ url: r.url }, { status: 201 }) : Response.json({ error: r.error }, { status: r.status });
  }
  const body = ["GET", "DELETE"].includes(req.method) ? null : await readJson(req, 262_144).catch(() => null);
  if (path[0] === "food" && path[1] === "settings") { if (req.method === "GET") { const c = await getOrderingConfig(repo); return Response.json({ zones: c.zones, pickupLocations: c.pickupLocations, scheduling: c.scheduling, promos: c.promos }); } if (req.method === "PUT") { const r = await saveOrderingSettings(repo, body); return r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: 422 }); } }
  if (["me", "users", "audit", "outbox"].includes(path[0])) { const r = await authApi(repo, a.user, req.method, path, body, env.adminSecret() ?? "", process.env.NODE_ENV === "production"); const res = send(r); if (r.cookie) res.headers.append("Set-Cookie", r.cookie); return res; }
  return send(await siteAdminApi(repo, req.method, path, body, q));
}
export const GET = run; export const POST = run; export const PUT = run; export const PATCH = run; export const DELETE = run;
