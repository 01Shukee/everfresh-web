import type { ApiResult } from "../admin-api";
import { ROLES, ROLE_MODULES, type Role } from "../../lib/permissions";
import type { Repo } from "../repo";
import { flushOutbox, listOutbox, mailerFromEnv } from "../email";
import { base32, newRecoveryCodes, newSecret, openSecret, otpauthUri, sealSecret, unbase32, verifyTotp } from "./totp";
import { audit, createUser, requires2fa, hashPassword, listAudit, passwordProblem, publicUser, sessionCookie, signSession, verifyPassword, type User } from "./index";

const j = (status: number, body: unknown): ApiResult => ({ status, body });
const meView = (u: User) => ({ ...publicUser(u), permissions: ROLE_MODULES[u.role], needs2fa: requires2fa(u), twoFactorRequired: (process.env.REQUIRE_2FA_ROLES ?? "owner,manager").split(",").map((x: string) => x.trim()).includes(u.role) });

/** /api/admin/me, /api/admin/users, /api/admin/audit. Callers have already been authorised by path (users/audit are owner-only). */
export async function authApi(repo: Repo, me: User, method: string, path: string[], body: any, secret: string, prod: boolean): Promise<ApiResult & { cookie?: string }> {
  const [r, id, sub] = path;
  if (r === "me") {
    if (!id && method === "GET") return j(200, meView(me));
    if (id === "2fa" && method === "POST") {
      const u = (await repo.docGet<User>("user", me.id))!; const act = path[2];
      if (act === "setup") { if (u.totp?.enabled) return j(409, { error: "Two-factor sign-in is already on." }); const sec = newSecret(); u.totp = { secret: sealSecret(sec, secret), enabled: false, lastStep: 0, recovery: [] }; await repo.docPut("user", u.id, u); return j(200, { secret: base32(sec), uri: otpauthUri(u.email, sec) }); }
      if (act === "enable") {
        if (!u.totp || u.totp.enabled) return j(409, { error: "Start the setup first." }); const sec = openSecret(u.totp.secret, secret); const step = sec ? verifyTotp(sec, String(body?.code ?? "").trim(), Date.now(), 0) : null;
        if (step === null) return j(422, { error: "That code is not correct. Check the time on your phone and try again." }); const rc = newRecoveryCodes(); u.totp = { ...u.totp, enabled: true, lastStep: step, recovery: rc.hashes }; await repo.docPut("user", u.id, u); await audit(repo, { userId: u.id, email: u.email, action: "2fa_enabled" }); return j(200, { recoveryCodes: rc.codes });
      }
      if (act === "disable") {
        if ((process.env.REQUIRE_2FA_ROLES ?? "owner,manager").split(",").map((x: string) => x.trim()).includes(u.role)) return j(403, { error: "Two-factor sign-in is required for your role." });
        if (!u.totp?.enabled || !(await verifyPassword(String(body?.password ?? ""), u.passwordHash))) return j(403, { error: "Your password is not correct." }); const sec = openSecret(u.totp.secret, secret); if (!sec || verifyTotp(sec, String(body?.code ?? "").trim(), Date.now(), u.totp.lastStep) === null) return j(403, { error: "The code is not correct." });
        u.totp = null; await repo.docPut("user", u.id, u); await audit(repo, { userId: u.id, email: u.email, action: "2fa_disabled" }); return j(200, { ok: true });
      }
    }
    if (id === "password" && method === "POST") {
      if (!(await verifyPassword(String(body?.current ?? ""), me.passwordHash))) return j(403, { error: "Your current password is not correct." });
      const pp = passwordProblem(body?.next, me.email); if (pp) return j(422, { error: pp }); if (body.next === body.current) return j(422, { error: "Choose a different password." });
      const u = (await repo.docGet<User>("user", me.id))!; u.passwordHash = await hashPassword(body.next); u.sessionVersion++; u.mustChangePassword = false; await repo.docPut("user", u.id, u); await audit(repo, { userId: u.id, email: u.email, action: "password_changed" });
      return { ...j(200, { ok: true }), cookie: sessionCookie(signSession(secret, u), prod) };
    }
  }
  if (r === "users") {
    const users = (await repo.docList<User>("user")).filter((u) => !!(u as any).passwordHash);
    if (!id && method === "GET") return j(200, { users: users.map(publicUser).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
    if (!id && method === "POST") {
      const u = await createUser(repo, { email: String(body?.email ?? ""), name: String(body?.name ?? ""), role: body?.role as Role, password: String(body?.password ?? "") }); if ("error" in u) return j(422, { error: u.error });
      await audit(repo, { userId: me.id, email: me.email, action: "user_created", target: `${u.email} (${u.role})` }); return j(201, publicUser(u));
    }
    const target = users.find((u) => u.id === id); if (!target) return j(404, { error: "User not found." });
    const activeOwners = users.filter((u) => u.role === "owner" && u.active);
    if (!sub && method === "PUT") {
      const role = body?.role ?? target.role; const active = body?.active ?? target.active; if (!ROLES.includes(role) || typeof active !== "boolean") return j(422, { error: "Invalid role or status." });
      if (target.id === me.id && (role !== target.role || active !== target.active)) return j(409, { error: "You can't change your own role or disable your own account." });
      if (target.role === "owner" && (role !== "owner" || !active) && activeOwners.length <= 1) return j(409, { error: "There must always be one active owner." });
      const before = `${target.role}/${target.active}`; target.role = role; target.active = active; target.name = typeof body?.name === "string" && body.name.trim().length >= 2 ? body.name.trim().slice(0, 80) : target.name; target.sessionVersion++; // role changes and disabling take effect immediately
      await repo.docPut("user", target.id, target); await audit(repo, { userId: me.id, email: me.email, action: "user_updated", target: `${target.email}: ${before} -> ${role}/${active}` }); return j(200, publicUser(target));
    }
    if (sub === "reset-password" && method === "POST") {
      const pp = passwordProblem(body?.password, target.email); if (pp) return j(422, { error: pp }); target.passwordHash = await hashPassword(body.password); target.sessionVersion++; target.mustChangePassword = true; target.lockedUntil = 0; target.failed = { count: 0, firstAt: 0 };
      await repo.docPut("user", target.id, target); await audit(repo, { userId: me.id, email: me.email, action: "password_reset", target: target.email }); return j(200, { ok: true });
    }
    if (sub === "reset-2fa" && method === "POST") { target.totp = null; target.sessionVersion++; await repo.docPut("user", target.id, target); await audit(repo, { userId: me.id, email: me.email, action: "2fa_reset", target: target.email }); return j(200, { ok: true }); }
    if (sub === "revoke-sessions" && method === "POST") { target.sessionVersion++; await repo.docPut("user", target.id, target); await audit(repo, { userId: me.id, email: me.email, action: "sessions_revoked", target: target.email }); return j(200, { ok: true }); }
  }
  if (r === "outbox") { if (method === "GET") return j(200, { configured: !!mailerFromEnv(), items: await listOutbox(repo) }); if (method === "POST") return j(200, await flushOutbox(repo, mailerFromEnv(), 50)); }
  if (r === "audit" && method === "GET") return j(200, { entries: await listAudit(repo) });
  return j(404, { error: "Not found." });
}
