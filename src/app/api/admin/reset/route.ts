import { sameOrigin } from "@/server/auth/origin";
import { completeReset } from "@/server/auth/reset";
import { readJson, tooMany } from "@/server/route-utils";
import { env, getRepo } from "@/server/runtime";
export async function POST(req: Request) {
  if (!sameOrigin(req.headers.get("origin"), env.siteUrl())) return Response.json({ error: "Bad origin." }, { status: 403 });
  const l = tooMany(req, "reset", 10, 3600); if (l) return l; const b = (await readJson(req, 2048).catch(() => null)) as { token?: string; password?: string } | null;
  const r = await completeReset(await getRepo(), b?.token, b?.password); return Response.json(r.ok ? { ok: true } : { error: r.error }, { status: r.status });
}
