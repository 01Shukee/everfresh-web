import assert from "node:assert/strict";
import { test } from "node:test";
import { audit } from "../src/server/auth";
import { queueMail, type OutboxItem } from "../src/server/email";
import { MemoryRepo } from "../src/server/repo";
import { clientIdFrom } from "../src/server/route-utils";
import { runRetention } from "../src/server/retention";
import { createCheckout } from "../src/server/orders";
import { createApplication, startApplicationPayment, getApp, type VocDeps } from "../src/server/voc/applications";
import { saveContent } from "../src/server/voc/admin";
import { submitContact, resetRateLimit } from "../src/server/site/contact";
import { FakeGateway, body, deps } from "./helpers";

test("client address: only the entry added by our trusted proxy is used; spoofed leading entries are ignored", () => {
  assert.equal(clientIdFrom("1.2.3.4", 1), "1.2.3.4"); assert.equal(clientIdFrom("6.6.6.6, 1.2.3.4", 1), "1.2.3.4"); assert.equal(clientIdFrom("6.6.6.6, 7.7.7.7, 1.2.3.4", 1), "1.2.3.4"); assert.equal(clientIdFrom("6.6.6.6, 5.5.5.5, 1.2.3.4", 2), "5.5.5.5"); assert.equal(clientIdFrom(null, 1), "local"); assert.equal(clientIdFrom("", 1), "local");
});
test("retention: removes abandoned personal data, keeps financial and business records", async () => {
  const day = 86_400_000; const NOW2 = Date.now(); const long = (d: number) => new Date(NOW2 - d * day).toISOString();
  const x = await deps({ now: () => new Date(NOW2 - 40 * day) }); const repo = x.repo as MemoryRepo;
  const abandoned: any = await createCheckout(x.d, body({ idempotencyKey: "ret-order-0123456789" })); const paid: any = await createCheckout(x.d, body({ idempotencyKey: "ret-order-9876543210" })); const po = (await repo.findOrderByNumber(paid.orderNumber))!; po.paidAt = long(39); po.paymentStatus = "paid"; po.status = "confirmed"; await repo.saveOrder(po);
  const recent: any = await createCheckout({ ...x.d, now: () => new Date(NOW2) }, body({ idempotencyKey: "ret-order-1111111111" }));
  const vd: VocDeps = { repo, gateway: new FakeGateway(), siteUrl: "https://s.test", now: () => new Date(NOW2 - 100 * day) }; await saveContent(repo, "regular-3y", { open: true, published: true });
  const draft: any = await createApplication(vd, { idempotencyKey: "ret-app-0123456789", variantId: "regular-3y", details: { fullName: "Old Draft", phone: "08031234567", email: "old@example.com", address: "12 Test Street, Town" } });
  const paidApp: any = await createApplication(vd, { idempotencyKey: "ret-app-9876543210", variantId: "regular-3y", details: { fullName: "Paid App", phone: "08031234568", email: "paid@example.com", address: "12 Test Street, Town" } }); const pa = (await getApp(repo, paidApp.ref))!; pa.status = "submitted"; pa.payment.status = "paid"; await repo.docPut("app", pa.ref, pa); void startApplicationPayment;
  await queueMail(repo, { to: "a@example.com", subject: "s", text: "t", kind: "order" }); const mail = (await repo.docList<OutboxItem>("outbox"))[0]; mail.status = "sent"; mail.createdAt = long(60); await repo.docPut("outbox", mail.id, mail);
  resetRateLimit(); await submitContact(repo, { idempotencyKey: "ret-cm-0123456789", name: "Old Msg", phone: "08031234567", message: "An old handled message." }, "1.1.1.1", new Date(NOW2 - 400 * day)); const cm = (await repo.docList<any>("contact"))[0]; cm.status = "handled"; await repo.docPut("contact", cm.id, cm);
  await audit(repo, { userId: null, email: null, action: "old_event" }); const old = (await repo.docList<any>("audit"))[0]; await repo.docDelete("audit", old.id); old.at = long(500); old.id = `${old.at}-x`; await repo.docPut("audit", old.id, old); await audit(repo, { userId: null, email: null, action: "new_event" });
  const r = await runRetention(repo, NOW2); assert.deepEqual(r, { abandonedOrders: 1, unpaidApplications: 1, sentEmails: 1, handledMessages: 1, auditEntries: 1 });
  assert.equal(await repo.findOrderByNumber(abandoned.orderNumber), null); assert.ok(await repo.findOrderByNumber(paid.orderNumber)); assert.ok(await repo.findOrderByNumber(recent.orderNumber));
  assert.equal(await getApp(repo, draft.ref), null); assert.ok(await getApp(repo, paidApp.ref)); assert.equal(await repo.docGet("idx", "active:old@example.com:regular-3y"), null);
  assert.equal((await repo.docList("audit")).length, 1); assert.equal((await repo.docList("contact")).length, 0);
  assert.deepEqual(await runRetention(repo, NOW2), { abandonedOrders: 0, unpaidApplications: 0, sentEmails: 0, handledMessages: 0, auditEntries: 0 });
});
