import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ROLES, can, canAnyWrite, type Module, type Role } from "../../lib/permissions";
import { hashRecovery, openSecret, verifyTotp } from "./totp";
import type { Repo } from "../repo";
import { UniqueViolation } from "../repo";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, o: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
export const COOKIE = "ef_session";
export interface User { id: string; email: string; name: string; role: Role; passwordHash: string; active: boolean; sessionVersion: number; failed: { count: number; firstAt: number }; lockedUntil: number; mustChangePassword: boolean; totp?: { secret: string; enabled: boolean; lastStep: number; recovery: string[] } | null; createdAt: string; lastLoginAt: string | null }
export type PublicUser = Omit<User, "passwordHash" | "failed" | "lockedUntil" | "totp"> & { twoFactor: boolean };
export const publicUser = ({ passwordHash, failed, lockedUntil, totp, ...u }: User): PublicUser => ({ ...u, twoFactor: !!totp?.enabled });
/** Roles that must use two-factor sign-in (default owner and manager; override with REQUIRE_2FA_ROLES="owner,manager,..." or empty to switch off for rehearsals). */
export const requires2fa = (u: User) => (process.env.REQUIRE_2FA_ROLES ?? "owner,manager").split(",").map((x: string) => x.trim()).filter(Boolean).includes(u.role) && !u.totp?.enabled;
const P = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// ---- passwords
export async function hashPassword(pw: string): Promise<string> { const salt = randomBytes(16); const h = await scryptAsync(pw, salt, 32, P); return `scrypt$${P.N}$${salt.toString("base64")}$${h.toString("base64")}`; }
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, s, h] = stored.split("$"); if (alg !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64"); const got = await scryptAsync(pw, Buffer.from(s, "base64"), want.length, { ...P, N: Number(n) }); return got.length === want.length && timingSafeEqual(got, want);
}
const DUMMY = hashPassword("dummy-password-for-timing");
const COMMON = ["password1234", "123456789012", "qwertyuiop12", "adminadmin12", "everfresh1234", "letmein12345"];
export function passwordProblem(pw: unknown, email = ""): string | null {
  if (typeof pw !== "string" || pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (new Set(pw).size < 5) return "Use a more varied password.";
  if (COMMON.includes(pw.toLowerCase()) || (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4)) return "That password is too easy to guess.";
  return null;
}

// ---- sessions (signed cookie that is re-checked against the user record on EVERY request)
export function signSession(secret: string, u: Pick<User, "id" | "sessionVersion">, ttlSec = 8 * 3600, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + ttlSec; const body = `v1.${u.id}.${u.sessionVersion}.${exp}`; return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}
export async function userFromCookie(repo: Repo, token: string | undefined, secret: string | undefined, nowMs = Date.now()): Promise<User | null> {
  if (!token || !secret || secret.length < 32) return null; const parts = token.split("."); if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, id, ver, exp, sig] = parts; const want = createHmac("sha256", secret).update(parts.slice(0, 4).join(".")).digest("hex");
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig)) || !/^\d+$/.test(exp) || Number(exp) < nowMs / 1000) return null;
  const u = await repo.docGet<User>("user", id); return u && u.active && String(u.sessionVersion) === ver ? u : null;
}
export const sessionCookie = (token: string, prod: boolean) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${prod ? "; Secure" : ""}`;
export const clearCookie = `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
export const readCookie = (req: Request, name = COOKIE) => req.headers.get("cookie")?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];

// ---- audit log (who did what; never stores passwords or request bodies)
export async function audit(repo: Repo, e: { userId: string | null; email: string | null; action: string; target?: string; ok?: boolean; ip?: string }) {
  const at = new Date().toISOString(); const id = `${at}-${randomBytes(3).toString("hex")}`; await repo.docPut("audit", id, { id, at, ok: true, ...e });
}
export async function listAudit(repo: Repo, limit = 200) { return (await repo.docList<{ at: string }>("audit")).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit); }

// ---- login
const ipHits = new Map<string, { n: number; first: number }>();
const limited = (ip: string, now: number) => { const h = ipHits.get(ip); return !!h && now - h.first <= 900_000 && h.n >= 10; };
const hit = (ip: string, now: number) => { const h = ipHits.get(ip); if (!h || now - h.first > 900_000) ipHits.set(ip, { n: 1, first: now }); else h.n++; };
export type LoginOut = { ok: true; user: User; token: string } | { ok: false; status: number; error: string; need2fa?: true };
export async function login(repo: Repo, o: { email: unknown; password: unknown; code?: unknown; ip: string; secret: string | undefined; bootstrap: { email?: string; password?: string }; now?: number }): Promise<LoginOut> {
  const now = o.now ?? Date.now(); const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : ""; const pw = typeof o.password === "string" ? o.password : "";
  const bad = (status = 401, error = "Incorrect email or password."): LoginOut => ({ ok: false, status, error });
  if (!o.secret || o.secret.length < 32) return bad(503, "Sign-in is not configured.");
  if (limited(o.ip, now)) return bad(429, "Too many attempts. Try again later."); if (!email || !pw || pw.length > 200) { hit(o.ip, now); return bad(); }
  let u = await repo.docGet<User>("user", `email:${email}`).then((x) => (x ? repo.docGet<User>("user", (x as any).id) : null));
  if (!u && (await repo.docList("user")).length === 0 && o.bootstrap.email && o.bootstrap.password && o.bootstrap.password.length >= 12 && email === o.bootstrap.email.toLowerCase() && pw === o.bootstrap.password) {
    u = await createUser(repo, { email, name: "Owner", role: "owner", password: pw, mustChangePassword: true }) as User; await audit(repo, { userId: u.id, email, action: "bootstrap_owner_created", ip: o.ip });
  }
  if (!u) { await verifyPassword(pw, await DUMMY); hit(o.ip, now); await audit(repo, { userId: null, email, action: "login_failed", ok: false, ip: o.ip }); return bad(); }
  if (u.lockedUntil > now) return bad(429, "Too many attempts. Try again later.");
  if (!u.active || !(await verifyPassword(pw, u.passwordHash))) {
    if (now - u.failed.firstAt > 900_000) u.failed = { count: 0, firstAt: now }; u.failed.count++; if (u.failed.count >= 5) { u.lockedUntil = now + 900_000; u.failed = { count: 0, firstAt: now }; }
    await repo.docPut("user", u.id, u); hit(o.ip, now); await audit(repo, { userId: u.id, email, action: "login_failed", ok: false, ip: o.ip }); return bad();
  }
  if (u.totp?.enabled) {
    const code = typeof o.code === "string" ? o.code.trim() : ""; if (!code) return { ok: false, status: 401, error: "Enter the 6-digit code from your authenticator app.", need2fa: true };
    let good = false; const rh = hashRecovery(code);
    if (u.totp.recovery.includes(rh)) { u.totp.recovery = u.totp.recovery.filter((x) => x !== rh); good = true; }
    else { const sec = openSecret(u.totp.secret, o.secret); const step = sec ? verifyTotp(sec, code, now, u.totp.lastStep) : null; if (step !== null) { u.totp.lastStep = step; good = true; } }
    if (!good) { if (now - u.failed.firstAt > 900_000) u.failed = { count: 0, firstAt: now }; u.failed.count++; if (u.failed.count >= 5) { u.lockedUntil = now + 900_000; u.failed = { count: 0, firstAt: now }; } await repo.docPut("user", u.id, u); hit(o.ip, now); await audit(repo, { userId: u.id, email, action: "login_failed_2fa", ok: false, ip: o.ip }); return { ok: false, status: 401, error: "That code is not correct or was already used.", need2fa: true }; }
  }
  u.failed = { count: 0, firstAt: now }; u.lockedUntil = 0; u.lastLoginAt = new Date(now).toISOString(); await repo.docPut("user", u.id, u); await audit(repo, { userId: u.id, email, action: "login", ip: o.ip });
  return { ok: true, user: u, token: signSession(o.secret, u, 8 * 3600, now) };
}

// ---- users
export async function createUser(repo: Repo, i: { email: string; name: string; role: Role; password: string; mustChangePassword?: boolean }): Promise<User | { error: string }> {
  const email = i.email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid email address." }; if (!ROLES.includes(i.role)) return { error: "Choose a role." };
  const name = i.name.trim().slice(0, 80); if (name.length < 2) return { error: "Enter the person's name." }; const pp = passwordProblem(i.password, email); if (pp) return { error: pp };
  const id = randomUUID(); try { await repo.docCreate("user", `email:${email}`, { id }); } catch (e) { if (e instanceof UniqueViolation) return { error: "That email already has an account." }; throw e; }
  const u: User = { id, email, name, role: i.role, passwordHash: await hashPassword(i.password), active: true, sessionVersion: 1, failed: { count: 0, firstAt: 0 }, lockedUntil: 0, mustChangePassword: i.mustChangePassword ?? true, createdAt: new Date().toISOString(), lastLoginAt: null };
  await repo.docPut("user", id, u); return u;
}

// ---- request authorisation: ONE place decides, by URL path, so no admin route can forget a check
export function moduleForPath(segments: string[]): Module | "any" | "upload" {
  const [a, b] = segments;
  switch (a) {
    case "menu": case "categories": case "orders": case "food": return "food";
    case "voc": return "vocational";
    case "vip": return "food";
    case "catering": return "catering";
    case "inbox": return "inbox";
    case "media": return "upload";
    case "me": case "logout": return "any";
    case "site": return b === "settings" ? "settings" : "content";
    default: return "users"; // users, audit and anything unknown: owner only (default deny)
  }
}
const DETAIL_READ = /^(voc\/(applications|invoices|receipts)\/|catering\/enquiries\/|orders\/|inbox\/)/;
export type AuthOut = { ok: true; user: User; module: Module | "any" | "upload" } | { ok: false; status: 401 | 403; error: string };
export async function authorize(repo: Repo, req: Request, o: { siteUrl: string; secret: string | undefined }): Promise<AuthOut> {
  const url = new URL(req.url); const segs = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const user = await userFromCookie(repo, readCookie(req), o.secret); if (!user) return { ok: false, status: 401, error: "Not signed in." };
  const write = !["GET", "HEAD"].includes(req.method);
  if (write && req.headers.get("origin") !== new URL(o.siteUrl).origin) return { ok: false, status: 403, error: "Bad origin." };
  const m = moduleForPath(segs);
  if (m !== "any" && requires2fa(user)) return { ok: false, status: 403, error: "Set up two-factor sign-in (My account) before using the admin." };
  const allowed = m === "any" ? true : m === "upload" ? canAnyWrite(user.role) : can(user.role, m, write);
  if (!allowed) { await audit(repo, { userId: user.id, email: user.email, action: "forbidden", target: `${req.method} ${url.pathname}`, ok: false }); return { ok: false, status: 403, error: "You don't have permission to do that." }; }
  const path = segs.join("/");
  if (write) await audit(repo, { userId: user.id, email: user.email, action: "write", target: `${req.method} ${url.pathname}` });
  else if (segs.length >= 2 && DETAIL_READ.test(path)) await audit(repo, { userId: user.id, email: user.email, action: "view", target: `${req.method} ${url.pathname}` });
  return { ok: true, user, module: m };
}
