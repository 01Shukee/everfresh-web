import assert from "node:assert/strict";
import { test } from "node:test";
import { baseRef } from "../src/lib/refs";
import { createCheckout } from "../src/server/orders";
import { MemoryRepo } from "../src/server/repo";
import { createEnquiry, adminEnquiry, staffAction } from "../src/server/catering/service";
import { adminVocApi } from "../src/server/voc/api";
import { createApplication, startApplicationPayment, startInvoicePayment, getApp, type VocDeps } from "../src/server/voc/applications";
import { saveContent } from "../src/server/voc/admin";
import { invoiceTotals, type Application, type Invoice } from "../src/server/voc/model";
import { handleBachsWebhook } from "../src/server/webhook";
import { FakeGateway, NOW, SECRET, body, cats, deps, evt, items, signed } from "./helpers";

const hook = (repo: MemoryRepo, payload: object) => { const s = signed(payload); return handleBachsWebhook(s.raw, s.headers, { repo, secrets: [SECRET], now: () => NOW }); };
const ok = (ref: string, over: object = {}, id = "ch_1") => evt("collection.succeeded", { charge_id: id, checkout_id: "c", reference: ref, status: "SUCCEEDED", amount: "11300.00", currency: "NGN", ...over });

test("locking: simultaneous staff actions on one enquiry are all kept (no lost updates)", async () => {
  const repo = new MemoryRepo(); const d = { repo, whatsappDigits: null, now: () => NOW };
  const r: any = await createEnquiry(d, { idempotencyKey: "conc-key-0123456789ab", name: "Test Person", phone: "08031234567", eventType: "Wedding", eventDate: "2026-12-12", location: "Hall", guests: 10 });
  const S = (a: string, b: object) => staffAction(repo, r.ref, a, b, NOW);
  await Promise.all([S("note", { text: "n1" }), S("note", { text: "n2" }), S("contact", { method: "call", direction: "outbound", summary: "c1" }), S("quote", { status: "draft", amountKobo: 100 }), S("note", { text: "n3" }), S("whatsapp-received", {})]);
  const e = (await adminEnquiry(repo, r.ref))!; assert.equal(e.notes.length, 3); assert.equal(e.contacts.length, 1); assert.equal(e.quotes.length, 1); assert.ok(e.whatsapp.staffConfirmedAt);
});
test("locking: concurrent webhooks for one order end in the right state (late failure + success + duplicate)", async () => {
  const x = await deps(); const r: any = await createCheckout(x.d, body()); assert.ok(r.ok);
  await hook(x.repo as MemoryRepo, evt("collection.failed", { reference: r.orderNumber, status: "FAILED" })); await (await import("../src/server/orders")).retryPayment(x.d, r.orderNumber, r.token);
  const A2 = `${r.orderNumber}-A2`; const lateFail = evt("collection.failed", { reference: r.orderNumber, status: "FAILED" });
  await Promise.all([hook(x.repo as MemoryRepo, ok(A2, {}, "ch_2")), hook(x.repo as MemoryRepo, lateFail), hook(x.repo as MemoryRepo, ok(A2, {}, "ch_2"))]);
  const o = (await x.repo.findOrderByNumber(r.orderNumber))!; assert.equal(o.paymentStatus, "paid"); assert.equal(o.status, "confirmed");
});
test("locking: two different charges for one order arriving together => exactly one paid, the other flagged for refund", async () => {
  const x = await deps(); const r: any = await createCheckout(x.d, body()); await hook(x.repo as MemoryRepo, evt("collection.failed", { reference: r.orderNumber, status: "FAILED" })); await (await import("../src/server/orders")).retryPayment(x.d, r.orderNumber, r.token);
  await Promise.all([hook(x.repo as MemoryRepo, ok(r.orderNumber, {}, "ch_a")), hook(x.repo as MemoryRepo, ok(`${r.orderNumber}-A2`, {}, "ch_b"))]);
  const o = (await x.repo.findOrderByNumber(r.orderNumber))!; assert.equal(o.attempts.filter((a) => a.status === "succeeded").length, 1); assert.equal(o.attempts.filter((a) => a.status === "needs_review").length, 1); assert.ok(o.notes.some((n) => n.includes("DUPLICATE CHARGE")));
});
async function vocSetup() {
  const repo = new MemoryRepo(); const gw = new FakeGateway(); const d: VocDeps = { repo, gateway: gw, siteUrl: "https://shop.test", now: () => NOW }; await saveContent(repo, "regular-3y", { open: true, published: true });
  const a: any = await createApplication(d, { idempotencyKey: "conc-app-0123456789", variantId: "regular-3y", details: { fullName: "Test Person", phone: "08031234567", email: "a@example.com", address: "12 Test Street, Town" } }); await startApplicationPayment(d, a.ref, a.token); await hook(repo, evt("collection.succeeded", { charge_id: "ch_f", reference: a.ref, status: "SUCCEEDED", amount: "5000.00", currency: "NGN" }));
  const mk: any = await adminVocApi(d, "POST", ["applications", a.ref, "invoices"], { lines: [{ kind: "tuition", label: "TEST", amountKobo: 1_000_000 }] }, new URLSearchParams()); await adminVocApi(d, "PUT", ["invoices", mk.body.number], { action: "issue" }, new URLSearchParams());
  return { repo, gw, d, a, num: mk.body.number as string };
}
test("locking: an online invoice payment and a manual payment racing never overpay the invoice", async () => {
  const { repo, d, a, num, gw } = await vocSetup(); const p: any = await startInvoicePayment(d, a.ref, a.token); assert.ok(p.ok); const call = gw.calls[gw.calls.length - 1];
  const manual = adminVocApi(d, "POST", ["invoices", num, "payments"], { amountKobo: 600_000, reference: "TELLER-1" }, new URLSearchParams());
  const online = hook(repo, evt("collection.succeeded", { charge_id: "ch_inv", reference: call.reference, status: "SUCCEEDED", amount: "10000.00", currency: "NGN" }));
  await Promise.all([manual, online]); const inv = (await repo.docGet<Invoice>("invoice", num))!; const t = invoiceTotals(inv);
  assert.ok(t.paidKobo <= 1_000_000, `overpaid: ${t.paidKobo}`); assert.ok(t.outstandingKobo >= 0); assert.equal(inv.payments.length + inv.attempts.filter((x) => x.status === "needs_review").length >= 1, true);
});
test("references: a base that ends in '-A123' is not mistaken for an attempt suffix", async () => {
  assert.equal(baseRef("VA-261010-A123"), "VA-261010-A123"); assert.equal(baseRef("VA-261010-A123-A2"), "VA-261010-A123"); assert.equal(baseRef("VI-261010-P123-P2"), "VI-261010-P123"); assert.equal(baseRef("EF-261010-ABCD-A3"), "EF-261010-ABCD");
  const repo = new MemoryRepo(); const ref = "VA-261010-A123"; const app: Application = { ref, token: "t", idempotencyKey: "k", variantId: "regular-3y", course: null, details: { fullName: "T P", phone: "+2348031234567", email: "a@b.co", dob: null, address: "12 Test Street", education: null, emergencyName: null, emergencyPhone: null, additional: null }, status: "awaiting_payment", feeKobo: 500_000, payment: { status: "pending", paidAt: null, receiptNumber: null, attempts: [{ reference: ref, checkoutId: "c", checkoutUrl: "u", status: "open", chargeId: null, createdAt: "", error: null, amountKobo: 500_000 }] }, notes: [], createdAt: "", updatedAt: "", submittedAt: null };
  await repo.docPut("app", ref, app); assert.equal((await hook(repo, evt("collection.succeeded", { charge_id: "ch_x", reference: ref, status: "SUCCEEDED", amount: "5000.00", currency: "NGN" }))).body, "ok");
  assert.equal((await getApp(repo, ref))!.payment.status, "paid");
});
void cats; void items;
