import { authApi } from "@/server/auth/api";
import { adminAuth, readJson, send } from "@/server/route-utils";
import { env, getRepo } from "@/server/runtime";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_CAPTIONS_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, blobEnabled, saveCaptions, saveImage, saveVideo } from "@/server/media";
import { getOrderingConfig, saveOrderingSettings } from "@/server/ordering-settings";
import { siteAdminApi } from "@/server/site/api";

type Ctx = { params: Promise<{ path?: string[] }> };
const err = (error: string, status: number) => Response.json({ error }, { status });
/** Reads the uploaded "file" field of a multipart request, refusing oversized bodies before they are buffered. */
async function readFile(req: Request, maxBytes: number, what: string): Promise<{ bytes: Uint8Array } | Response> {
  const len = Number(req.headers.get("content-length") ?? 0); if (len > maxBytes + 1024 * 1024) return err(`${what} are too large.`, 413);
  let f: FormDataEntryValue | null = null; try { f = (await req.formData()).get("file"); } catch { /* not multipart */ }
  if (!f || typeof f === "string") return err("Choose a file to upload.", 422);
  return { bytes: new Uint8Array(await f.arrayBuffer()) };
}
/** Uploads. POST /media = photo; POST /media/video = video (browser-to-Blob token when Blob is configured, otherwise multipart to local disk); POST /media/captions = WebVTT. GET /media reports where files are stored. */
async function media(req: Request, path: string[]) {
  const kind = path[1];
  if (req.method === "GET" && !kind) return Response.json({ storage: blobEnabled() ? "blob" : "disk", maxVideoBytes: MAX_VIDEO_BYTES }, { headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return err("Method not allowed.", 405);
  if (path.length > 2 || (kind !== undefined && kind !== "video" && kind !== "captions")) return err("Not found.", 404);
  if (kind === "video" && (req.headers.get("content-type") ?? "").includes("application/json")) {
    // Large videos cannot pass through a serverless function (about 4.5 MB request limit), so the browser uploads straight to Vercel Blob with a short-lived token issued here, for staff only.
    if (!blobEnabled()) return err("Direct video upload needs Vercel Blob storage (BLOB_READ_WRITE_TOKEN).", 501);
    try {
      const body = (await req.json()) as HandleUploadBody;
      const r = await handleUpload({ request: req, body, onBeforeGenerateToken: async (pathname) => {
        if (!/^videos\/[a-f0-9]{32}\.(mp4|webm)$/.test(pathname)) throw new Error("Invalid file name.");
        return { allowedContentTypes: ["video/mp4", "video/webm"], maximumSizeInBytes: MAX_VIDEO_BYTES, addRandomSuffix: false, allowOverwrite: false };
      } });
      return Response.json(r);
    } catch (e) { return err(e instanceof Error ? e.message : "Upload could not be started.", 400); }
  }
  const limit = kind === "video" ? MAX_VIDEO_BYTES : kind === "captions" ? MAX_CAPTIONS_BYTES : MAX_IMAGE_BYTES;
  const f = await readFile(req, limit, kind === "video" ? "Videos" : kind === "captions" ? "Captions files" : "Images"); if (f instanceof Response) return f;
  const r = kind === "video" ? await saveVideo(f.bytes) : kind === "captions" ? await saveCaptions(f.bytes) : await saveImage(f.bytes);
  return r.ok ? Response.json({ url: r.url }, { status: 201 }) : err(r.error, r.status);
}

/** Catch-all for admin endpoints without their own route: me, users, audit (auth), site (content/settings), inbox, media (photo, video and captions upload). Authorisation is by path inside adminAuth(). */
async function run(req: Request, ctx: Ctx) {
  const a = await adminAuth(req); if (!a.ok) return Response.json({ error: a.error }, { status: a.status });
  const path = (await ctx.params).path ?? []; const repo = await getRepo(); const q = new URL(req.url).searchParams;
  if (path[0] === "media") return media(req, path);
  const body = ["GET", "DELETE"].includes(req.method) ? null : await readJson(req, 262_144).catch(() => null);
  if (path[0] === "food" && path[1] === "settings") { if (req.method === "GET") { const c = await getOrderingConfig(repo); return Response.json({ zones: c.zones, pickupLocations: c.pickupLocations, scheduling: c.scheduling, promos: c.promos }); } if (req.method === "PUT") { const r = await saveOrderingSettings(repo, body); return r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: 422 }); } }
  if (["me", "users", "audit", "outbox"].includes(path[0])) { const r = await authApi(repo, a.user, req.method, path, body, env.adminSecret() ?? "", process.env.NODE_ENV === "production"); const res = send(r); if (r.cookie) res.headers.append("Set-Cookie", r.cookie); return res; }
  return send(await siteAdminApi(repo, req.method, path, body, q));
}
export const GET = run; export const POST = run; export const PUT = run; export const PATCH = run; export const DELETE = run;