import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckout } from "../src/server/orders";
import { rateLimit, resetRateLimits } from "../src/server/ratelimit";
import { MemoryRepo } from "../src/server/repo";
import { createApplication, getApp, startApplicationPayment, type VocDeps } from "../src/server/voc/applications";
import { saveContent } from "../src/server/voc/admin";
import { handleBachsWebhook } from "../src/server/webhook";
import { FakeGateway, NOW, SECRET, body, deps, evt, signed } from "./helpers";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";

class Flaky extends MemoryRepo { failNext = false; async saveOrder(o: any) { if (this.failNext) { this.failNext = false; throw new Error("db blip"); } return super.saveOrder(o); } async docPut(c: string, i: string, d: unknown) { if (this.failNext && c === "app") { this.failNext = false; throw new Error("db blip"); } return super.docPut(c, i, d); } }
const hook = (repo: MemoryRepo, payload: object) => { const s = signed(payload); return handleBachsWebhook(s.raw, s.headers, { repo, secrets: [SECRET], now: () => NOW }); };

test("webhook: a payment event whose processing fails is NOT lost; the provider's retry is processed", async () => {
  const repo = new Flaky(); const { d, repo: _r } = await deps({ repo }); void _r; for (const c of await new MemoryRepo().listCategories()) void c;
  const { cats, items } = await import("./helpers"); for (const c of cats) await repo.saveCategory(c); for (const i of items) await repo.saveItem(i);
  const r: any = await createCheckout(d, body()); assert.ok(r.ok);
  const ev = evt("collection.succeeded", { charge_id: "ch_1", checkout_id: "chk_1", reference: r.orderNumber, status: "SUCCEEDED", amount: "11300.00", currency: "NGN" });
  repo.failNext = true; await assert.rejects(() => hook(repo, ev)); assert.equal((await repo.findOrderByNumber(r.orderNumber))!.paymentStatus, "pending");
  const again = await hook(repo, ev); assert.equal(again.body, "ok"); assert.equal((await repo.findOrderByNumber(r.orderNumber))!.paymentStatus, "paid");
  assert.equal((await hook(repo, ev)).body, "duplicate");
});
test("webhook: same retry guarantee for vocational application-fee payments", async () => {
  const repo = new Flaky(); const d: VocDeps = { repo, gateway: new FakeGateway(), siteUrl: "https://shop.test", now: () => NOW }; await saveContent(repo, "regular-3y", { open: true, published: true });
  const a: any = await createApplication(d, { idempotencyKey: "review-key-0123456789", variantId: "regular-3y", details: { fullName: "Test Person", phone: "08031234567", email: "a@example.com", address: "12 Test Street, Town" } }); assert.ok(a.ok); await startApplicationPayment(d, a.ref, a.token);
  const ev = evt("collection.succeeded", { charge_id: "ch_9", checkout_id: "c", reference: a.ref, status: "SUCCEEDED", amount: "5000.00", currency: "NGN" });
  repo.failNext = true; await assert.rejects(() => hook(repo, ev)); assert.equal((await getApp(repo, a.ref))!.payment.status, "pending");
  assert.equal((await hook(repo, ev)).body, "ok"); const x = (await getApp(repo, a.ref))!; assert.equal(x.payment.status, "paid"); assert.equal(x.status, "submitted"); assert.equal((await repo.docList("receipt")).length, 1);
});
test("rate limiter: allows up to the limit per key and window, then refuses; other keys unaffected", () => {
  resetRateLimits(); const t = 1_000_000; for (let i = 0; i < 5; i++) assert.equal(rateLimit("a", 5, 60_000, t + i), true); assert.equal(rateLimit("a", 5, 60_000, t + 10), false); assert.equal(rateLimit("b", 5, 60_000, t + 10), true); assert.equal(rateLimit("a", 5, 60_000, t + 61_000), true);
});
test("SEO: robots hides private pages and sitemap lists only public pages", () => {
  const r: any = robots(); const dis: string[] = r.rules[0].disallow; for (const p of ["/admin", "/api/", "/application/", "/apply/", "/order/", "/checkout", "/event-catering/enquiry/"]) assert.ok(dis.includes(p), p); assert.match(r.sitemap, /\/sitemap\.xml$/);
  const urls = sitemap().map((s) => new URL(s.url).pathname); for (const p of ["/", "/order-food", "/vocational-studies", "/vocational-studies/regular", "/vocational-studies/intensive", "/event-catering", "/about", "/contact"]) assert.ok(urls.includes(p), p);
  for (const bad of ["/admin", "/checkout", "/apply", "/application", "/order"]) assert.ok(!urls.some((u) => u === bad || u.startsWith(bad + "/")), bad);
});
test("security headers are configured (HSTS and CSP in production)", async () => {
  const prev = process.env.NODE_ENV; (process.env as any).NODE_ENV = "production"; const mod: any = await import("../next.config.mjs?prod=" + Date.now()); (process.env as any).NODE_ENV = prev;
  const h: { key: string; value: string }[] = (await mod.default.headers())[0].headers; const get = (k: string) => h.find((x) => x.key === k)?.value ?? "";
  assert.equal(get("X-Content-Type-Options"), "nosniff"); assert.equal(get("X-Frame-Options"), "DENY"); assert.match(get("Referrer-Policy"), /strict-origin/); assert.match(get("Strict-Transport-Security"), /max-age=\d+/);
  const csp = get("Content-Security-Policy"); for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "form-action 'self'"]) assert.ok(csp.includes(d), d); assert.equal(mod.default.poweredByHeader, false);
});
