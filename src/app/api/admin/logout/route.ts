import { audit, clearCookie, readCookie, userFromCookie } from "@/server/auth";
import { env, getRepo } from "@/server/runtime";
export async function POST(req: Request) {
  const repo = await getRepo(); const u = await userFromCookie(repo, readCookie(req), env.adminSecret()); if (u) await audit(repo, { userId: u.id, email: u.email, action: "logout" });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie } });
}
