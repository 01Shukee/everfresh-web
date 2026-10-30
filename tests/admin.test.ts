process.env.REQUIRE_2FA_ROLES = "";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROLES, ROLE_MODULES, type Role } from "../src/lib/permissions";
import { authorize, createUser, hashPassword, listAudit, login, moduleForPath, passwordProblem, signSession, userFromCookie, verifyPassword, COOKIE, type User } from "../src/server/auth";
import { authApi } from "../src/server/auth/api";
import { MemoryRepo } from "../src/server/repo";
import { MAX_IMAGE_BYTES, readUpload, saveImage, sniffImage } from "../src/server/media";
import { siteAdminApi } from "../src/server/site/api";
import { listMessages, resetRateLimit, submitContact } from "../src/server/site/contact";
import { defaultSettings, getSettings, saveSection, validateSection } from "../src/server/site/settings";

const SECRET = "s".repeat(40), SITE = "https://shop.test", PW = "correct-horse-battery";
const NOW = new Date("2026-10-10T10:00:00Z");
async function setup() { const repo = new MemoryRepo(); const users: Record<string, User> = {}; for (const r of ROLES) { users[r] = (await createUser(repo, { email: `${r}@example.com`, name: `Test ${r}`, role: r, password: PW })) as User; } return { repo, users }; }
const req = (u: User | null, method: string, path: string, o: { origin?: string | null } = {}) => new Request(`${SITE}${path}`, { method, headers: { ...(u ? { cookie: `${COOKIE}=${signSession(SECRET, u)}` } : {}), ...(o.origin === null ? {} : { origin: o.origin ?? SITE }) } });

test("passwords: hashing, verification and policy", async () => {
  const h = await hashPassword(PW); assert.notEqual(h, await hashPassword(PW)); assert.ok(h.startsWith("scrypt$")); assert.ok(await verifyPassword(PW, h)); assert.ok(!(await verifyPassword("wrong-password-1", h))); assert.ok(!(await verifyPassword(PW, "garbage")));
  for (const bad of ["short", "aaaaaaaaaaaaaaaa", "password1234", "owner-everfresh1", 123 as any]) assert.ok(passwordProblem(bad, "owner@example.com"), String(bad)); assert.equal(passwordProblem(PW, "owner@example.com"), null);
});
test("login: bootstrap owner from env once, generic errors, lockout, IP limit, disabled users", async () => {
  const repo = new MemoryRepo(); const L = (email: any, password: any, extra: object = {}) => login(repo, { email, password, ip: "1.1.1.1", secret: SECRET, bootstrap: { email: "boss@example.com", password: "bootstrap-password-1" }, now: NOW.getTime(), ...extra });
  assert.equal((await L("boss@example.com", "wrong")).ok, false); assert.equal((await repo.docList("user")).length, 0);
  const first = await L("BOSS@example.com", "bootstrap-password-1"); assert.ok(first.ok && first.user.role === "owner" && first.user.mustChangePassword);
  assert.ok((await L("boss@example.com", "bootstrap-password-1")).ok);
  const other = await L("someone@example.com", "bootstrap-password-1"); assert.ok(!other.ok && other.status === 401 && other.error === "Incorrect email or password."); assert.equal(((await L("boss@example.com", "nope")) as any).error, "Incorrect email or password.");
  assert.equal(((await login(repo, { email: "boss@example.com", password: PW, ip: "x", secret: "short", bootstrap: {} })) as any).status, 503);
  for (let i = 0; i < 5; i++) await L("boss@example.com", "wrong-wrong-1", { ip: `9.9.9.${i}` }); const locked = await L("boss@example.com", "bootstrap-password-1", { ip: "7.7.7.7" }); assert.ok(!locked.ok && locked.status === 429);
  assert.ok((await L("boss@example.com", "bootstrap-password-1", { now: NOW.getTime() + 16 * 60_000, ip: "7.7.7.8" })).ok);
  for (let i = 0; i < 10; i++) await L(`n${i}@example.com`, "x", { ip: "5.5.5.5" }); assert.equal(((await L("boss@example.com", "bootstrap-password-1", { ip: "5.5.5.5" })) as any).status, 429);
  const { repo: r2, users } = await setup(); users.editor.active = false; await r2.docPut("user", users.editor.id, users.editor); assert.ok(!(await login(r2, { email: "editor@example.com", password: PW, ip: "2.2.2.2", secret: SECRET, bootstrap: {} })).ok);
});
test("sessions: tamper, expiry, revocation by role change/disable/password change", async () => {
  const { repo, users } = await setup(); const u = users.manager; const tok = signSession(SECRET, u, 3600, NOW.getTime());
  assert.equal((await userFromCookie(repo, tok, SECRET, NOW.getTime()))?.id, u.id); assert.equal(await userFromCookie(repo, tok + "x", SECRET, NOW.getTime()), null); assert.equal(await userFromCookie(repo, tok, "o".repeat(40), NOW.getTime()), null);
  assert.equal(await userFromCookie(repo, tok, SECRET, NOW.getTime() + 7200_000), null); assert.equal(await userFromCookie(repo, tok.replace(u.id, users.owner.id), SECRET, NOW.getTime()), null); assert.equal(await userFromCookie(repo, undefined, SECRET), null); assert.equal(await userFromCookie(repo, "v1.a.b", SECRET), null);
  const stored = (await repo.docGet<User>("user", u.id))!; stored.sessionVersion++; await repo.docPut("user", u.id, stored); assert.equal(await userFromCookie(repo, tok, SECRET, NOW.getTime()), null);
  const fresh = signSession(SECRET, stored, 3600, NOW.getTime()); assert.ok(await userFromCookie(repo, fresh, SECRET, NOW.getTime())); stored.active = false; await repo.docPut("user", u.id, stored); assert.equal(await userFromCookie(repo, fresh, SECRET, NOW.getTime()), null);
});

// expected access, written out independently of ROLE_MODULES
const MATRIX: [string, string, string, Role[]][] = [
  ["GET", "/api/admin/menu", "food", ["owner", "manager", "food_staff"]], ["POST", "/api/admin/menu", "food", ["owner", "manager", "food_staff"]], ["PUT", "/api/admin/categories/c1", "food", ["owner", "manager", "food_staff"]], ["GET", "/api/admin/food/settings", "food", ["owner", "manager", "food_staff"]], ["PUT", "/api/admin/food/settings", "food", ["owner", "manager", "food_staff"]], ["GET", "/api/admin/orders", "food", ["owner", "manager", "food_staff"]], ["PATCH", "/api/admin/orders/EF-1", "food", ["owner", "manager", "food_staff"]],
  ["GET", "/api/admin/voc/applications", "voc", ["owner", "manager", "admissions_staff"]], ["GET", "/api/admin/voc/applications/VA-1", "voc", ["owner", "manager", "admissions_staff"]], ["POST", "/api/admin/voc/invoices/VI-1/payments", "voc", ["owner", "manager", "admissions_staff"]], ["GET", "/api/admin/voc/receipts/VR-1/pdf", "voc", ["owner", "manager", "admissions_staff"]], ["PUT", "/api/admin/voc/content/regular-3y", "voc", ["owner", "manager", "admissions_staff"]], ["POST", "/api/admin/voc/media/testimonial", "voc", ["owner", "manager", "admissions_staff"]],
  ["GET", "/api/admin/catering/enquiries", "cat", ["owner", "manager", "catering_staff"]], ["POST", "/api/admin/catering/enquiries/CE-1/note", "cat", ["owner", "manager", "catering_staff"]], ["PUT", "/api/admin/catering/content", "cat", ["owner", "manager", "catering_staff"]], ["POST", "/api/admin/catering/gallery", "cat", ["owner", "manager", "catering_staff"]],
  ["GET", "/api/admin/site/content", "content", ["owner", "manager", "editor"]], ["PUT", "/api/admin/site/about", "content", ["owner", "manager", "editor"]], ["PUT", "/api/admin/site/homepage", "content", ["owner", "manager", "editor"]], ["PUT", "/api/admin/site/faqs", "content", ["owner", "manager", "editor"]], ["PUT", "/api/admin/site/brand", "content", ["owner", "manager", "editor"]],
  ["GET", "/api/admin/site/settings", "settings", ["owner", "manager"]], ["PUT", "/api/admin/site/settings/contact", "settings", ["owner", "manager"]],
  ["GET", "/api/admin/inbox/messages", "inbox", ["owner", "manager"]], ["DELETE", "/api/admin/inbox/messages/CM-1", "inbox", ["owner", "manager"]],
  ["GET", "/api/admin/users", "users", ["owner"]], ["POST", "/api/admin/users", "users", ["owner"]], ["PUT", "/api/admin/users/abc", "users", ["owner"]], ["GET", "/api/admin/audit", "users", ["owner"]], ["GET", "/api/admin/anything-new", "default-deny", ["owner"]],
  ["GET", "/api/admin/me", "any", [...ROLES]], ["POST", "/api/admin/me/password", "any", [...ROLES]], ["POST", "/api/admin/media", "upload", ["owner", "manager", "food_staff", "admissions_staff", "catering_staff", "editor"]],
];
test("permission matrix: every admin endpoint x every role is allowed or forbidden exactly as specified", async () => {
  const { repo, users } = await setup(); let n = 0;
  for (const [method, path, , allowed] of MATRIX) for (const role of ROLES) { const r = await authorize(repo, req(users[role], method, path), { siteUrl: SITE, secret: SECRET }); const want = allowed.includes(role); assert.equal(r.ok, want, `${role} ${method} ${path}`); if (!r.ok) assert.equal(r.status, 403); n++; }
  assert.equal(n, MATRIX.length * ROLES.length);
  for (const [method, path] of MATRIX) { const r = await authorize(repo, req(null, method, path), { siteUrl: SITE, secret: SECRET }); assert.ok(!r.ok && r.status === 401, `anon ${method} ${path}`); }
  assert.equal(moduleForPath(["unknown"]), "users"); assert.equal(moduleForPath([]), "users");
  for (const role of ROLES) for (const m of Object.keys(ROLE_MODULES[role]) as (keyof (typeof ROLE_MODULES)["owner"])[]) assert.ok(["food", "vocational", "catering", "content", "inbox", "settings", "users"].includes(m));
});
test("CSRF and cookies: state-changing requests need same-origin; GETs do not; forged/foreign sessions fail", async () => {
  const { repo, users } = await setup(); const O = { siteUrl: SITE, secret: SECRET };
  for (const origin of ["https://evil.test", null, "http://shop.test"]) { const r = await authorize(repo, req(users.owner, "POST", "/api/admin/users", { origin }), O); assert.ok(!r.ok && r.status === 403, String(origin)); }
  assert.ok((await authorize(repo, req(users.owner, "GET", "/api/admin/users", { origin: null }), O)).ok);
  const forged = new Request(`${SITE}/api/admin/users`, { headers: { cookie: `${COOKIE}=v1.${users.owner.id}.1.9999999999.deadbeef` } }); assert.equal((await authorize(repo, forged, O)).ok, false);
  const wrongSecret = new Request(`${SITE}/api/admin/users`, { headers: { cookie: `${COOKIE}=${signSession("z".repeat(40), users.owner)}` } }); assert.equal((await authorize(repo, wrongSecret, O)).ok, false);
});
test("audit: writes, sensitive record views, forbidden attempts and logins are logged; secrets never are", async () => {
  const { repo, users } = await setup(); const O = { siteUrl: SITE, secret: SECRET };
  await authorize(repo, req(users.admissions_staff, "GET", "/api/admin/voc/applications/VA-1"), O); await authorize(repo, req(users.admissions_staff, "GET", "/api/admin/voc/applications"), O);
  await authorize(repo, req(users.editor, "GET", "/api/admin/voc/applications/VA-1"), O); await authorize(repo, req(users.food_staff, "PATCH", "/api/admin/orders/EF-1"), O);
  await login(repo, { email: "owner@example.com", password: "wrong-wrong-wrong", ip: "3.3.3.3", secret: SECRET, bootstrap: {} }); await login(repo, { email: "owner@example.com", password: PW, ip: "3.3.3.4", secret: SECRET, bootstrap: {} });
  const a = await listAudit(repo); const acts = a.map((x: any) => x.action);
  assert.ok(acts.includes("view") && acts.includes("forbidden") && acts.includes("write") && acts.includes("login") && acts.includes("login_failed"));
  assert.equal(a.filter((x: any) => x.action === "view").length, 1); assert.ok(a.some((x: any) => x.action === "forbidden" && x.email === "editor@example.com" && x.ok === false));
  assert.ok(!JSON.stringify(a).includes(PW) && !JSON.stringify(a).includes("wrong-wrong-wrong"));
});
test("user management: owner only, no self-lockout, last owner protected, immediate revocation, no hashes leaked", async () => {
  const { repo, users } = await setup(); const owner = users.owner; const A = (m: string, p: string[], b?: any, me = owner) => authApi(repo, me, m, p, b, SECRET, false);
  const list: any = await A("GET", ["users"]); assert.equal(list.body.users.length, 6); assert.ok(!JSON.stringify(list.body).includes("passwordHash") && !JSON.stringify(list.body).includes("scrypt"));
  assert.equal((await A("POST", ["users"], { email: "new@example.com", name: "New Person", role: "editor", password: PW })).status, 201); assert.equal((await A("POST", ["users"], { email: "NEW@example.com", name: "Dup", role: "editor", password: PW })).status, 422);
  assert.equal((await A("POST", ["users"], { email: "x@example.com", name: "X Y", role: "god", password: PW })).status, 422); assert.equal((await A("POST", ["users"], { email: "y@example.com", name: "Y Z", role: "editor", password: "short" })).status, 422);
  const ed = users.editor; const tok = signSession(SECRET, ed); assert.ok(await userFromCookie(repo, tok, SECRET));
  assert.equal((await A("PUT", ["users", ed.id], { role: "manager" })).status, 200); assert.equal(await userFromCookie(repo, tok, SECRET), null); // old session dead the moment the role changes
  assert.equal((await A("PUT", ["users", owner.id], { role: "manager" })).status, 409); assert.equal((await A("PUT", ["users", owner.id], { active: false })).status, 409);
  const second: any = (await A("POST", ["users"], { email: "o2@example.com", name: "Owner Two", role: "owner", password: PW })).body; assert.equal((await A("PUT", ["users", second.id], { role: "manager" })).status, 200); assert.equal((await A("PUT", ["users", second.id], { role: "owner" })).status, 200);
  const ow2 = (await repo.docGet<User>("user", second.id))!; assert.equal((await A("PUT", ["users", owner.id], { active: false }, ow2)).status, 200); assert.equal((await A("PUT", ["users", ow2.id], { active: false }, ow2)).status, 409);
  const fo = users.food_staff; assert.equal((await A("POST", ["users", fo.id, "reset-password"], { password: "weak" })).status, 422); assert.equal((await A("POST", ["users", fo.id, "reset-password"], { password: "a-new-strong-password" })).status, 200); assert.ok((await login(repo, { email: "food_staff@example.com", password: "a-new-strong-password", ip: "4.4.4.4", secret: SECRET, bootstrap: {} })).ok);
  const t2 = signSession(SECRET, (await repo.docGet<User>("user", fo.id))!); assert.ok(await userFromCookie(repo, t2, SECRET)); await A("POST", ["users", fo.id, "revoke-sessions"]); assert.equal(await userFromCookie(repo, t2, SECRET), null); assert.equal((await A("GET", ["users", "nope"])).status, 404);
});
test("change own password: needs current, enforces policy, revokes other sessions and returns a fresh cookie", async () => {
  const { repo, users } = await setup(); const me = users.manager; const old = signSession(SECRET, me); const A = (b: any) => authApi(repo, me, "POST", ["me", "password"], b, SECRET, false);
  assert.equal((await A({ current: "wrong", next: "another-strong-pass" })).status, 403); assert.equal((await A({ current: PW, next: "short" })).status, 422); assert.equal((await A({ current: PW, next: PW })).status, 422);
  const ok: any = await A({ current: PW, next: "another-strong-pass" }); assert.equal(ok.status, 200); assert.match(ok.cookie, /^ef_session=v1\./); assert.equal(await userFromCookie(repo, old, SECRET), null);
  assert.ok(await userFromCookie(repo, ok.cookie.split(";")[0].split("=")[1], SECRET)); assert.equal(((await authApi(repo, me, "GET", ["me"], null, SECRET, false)).body as any).passwordHash, undefined);
});

test("site settings: defaults, validation, section isolation, supplied phone number", async () => {
  const repo = new MemoryRepo(); const d = defaultSettings(); assert.equal(d.contact.phone, "+2348135571152"); assert.equal(d.contact.whatsapp, "2348135571152"); assert.equal(d.contact.email, null); assert.equal(d.contact.address, null); assert.equal(d.contact.mapConfirmed, false); assert.deepEqual(d.about.values, []);
  const bad = (s: any, raw: any) => assert.equal(validateSection(s, raw).ok, false, JSON.stringify(raw).slice(0, 80));
  bad("contact", { phone: "call me" }); bad("contact", { email: "nope" }); bad("contact", { whatsapp: "abc" }); bad("contact", { mapConfirmed: true }); bad("contact", { social: [{ label: "X", url: "http://insecure.test" }] }); bad("business", { name: "", legalName: "" });
  bad("about", { photos: [{ url: "javascript:x", alt: "a" }] }); bad("about", { photos: [{ url: "/uploads/a.jpg", alt: "" }] }); bad("homepage", { heroImages: { food: { url: "/media/a.jpg", alt: "" } } }); bad("homepage", { featured: [{ kind: "x", title: "T", url: "/media/a.jpg", alt: "a" }] }); bad("brand", { logoUrl: "data:image/png;base64,AAAA" }); bad("faqs", { faqs: [{ q: "Q", a: "" }] });
  const c: any = await saveSection(repo, "contact", { phone: "+234 813 557 1152", email: "Hello@Example.com", whatsapp: "0813 557 1152", address: "TEST address", mapConfirmed: true, hours: ["Mon-Fri 9-5"], social: [{ label: "Instagram", url: "https://example.com/x" }] }); assert.ok(c.ok); assert.equal(c.value.whatsapp, "2348135571152"); assert.equal(c.value.email, "hello@example.com");
  const s = await getSettings(repo); assert.equal(s.contact.address, "TEST address"); assert.equal(s.business.name, "Everfresh"); assert.deepEqual(s.faqs, []);
  assert.ok((await saveSection(repo, "contact", { phone: "", whatsapp: "" })).ok); const cleared = await getSettings(repo); assert.equal(cleared.contact.phone, null); assert.equal(cleared.contact.whatsapp, null);
  const f: any = await saveSection(repo, "faqs", { faqs: [{ q: "Q1", a: "A1", published: true }] }); assert.ok(f.ok); assert.equal((await getSettings(repo)).faqs.length, 1);
  assert.ok((await saveSection(repo, "about", { intro: "TEST", values: ["a", "", "b"], photos: [{ url: "/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg", alt: "Alt" }] })).ok); assert.deepEqual((await getSettings(repo)).about.values, ["a", "b"]);
});
test("contact form: validation, honeypot, rate limit, replay, storage and inbox search", async () => {
  resetRateLimit(); const repo = new MemoryRepo(); let n = 0; const key = () => `cm-${String(++n).padStart(4, "0")}-abcdefghijkl`; const body = (o: any = {}) => ({ idempotencyKey: key(), name: "Test Person", phone: "08031234567", message: "Hello, I would like to know more.", ...o });
  for (const [o, field] of [[{ name: "" }, "name"], [{ message: "short" }, "message"], [{ phone: "", email: "" }, "contact"], [{ phone: "12" }, "phone"], [{ phone: "", email: "bad" }, "email"]] as const) { const r: any = await submitContact(repo, body(o), "1.1.1.1", NOW); assert.equal(r.status, 422); assert.ok(r.body.fieldErrors[field], field); }
  assert.equal((await repo.docList("contact")).length, 0);
  const bot: any = await submitContact(repo, body({ website: "http://spam.test" }), "2.2.2.2", NOW); assert.equal(bot.status, 200); assert.equal((await repo.docList("contact")).length, 0);
  const k = key(); const a: any = await submitContact(repo, body({ idempotencyKey: k, email: "p@example.com", message: "<script>alert(1)</script> I need info please" }), "3.3.3.3", NOW); assert.equal(a.status, 201); const b: any = await submitContact(repo, body({ idempotencyKey: k }), "3.3.3.3", NOW); assert.equal(b.status, 200); assert.equal(b.body.ref, a.body.ref); assert.equal((await repo.docList("contact")).length, 1);
  for (let i = 0; i < 4; i++) assert.equal(((await submitContact(repo, body(), "3.3.3.3", NOW)) as any).status, 201); assert.equal(((await submitContact(repo, body(), "3.3.3.3", NOW)) as any).status, 429); assert.equal(((await submitContact(repo, body(), "3.3.3.9", NOW)) as any).status, 201);
  assert.equal((await listMessages(repo, { q: "script" })).length, 1); assert.ok(!("idempotencyKey" in (await listMessages(repo, {}))[0]));
  const id = (await listMessages(repo, {}))[0].id; assert.equal((await siteAdminApi(repo, "PATCH", ["inbox", "messages", id], { status: "handled" }, new URLSearchParams())).status, 200); assert.equal((await listMessages(repo, { status: "handled" })).length, 1); assert.equal((await siteAdminApi(repo, "PATCH", ["inbox", "messages", id], { status: "bogus" }, new URLSearchParams())).status, 422); assert.equal((await siteAdminApi(repo, "DELETE", ["inbox", "messages", id], null, new URLSearchParams())).status, 200);
});
test("uploads: real image types only, size limit, random names, safe serving", async () => {
  const dir = mkdtempSync(join(tmpdir(), "up-")); const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 70, 73, 70, 0, 1, 2]); const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72]); const webp = new Uint8Array([...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBPVP8 "), 0, 0]);
  assert.equal(sniffImage(jpg), "jpg"); assert.equal(sniffImage(png), "png"); assert.equal(sniffImage(webp), "webp");
  for (const bad of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), Buffer.from("<html><script>x</script></html>"), Buffer.from("MZ\x90\x00 executable bytes here...."), Buffer.from("GIF89a......more......")]) { const r = await saveImage(new Uint8Array(bad), dir); assert.ok(!r.ok && r.status === 415); }
  assert.equal(((await saveImage(new Uint8Array(0), dir)) as any).status, 422); assert.equal(((await saveImage(new Uint8Array(MAX_IMAGE_BYTES + 1).fill(0xff), dir)) as any).status, 413);
  const ok = await saveImage(jpg, dir); assert.ok(ok.ok && /^\/uploads\/[a-f0-9]{32}\.jpg$/.test(ok.url)); const ok2 = await saveImage(jpg, dir); assert.notEqual((ok as any).url, (ok2 as any).url);
  const f = await readUpload((ok as any).url.split("/")[2], dir); assert.equal(f!.type, "image/jpeg"); assert.equal(f!.bytes.length, jpg.length);
  for (const n of ["../../etc/passwd", "..%2f..%2fx.jpg", "a.jpg", "/etc/passwd", (ok as any).url.split("/")[2] + ".exe", "0".repeat(32) + ".jpg"]) assert.equal(await readUpload(n, dir), null, n);
});
