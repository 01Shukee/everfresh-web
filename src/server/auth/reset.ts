import { createHash, randomBytes } from "node:crypto";
import { rateLimit } from "../ratelimit";
import type { Repo } from "../repo";
import { sendRaw } from "../notify";
import { audit, hashPassword, passwordProblem, type User } from "./index";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const site = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const RESET_MINUTES = 30;
/** Always answers the same way. The reset token is emailed once; only its SHA-256 hash is stored. */
export async function requestReset(repo: Repo, rawEmail: unknown, now = Date.now()): Promise<{ ok: true; message: string }> {
  const generic = { ok: true as const, message: "If that email belongs to a staff account, we have sent a reset link. It works for 30 minutes." };
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : ""; if (!email || email.length > 120 || !rateLimit(`reset:${email}`, 3, 3600_000, now)) return generic;
  const idx = await repo.docGet<{ id: string }>("user", `email:${email}`); const u = idx ? await repo.docGet<User>("user", idx.id) : null; if (!u || !u.active) return generic;
  const token = randomBytes(32).toString("base64url"); await repo.docPut("idx", `reset:${sha(token)}`, { userId: u.id, exp: now + RESET_MINUTES * 60_000 });
  await sendRaw(repo, { to: u.email, kind: "reset", subject: "Reset your Everfresh staff password", text: `Hello ${u.name},\n\nUse this link within ${RESET_MINUTES} minutes to choose a new password:\n${site()}/admin/reset/${token}\n\nIf you did not ask for this, ignore this email; your password has not changed.\n\nEverfresh Creations Ltd` });
  await audit(repo, { userId: u.id, email: u.email, action: "password_reset_requested" }); return generic;
}
export async function completeReset(repo: Repo, token: unknown, password: unknown, now = Date.now()): Promise<{ status: number; error?: string; ok?: true }> {
  if (typeof token !== "string" || token.length < 30 || token.length > 100) return { status: 400, error: "This reset link is not valid or has expired." };
  const key = `reset:${sha(token)}`; const r = await repo.docGet<{ userId: string; exp: number }>("idx", key); if (!r || r.exp < now) return { status: 400, error: "This reset link is not valid or has expired." };
  return repo.withLock(`user:${r.userId}`, async () => {
    if (!(await repo.docGet("idx", key))) return { status: 400, error: "This reset link is not valid or has expired." };
    const u = await repo.docGet<User>("user", r.userId); if (!u || !u.active) return { status: 400, error: "This reset link is not valid or has expired." };
    const pp = passwordProblem(password, u.email); if (pp) return { status: 422, error: pp };
    u.passwordHash = await hashPassword(password as string); u.sessionVersion++; u.mustChangePassword = false; u.lockedUntil = 0; u.failed = { count: 0, firstAt: 0 };
    await repo.docPut("user", u.id, u); await repo.docDelete("idx", key); await audit(repo, { userId: u.id, email: u.email, action: "password_reset_completed" }); return { status: 200, ok: true as const };
  });
}
