process.env.REQUIRE_2FA_ROLES = "owner,manager";
import assert from "node:assert/strict";
import { test } from "node:test";
import { COOKIE, authorize, createUser, login, signSession, type User } from "../src/server/auth";
import { authApi } from "../src/server/auth/api";
import { base32, hashRecovery, openSecret, sealSecret, totpAt, unbase32, verifyTotp } from "../src/server/auth/totp";
import { MemoryRepo } from "../src/server/repo";

const SECRET = "s".repeat(40), SITE = "https://shop.test", PW = "correct-horse-battery";
const req = (u: User, method: string, path: string) => new Request(`${SITE}${path}`, { method, headers: { cookie: `${COOKIE}=${signSession(SECRET, u)}`, origin: SITE } });
const mkLogin = (repo: MemoryRepo, email: string, code?: string, now = Date.now(), ip = "1.1.1.1") => login(repo, { email, password: PW, code, ip, secret: SECRET, bootstrap: {}, now });

test("TOTP matches the RFC 6238 test vectors (SHA-1)", () => {
  const k = Buffer.from("12345678901234567890"); for (const [t, six] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]] as const) assert.equal(totpAt(k, Math.floor(t / 30)), six, String(t));
  assert.equal(totpAt(k, 1, 8), "94287082"); assert.deepEqual(unbase32(base32(k)), k); assert.equal(base32(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(verifyTotp(k, "287082", 59_000), 1); assert.equal(verifyTotp(k, "287082", 59_000 + 30_000), 1); assert.equal(verifyTotp(k, "287082", 59_000 + 90_000), null); assert.equal(verifyTotp(k, "287082", 59_000, 1), null); assert.equal(verifyTotp(k, "12345", 59_000), null); assert.equal(verifyTotp(k, "abcdef", 59_000), null);
});
test("secrets are sealed with the session secret and cannot be read or altered without it", () => {
  const k = Buffer.from("12345678901234567890"); const s = sealSecret(k, SECRET); assert.ok(!s.includes(base32(k))); assert.deepEqual(openSecret(s, SECRET), k); assert.equal(openSecret(s, "o".repeat(40)), null); assert.equal(openSecret(s.slice(0, -2) + "xx", SECRET), null); assert.equal(openSecret("garbage", SECRET), null);
});
test("enrolment, sign-in with a code, replay protection, recovery codes, lockout", async () => {
  const repo = new MemoryRepo(); const u = (await createUser(repo, { email: "owner@example.com", name: "Olu Owner", role: "owner", password: PW, mustChangePassword: false })) as User; const A = (p: string[], b?: any) => authApi(repo, u, "POST", p, b, SECRET, false);
  assert.ok((await mkLogin(repo, "owner@example.com")).ok); // not enrolled yet: password alone still signs in (but the admin is gated, see next test)
  const setup: any = await A(["me", "2fa", "setup"]); assert.equal(setup.status, 200); const sec = unbase32(setup.body.secret); assert.match(setup.body.uri, /^otpauth:\/\/totp\/Everfresh%3Aowner%40example\.com\?secret=[A-Z2-7]+&issuer=Everfresh/);
  const stored = JSON.stringify(await repo.docList("user")); assert.ok(!stored.includes(setup.body.secret)); const t0 = Date.now();
  assert.equal((await A(["me", "2fa", "enable"], { code: "000000" })).status, 422); const stepNow = Math.floor(t0 / 30_000); const en: any = await A(["me", "2fa", "enable"], { code: totpAt(sec, stepNow) }); assert.equal(en.status, 200); assert.equal(en.body.recoveryCodes.length, 8); assert.match(en.body.recoveryCodes[0], /^[a-z2-7]{5}-[a-z2-7]{5}$/);
  const dbUser = (await repo.docGet<User>("user", u.id))!; assert.equal(dbUser.totp!.enabled, true); assert.ok(dbUser.totp!.recovery.includes(hashRecovery(en.body.recoveryCodes[0]))); assert.ok(!JSON.stringify(dbUser).includes(en.body.recoveryCodes[0]));
  const no: any = await mkLogin(repo, "owner@example.com", undefined, t0 + 40_000); assert.ok(!no.ok && no.need2fa && no.status === 401);
  assert.ok(!(await mkLogin(repo, "owner@example.com", "123456", t0 + 40_000)).ok); const later = t0 + 65_000; const good = totpAt(sec, Math.floor(later / 30_000)); assert.ok((await mkLogin(repo, "owner@example.com", good, later)).ok);
  const replay: any = await mkLogin(repo, "owner@example.com", good, later + 1000); assert.ok(!replay.ok && /already used/.test(replay.error));
  const rc = en.body.recoveryCodes[1]; assert.ok((await mkLogin(repo, "owner@example.com", rc, later + 2000)).ok); assert.ok(!(await mkLogin(repo, "owner@example.com", rc, later + 3000)).ok);
  for (let i = 0; i < 5; i++) await mkLogin(repo, "owner@example.com", "999999", later + 4000, `9.9.9.${i}`); const locked: any = await mkLogin(repo, "owner@example.com", totpAt(sec, Math.floor((later + 60_000) / 30_000)), later + 5000, "8.8.8.8"); assert.ok(!locked.ok && locked.status === 429);
});
test("roles that require 2FA are blocked from every admin area until enrolled; others stay optional", async () => {
  const repo = new MemoryRepo(); const O = (await createUser(repo, { email: "o@example.com", name: "Olu Owner", role: "owner", password: PW })) as User; const M = (await createUser(repo, { email: "m@example.com", name: "Mo Manager", role: "manager", password: PW })) as User; const E = (await createUser(repo, { email: "e@example.com", name: "Ed Editor", role: "editor", password: PW })) as User; const O2 = { siteUrl: SITE, secret: SECRET };
  for (const u of [O, M]) { for (const [m, p] of [["GET", "/api/admin/orders"], ["GET", "/api/admin/users"], ["GET", "/api/admin/site/content"], ["POST", "/api/admin/media"]]) { const r = await authorize(repo, req(u, m, p), O2); assert.ok(!r.ok && r.status === 403 && /two-factor/i.test(r.error), `${u.role} ${p}`); } assert.ok((await authorize(repo, req(u, "GET", "/api/admin/me"), O2)).ok); assert.ok((await authorize(repo, req(u, "POST", "/api/admin/me/2fa/setup"), O2)).ok); }
  assert.ok((await authorize(repo, req(E, "GET", "/api/admin/site/content"), O2)).ok);
  const A = (u: User, p: string[], b?: any) => authApi(repo, u, "POST", p, b, SECRET, false); const s: any = await A(O, ["me", "2fa", "setup"]); const k = unbase32(s.body.secret); await A(O, ["me", "2fa", "enable"], { code: totpAt(k, Math.floor(Date.now() / 30_000)) });
  const O3 = (await repo.docGet<User>("user", O.id))!; assert.ok((await authorize(repo, req(O3, "GET", "/api/admin/users"), O2)).ok);
  assert.equal((await A(O3, ["me", "2fa", "disable"], { password: PW, code: "123456" })).status, 403);
  const se: any = await A(E, ["me", "2fa", "setup"]); const ek = unbase32(se.body.secret); const en: any = await A(E, ["me", "2fa", "enable"], { code: totpAt(ek, Math.floor(Date.now() / 30_000)) }); assert.equal(en.status, 200);
  const E2 = (await repo.docGet<User>("user", E.id))!; assert.equal((await A(E2, ["me", "2fa", "disable"], { password: "wrong", code: "000000" })).status, 403);
  const next = Math.floor(Date.now() / 30_000) + 1; assert.equal((await A(E2, ["me", "2fa", "disable"], { password: PW, code: totpAt(ek, next) })).status, 200); assert.equal((await repo.docGet<User>("user", E.id))!.totp, null);
});
test("owner can remove a lost-device second factor; the person must enrol again; views never expose secrets", async () => {
  const repo = new MemoryRepo(); const O = (await createUser(repo, { email: "o@example.com", name: "Olu Owner", role: "owner", password: PW })) as User; const E = (await createUser(repo, { email: "e@example.com", name: "Ed Editor", role: "editor", password: PW })) as User;
  const s: any = await authApi(repo, E, "POST", ["me", "2fa", "setup"], {}, SECRET, false); await authApi(repo, E, "POST", ["me", "2fa", "enable"], { code: totpAt(unbase32(s.body.secret), Math.floor(Date.now() / 30_000)) }, SECRET, false);
  const list: any = await authApi(repo, O, "GET", ["users"], null, SECRET, false); const row = list.body.users.find((x: any) => x.email === "e@example.com"); assert.equal(row.twoFactor, true); assert.ok(!JSON.stringify(list.body).includes("secret") && !JSON.stringify(list.body).includes("recovery"));
  const v0 = (await repo.docGet<User>("user", E.id))!.sessionVersion; assert.equal((await authApi(repo, O, "POST", ["users", E.id, "reset-2fa"], {}, SECRET, false)).status, 200); const after = (await repo.docGet<User>("user", E.id))!; assert.equal(after.totp, null); assert.equal(after.sessionVersion, v0 + 1);
  assert.ok((await mkLogin(repo, "e@example.com")).ok); const me: any = await authApi(repo, after, "GET", ["me"], null, SECRET, false); assert.equal(me.body.twoFactor, false); assert.equal(me.body.passwordHash, undefined);
});
