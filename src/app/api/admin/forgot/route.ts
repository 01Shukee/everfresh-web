import { sameOrigin } from "@/server/auth/origin";
import { requestReset } from "@/server/auth/reset";
import { readJson, tooMany } from "@/server/route-utils";
import { env, getRepo } from "@/server/runtime";
export async function POST(req: Request) {
  if (!sameOrigin(req.headers.get("origin"), env.siteUrl())) return Response.json({ error: "Bad origin." }, { status: 403 });
  const l = tooMany(req, "forgot", 5, 3600); if (l) return l; const b = (await readJson(req, 2048).catch(() => null)) as { email?: string } | null;
  return Response.json(await requestReset(await getRepo(), b?.email));
}
