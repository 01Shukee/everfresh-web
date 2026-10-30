import { login, sessionCookie } from "@/server/auth";
import { clientId, readJson } from "@/server/route-utils";
import { env, getRepo } from "@/server/runtime";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(env.siteUrl()).origin) return Response.json({ error: "Bad origin." }, { status: 403 });
  const b = (await readJson(req).catch(() => null)) as { email?: string; password?: string; code?: string } | null;
  const r = await login(await getRepo(), { email: b?.email, password: b?.password, code: b?.code, ip: clientId(req), secret: env.adminSecret(), bootstrap: { email: env.adminEmail(), password: env.adminPassword() } });
  if (!r.ok) return Response.json({ error: r.error, need2fa: r.need2fa }, { status: r.status });
  return Response.json({ ok: true, mustChangePassword: r.user.mustChangePassword }, { headers: { "Set-Cookie": sessionCookie(r.token, process.env.NODE_ENV === "production") } });
}
