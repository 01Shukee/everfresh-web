import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createUser, hashPassword, listAudit, type User } from "../src/server/auth";
import { completeReset, requestReset } from "../src/server/auth/reset";
import { PostmarkMailer, ResendMailer, flushOutbox, listOutbox, queueMail, type Mailer, type OutboxItem } from "../src/server/email";
import { createEnquiry } from "../src/server/catering/service";
import { createCheckout } from "../src/server/orders";
import { resetRateLimits } from "../src/server/ratelimit";
import { recoverRecords } from "../src/server/recover";
import { MemoryRepo } from "../src/server/repo";
import { saveSection } from "../src/server/site/settings";
import { submitContact, resetRateLimit } from "../src/server/site/contact";
import { createApplication, startApplicationPayment, type VocDeps } from "../src/server/voc/applications";
import { saveContent } from "../src/server/voc/admin";
import { handleBachsWebhook } from "../src/server/webhook";
import { FakeGateway, NOW, SECRET, body, cats, deps, evt, items, signed } from "./helpers";

process.env.SITE_URL = "https://shop.test"; beforeEach(() => { resetRateLimits(); resetRateLimit(); });
const outbox = async (repo: MemoryRepo) => (await repo.docList<OutboxItem>("outbox")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const settle = () => new Promise((r) => setTimeout(r, 20));
class Cap implements Mailer { sent: { to: string; subject: string; text: string }[] = []; fail = false; async send(m: any) { if (this.fail) throw new Error("provider down"); this.sent.push(m); } }

test("providers: request shapes for Resend and Postmark; errors surface", async () => {
  const calls: any[] = []; const f = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response("{}", { status: 200 }); }) as typeof fetch;
  await new ResendMailer({ apiKey: "re_test", from: "Everfresh <hello@example.com>", fetchImpl: f }).send({ to: "a@example.com", subject: "S", text: "T" });
  await new PostmarkMailer({ apiKey: "pm_test", from: "hello@example.com", fetchImpl: f }).send({ to: "a@example.com", subject: "S", text: "T" });
  assert.equal(calls[0].url, "https://api.resend.com/emails"); assert.equal(calls[0].init.headers.Authorization, "Bearer re_test"); assert.deepEqual(JSON.parse(calls[0].init.body).to, ["a@example.com"]);
  assert.equal(calls[1].url, "https://api.postmarkapp.com/email"); assert.equal(calls[1].init.headers["X-Postmark-Server-Token"], "pm_test"); assert.equal(JSON.parse(calls[1].init.body).TextBody, "T");
  const bad = (async () => new Response("no", { status: 401 })) as typeof fetch; await assert.rejects(() => new ResendMailer({ apiKey: "x", from: "f@example.com", fetchImpl: bad }).send({ to: "a@example.com", subject: "S", text: "T" }));
});
test("outbox: queued mail survives provider failure, retries, is never reported sent without a provider, hides bodies, sanitises headers", async () => {
  const repo = new MemoryRepo(); await queueMail(repo, { to: "a@example.com", subject: "Hi\r\nBcc: evil@example.com", text: "secret link https://x/y", kind: "order" }); await queueMail(repo, { to: "not an email", subject: "x", text: "x", kind: "order" }); await queueMail(repo, { to: "b@example.com\r\nBcc: x@y.zz", subject: "x", text: "x", kind: "order" });
  assert.equal((await outbox(repo)).length, 1); assert.ok(!(await outbox(repo))[0].subject.includes("\n"));
  assert.deepEqual(await flushOutbox(repo, null), { sent: 0, failed: 0, notConfigured: 1 }); assert.equal((await outbox(repo))[0].status, "not_configured");
  const m = new Cap(); m.fail = true; assert.equal((await flushOutbox(repo, m)).failed, 1); assert.equal((await outbox(repo))[0].status, "failed"); m.fail = false; assert.equal((await flushOutbox(repo, m)).sent, 1); assert.equal((await outbox(repo))[0].status, "sent"); assert.equal(m.sent.length, 1);
  assert.equal((await flushOutbox(repo, m)).sent, 0); assert.ok(!JSON.stringify(await listOutbox(repo)).includes("secret link"));
  await queueMail(repo, { to: "c@example.com", subject: "reset", text: "token-abc", kind: "reset" }); await flushOutbox(repo, m); assert.ok(!(await outbox(repo)).some((x) => x.text.includes("token-abc")));
});
test("notifications: paid order, application link and payment, enquiry and contact message each queue the right email", async () => {
  const x = await deps(); const repo = x.repo as MemoryRepo; await saveSection(repo, "business", { name: "Everfresh", legalName: "Everfresh Creations Ltd", notifyEmail: "staff@example.com" });
  const r: any = await createCheckout(x.d, body()); await handleBachsWebhook(...(((s) => [s.raw, s.headers] as const)(signed(evt("collection.succeeded", { charge_id: "c1", reference: r.orderNumber, status: "SUCCEEDED", amount: "11300.00", currency: "NGN" })))), { repo, secrets: [SECRET], now: () => NOW }); await settle();
  let o = await outbox(repo); const cust = o.find((m) => m.to === "test@example.com")!; assert.ok(cust.text.includes(`https://shop.test/order/${r.orderNumber}/`) && cust.text.includes("₦11,300")); assert.ok(o.some((m) => m.to === "staff@example.com" && m.subject.includes(r.orderNumber)));
  const d: VocDeps = { repo, gateway: new FakeGateway(), siteUrl: "https://shop.test", now: () => NOW }; await saveContent(repo, "regular-3y", { open: true, published: true });
  const a: any = await createApplication(d, { idempotencyKey: "mail-app-0123456789", variantId: "regular-3y", details: { fullName: "Test Person", phone: "08031234567", email: "app@example.com", address: "12 Test Street, Town" } }); await startApplicationPayment(d, a.ref, a.token);
  await handleBachsWebhook(...(((s) => [s.raw, s.headers] as const)(signed(evt("collection.succeeded", { charge_id: "c2", reference: a.ref, status: "SUCCEEDED", amount: "5000.00", currency: "NGN" })))), { repo, secrets: [SECRET], now: () => NOW });
  o = await outbox(repo); const am = o.filter((m) => m.to === "app@example.com"); assert.equal(am.length, 2); assert.ok(am[0].text.includes(`/application/${a.ref}/${a.token}`) && am[0].text.includes("not complete until")); assert.ok(am[1].text.includes("not an offer of admission"));
  const e: any = await createEnquiry({ repo, whatsappDigits: null, now: () => NOW }, { idempotencyKey: "mail-enq-0123456789", name: "Eve", phone: "08031234567", email: "eve@example.com", eventType: "Wedding", eventDate: "2026-12-12", location: "Hall", guests: 10 }); await createEnquiry({ repo, whatsappDigits: null, now: () => NOW }, { idempotencyKey: "mail-enq-0123456780", name: "No Mail", phone: "08031234567", eventType: "Wedding", eventDate: "2026-12-12", location: "Hall", guests: 10 });
  o = await outbox(repo); assert.equal(o.filter((m) => m.to === "eve@example.com").length, 1); assert.ok(o.find((m) => m.to === "eve@example.com")!.text.includes(`/event-catering/enquiry/${e.ref}/`)); assert.equal(o.filter((m) => m.to === "staff@example.com" && m.subject.includes("catering")).length, 2);
  await submitContact(repo, { idempotencyKey: "mail-cm-0123456789", name: "Cy", phone: "08031234567", message: "Hello there, a question." }, "9.9.9.9", NOW); assert.ok((await outbox(repo)).some((m) => m.to === "staff@example.com" && m.subject.includes("contact message")));
});
test("recovery: same answer whether or not records exist; links go only to the matching email; limited per mailbox", async () => {
  const x = await deps(); const repo = x.repo as MemoryRepo; await createCheckout(x.d, body({ idempotencyKey: "rec-order-0123456789", customer: { name: "Rec Person", phone: "08031234567", email: "rec@example.com" } })); await createCheckout(x.d, body({ idempotencyKey: "rec-order-9876543210", customer: { name: "Other Person", phone: "08031234568", email: "other@example.com" } }));
  const d: VocDeps = { repo, gateway: new FakeGateway(), siteUrl: "https://shop.test", now: () => NOW }; await saveContent(repo, "regular-3y", { open: true, published: true }); await createApplication(d, { idempotencyKey: "rec-app-0123456789", variantId: "regular-3y", details: { fullName: "Rec Person", phone: "08031234567", email: "rec@example.com", address: "12 Test Street, Town" } });
  await createEnquiry({ repo, whatsappDigits: null, now: () => NOW }, { idempotencyKey: "rec-enq-0123456789", name: "Rec", phone: "08031234567", email: "rec@example.com", eventType: "Wedding", eventDate: "2026-12-12", location: "Hall", guests: 10 });
  const before = (await outbox(repo)).length; const known: any = await recoverRecords(repo, "REC@example.com", NOW.getTime()); const unknown: any = await recoverRecords(repo, "nobody@example.com", NOW.getTime());
  assert.deepEqual(known, unknown); const mails = (await outbox(repo)).slice(before).filter((m) => m.kind === "recovery"); assert.equal(mails.length, 1); assert.equal(mails[0].to, "rec@example.com");
  const t = mails[0].text; assert.equal((t.match(/https:\/\/shop\.test\//g) ?? []).length, 3); assert.ok(t.includes("/order/") && t.includes("/application/") && t.includes("/event-catering/enquiry/")); assert.ok(!t.includes("Other Person"));
  assert.equal(((await recoverRecords(repo, "not-an-email")) as any).status, 422); await recoverRecords(repo, "rec@example.com", NOW.getTime()); await recoverRecords(repo, "rec@example.com", NOW.getTime()); const n = (await outbox(repo)).filter((m) => m.kind === "recovery").length; await recoverRecords(repo, "rec@example.com", NOW.getTime()); assert.equal((await outbox(repo)).filter((m) => m.kind === "recovery").length, n);
});
test("staff password reset: single use, expires, hashed at rest, strong password required, revokes sessions, never reveals accounts", async () => {
  const repo = new MemoryRepo(); const u = (await createUser(repo, { email: "staff@example.com", name: "Sam Staff", role: "editor", password: "old-password-12345" })) as User; const ghost = (await createUser(repo, { email: "gone@example.com", name: "Gone Staff", role: "editor", password: "old-password-12345" })) as User; ghost.active = false; await repo.docPut("user", ghost.id, ghost);
  const a = await requestReset(repo, "staff@example.com", NOW.getTime()), b = await requestReset(repo, "nobody@example.com", NOW.getTime()), c = await requestReset(repo, "gone@example.com", NOW.getTime()); assert.deepEqual(a, b); assert.deepEqual(a, c);
  const mails = (await outbox(repo)).filter((m) => m.kind === "reset"); assert.equal(mails.length, 1); assert.equal(mails[0].to, "staff@example.com"); const token = /\/admin\/reset\/([\w-]+)/.exec(mails[0].text)![1]; assert.ok(token.length >= 40);
  assert.ok(!(await repo.docList("idx")).some((i) => JSON.stringify(i).includes(token))); assert.equal(await repo.docGet("idx", `reset:${token}`), null);
  assert.equal((await completeReset(repo, "x".repeat(43), "a-brand-new-password", NOW.getTime())).status, 400); assert.equal((await completeReset(repo, token, "short", NOW.getTime())).status, 422);
  const tokenBefore = (await repo.docGet<User>("user", u.id))!.sessionVersion; assert.equal((await completeReset(repo, token, "a-brand-new-password", NOW.getTime() + 60_000)).status, 200);
  const after = (await repo.docGet<User>("user", u.id))!; assert.equal(after.sessionVersion, tokenBefore + 1); assert.notEqual(after.passwordHash, u.passwordHash); assert.ok(await (await import("../src/server/auth")).verifyPassword("a-brand-new-password", after.passwordHash));
  assert.equal((await completeReset(repo, token, "another-new-password", NOW.getTime() + 61_000)).status, 400);
  resetRateLimits(); await requestReset(repo, "staff@example.com", NOW.getTime()); const t2 = /\/admin\/reset\/([\w-]+)/.exec((await outbox(repo)).filter((m) => m.kind === "reset").pop()!.text)![1]; assert.equal((await completeReset(repo, t2, "yet-another-password", NOW.getTime() + 31 * 60_000)).status, 400);
  resetRateLimits(); for (let i = 0; i < 6; i++) await requestReset(repo, "staff@example.com", NOW.getTime()); assert.equal((await outbox(repo)).filter((m) => m.kind === "reset").length, 2 + 3); // 2 earlier requests + only 3 of the next 6 allowed per hour
  const au = JSON.stringify(await listAudit(repo)); assert.ok(au.includes("password_reset_completed") && au.includes("password_reset_requested") && !au.includes(token) && !au.includes("a-brand-new-password"));
});
void cats; void items; void hashPassword;
