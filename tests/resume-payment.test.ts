import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRepo } from "../src/server/repo";
import { saveContent } from "../src/server/voc/admin";
import { createApplication, getApp, startApplicationPayment, type VocDeps } from "../src/server/voc/applications";
import { FakeGateway, NOW } from "./helpers";

test("an abandoned payment can be continued, restarted, and expires on its own", async () => {
  const repo = new MemoryRepo(); const gw = new FakeGateway(); let now = NOW;
  const d: VocDeps = { repo, gateway: gw, siteUrl: "https://shop.test", now: () => now };
  await saveContent(repo, "regular-3y", { open: true, published: true, summary: "TEST", courses: [], requirements: [], fees: [{ label: "Tuition", kind: "tuition", amountKobo: null }] });
  const r: any = await createApplication(d, { idempotencyKey: "idem-resume-0001-abcdefghijkl", variantId: "regular-3y", details: { fullName: "Test Applicant", phone: "0803 123 4567", email: "resume@example.com", address: "12 Test Street, Test Town" } });
  assert.ok(r.ok);

  const first: any = await startApplicationPayment(d, r.ref, r.token); assert.ok(first.ok && first.checkoutUrl); assert.equal(gw.calls.length, 1);
  // came back without paying: the same payment page is offered again and no second session is created
  const again: any = await startApplicationPayment(d, r.ref, r.token); assert.equal(again.checkoutUrl, first.checkoutUrl); assert.equal(gw.calls.length, 1);
  // asking for a new payment closes the old attempt and opens another
  const fresh: any = await startApplicationPayment(d, r.ref, r.token, true, true); assert.ok(fresh.ok); assert.equal(gw.calls.length, 2); assert.equal(gw.calls[1].reference, `${r.ref}-A2`);
  let app = (await getApp(repo, r.ref))!; assert.equal(app.payment.attempts[0].status, "expired"); assert.equal(app.payment.attempts[1].status, "open");
  // left for three hours: that session has expired, so the next visit starts a new one instead of showing a dead link
  now = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
  const late: any = await startApplicationPayment(d, r.ref, r.token); assert.ok(late.ok); assert.equal(gw.calls.length, 3); assert.equal(gw.calls[2].reference, `${r.ref}-A3`);
  app = (await getApp(repo, r.ref))!; assert.equal(app.payment.attempts[1].status, "expired");
});