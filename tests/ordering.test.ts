process.env.REQUIRE_2FA_ROLES = "";
import assert from "node:assert/strict";
import { test } from "node:test";
import { decimalToKobo, formatNaira, koboToDecimal } from "../src/lib/money";
import { parseAddOns, parseVariants, serializeAddOns, serializeVariants } from "../src/lib/menu-text";
import { createCheckout, getPublicOrder, quote, retryPayment } from "../src/server/orders";
import { canTransition } from "../src/server/status";
import { saveItem, setOrderStatus } from "../src/server/admin-api";
import { handleBachsWebhook, verifyBachsSignature } from "../src/server/webhook";
import { validateCheckout, normalisePhone } from "../src/server/validation";
import { NOW, SECRET, TOTAL, body, cart, cfg, deps, evt, signed } from "./helpers";

const codes = (r: any) => (r.ok ? [] : r.errors.map((e: any) => e.code));

test("money: kobo/decimal/format", () => {
  assert.equal(koboToDecimal(500_000), "5000.00"); assert.equal(koboToDecimal(1_130_050), "11300.50");
  assert.equal(decimalToKobo("5000.00"), 500_000); assert.equal(decimalToKobo("12.5"), 1250); assert.equal(decimalToKobo("1e3"), null); assert.equal(decimalToKobo("-5"), null); assert.equal(decimalToKobo(5), null);
  assert.equal(formatNaira(500_000), "\u20A65,000"); assert.equal(formatNaira(1_130_050), "\u20A611,300.50");
});

test("pricing: totals, variants, add-ons, ignores client prices", async () => {
  const { d } = await deps();
  const q = await quote(d, { ...cart(), lines: cart().lines.map((l: any) => ({ ...l, priceKobo: 1, unitKobo: 1, totalKobo: 1 })), totalKobo: 1 });
  assert.ok(q.ok); assert.equal(q.subtotalKobo, TOTAL); assert.equal(q.totalKobo, TOTAL); assert.equal(q.lines[0].unitKobo, 550_000);
});
test("pricing: validation of items, variants, add-ons, quantity", async () => {
  const { d } = await deps();
  const L = (l: object) => quote(d, { lines: [l] });
  assert.deepEqual(codes(await quote(d, { lines: [] })), ["EMPTY_CART"]);
  assert.deepEqual(codes(await L({ itemId: "nope", qty: 1 })), ["ITEM_NOT_FOUND"]);
  assert.deepEqual(codes(await L({ itemId: "soldout", qty: 1 })), ["ITEM_UNAVAILABLE"]);
  assert.deepEqual(codes(await L({ itemId: "off", qty: 1 })), ["ITEM_UNAVAILABLE"]);
  assert.deepEqual(codes(await L({ itemId: "hid", qty: 1 })), ["ITEM_UNAVAILABLE"]);
  for (const qty of [0, -1, 1.5, 21, "2", null]) assert.deepEqual(codes(await L({ itemId: "water", qty })), ["QTY_INVALID"], String(qty));
  assert.deepEqual(codes(await L({ itemId: "rice", qty: 1, addOnIds: ["chk"] })), ["VARIANT_REQUIRED"]);
  assert.deepEqual(codes(await L({ itemId: "rice", variantId: "xx", qty: 1, addOnIds: ["chk"] })), ["VARIANT_INVALID"]);
  assert.deepEqual(codes(await L({ itemId: "water", variantId: "s", qty: 1 })), ["VARIANT_INVALID"]);
  assert.deepEqual(codes(await L({ itemId: "rice", variantId: "s", qty: 1 })), ["ADDON_GROUP_MIN"]);
  assert.deepEqual(codes(await L({ itemId: "rice", variantId: "s", qty: 1, addOnIds: ["chk", "beef"] })), ["ADDON_GROUP_MAX"]);
  assert.deepEqual(codes(await L({ itemId: "rice", variantId: "s", qty: 1, addOnIds: ["chk", "pl", "egg", "slaw"] })).includes("ADDON_GROUP_MAX"), true);
  assert.ok(codes(await L({ itemId: "rice", variantId: "s", qty: 1, addOnIds: ["chk", "slaw"] })).includes("ADDON_UNAVAILABLE"));
  assert.ok(codes(await L({ itemId: "rice", variantId: "s", qty: 1, addOnIds: ["chk", "ghost"] })).includes("ADDON_INVALID"));
  assert.ok(codes(await L({ itemId: "rice", variantId: "s", qty: 1, addOnIds: ["chk", "chk"] })).includes("ADDON_INVALID"));
});
test("pricing: delivery, minimum order, pickup, promo", async () => {
  const { d } = await deps();
  const f = (fulfilment: object, extra: object = {}) => quote(d, { ...cart(), fulfilment, ...extra });
  const del = await f({ type: "delivery", zoneId: "z1" }); assert.ok(del.ok); assert.equal(del.deliveryFeeKobo, 100_000); assert.equal(del.totalKobo, TOTAL + 100_000);
  assert.deepEqual(codes(await f({ type: "delivery", zoneId: "z2" })), ["ZONE_INVALID"]);
  assert.deepEqual(codes(await f({ type: "delivery", zoneId: "nope" })), ["ZONE_INVALID"]);
  assert.deepEqual(codes(await quote(d, { lines: [{ itemId: "water", qty: 1 }], fulfilment: { type: "delivery", zoneId: "z1" } })), ["MIN_ORDER"]);
  assert.deepEqual(codes(await f({ type: "pickup", pickupLocationId: "zz" })), ["PICKUP_INVALID"]);
  const p = await f({ type: "pickup", pickupLocationId: "p1" }, { promoCode: " test10 " }); assert.ok(p.ok); assert.equal(p.discountKobo, Math.floor(TOTAL * 0.1)); assert.equal(p.totalKobo, TOTAL - Math.floor(TOTAL * 0.1));
  assert.deepEqual(codes(await f({ type: "pickup", pickupLocationId: "p1" }, { promoCode: "OLD" })), ["PROMO_INVALID"]);
  assert.deepEqual(codes(await f({ type: "pickup", pickupLocationId: "p1" }, { promoCode: "NOPE" })), ["PROMO_INVALID"]);
  const noF = await quote(d, cart()); assert.ok(noF.ok); assert.equal(noF.deliveryFeeKobo, 0);
});
test("pricing: catalog price changes are reflected, never client values", async () => {
  const { d, repo } = await deps(); const w = (await repo.getItem("water"))!; w.basePriceKobo = 45_000; await repo.saveItem(w);
  const q = await quote(d, { lines: [{ itemId: "water", qty: 2, priceKobo: 1 }] }); assert.ok(q.ok); assert.equal(q.totalKobo, 90_000);
});

test("validation: phone, email, name, delivery address, scheduling", () => {
  assert.equal(normalisePhone("0803 123 4567"), "+2348031234567"); assert.equal(normalisePhone("+234 803-123-4567"), "+2348031234567"); assert.equal(normalisePhone("2348031234567"), "+2348031234567");
  assert.equal(normalisePhone("0603 123 4567"), null); assert.equal(normalisePhone("12345"), null);
  const v = (o: object) => validateCheckout(body(o), NOW, cfg);
  const good = v({}); assert.ok(good.ok); assert.equal((good as any).value.customer.email, "test@example.com"); assert.equal((good as any).value.customer.phone, "+2348031234567");
  const err = (o: object) => (v(o) as any).fieldErrors ?? {};
  assert.ok(err({ customer: { name: "A", phone: "x", email: "bad" } }).name && err({ customer: { name: "A", phone: "x", email: "bad" } }).phone && err({ customer: { name: "A", phone: "x", email: "bad" } }).email);
  assert.ok(err({ fulfilment: { type: "delivery", zoneId: "z1", address: "short" } }).address);
  assert.ok(err({ fulfilment: { type: "other" } }).fulfilmentType); assert.ok(err({ idempotencyKey: "short" }).idempotencyKey);
  const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();
  assert.ok(err({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: at(10) } }).scheduledFor);
  assert.ok(v({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: at(120) } }).ok);
  assert.ok(err({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: at(60 * 24 * 8) } }).scheduledFor);
  assert.ok(err({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: "garbage" } }).scheduledFor);
  const hours = { ...cfg, scheduling: { ...cfg.scheduling, hours: { open: "09:00", close: "20:00" } } };
  const late = new Date("2026-10-10T20:30:00Z").toISOString(); // 21:30 Lagos
  assert.ok(!validateCheckout(body({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: late } }), NOW, hours).ok);
  assert.ok(validateCheckout(body({ fulfilment: { type: "pickup", pickupLocationId: "p1", scheduledFor: "2026-10-10T14:00:00Z" } }), NOW, hours).ok);
});

test("checkout: creates order with server total, starts one Bachs session", async () => {
  const { d, gw, repo } = await deps();
  const r = await createCheckout(d, body({ lines: cart().lines.map((l: any) => ({ ...l, priceKobo: 1 })), totalKobo: 1 }));
  assert.ok(r.ok); assert.equal(r.checkoutUrl, "https://checkout.example/c/1"); assert.match(r.orderNumber, /^EF-261010-[A-Z2-9]{4}$/);
  const o = (await repo.findOrderByNumber(r.orderNumber))!; assert.equal(o.totalKobo, TOTAL); assert.equal(o.status, "pending_payment"); assert.equal(o.paymentStatus, "pending");
  assert.equal(gw.calls.length, 1); const c = gw.calls[0]; assert.equal(c.amountKobo, TOTAL); assert.equal(c.reference, o.orderNumber);
  assert.equal(c.successUrl, `https://shop.test/order/${o.orderNumber}/${o.publicToken}`); assert.ok(!c.successUrl.includes("?"));
});
test("checkout: double submit and concurrent submits create ONE order and ONE session", async () => {
  const { d, gw, repo } = await deps(); gw.delayMs = 20;
  const [a, b, c] = await Promise.all([createCheckout(d, body()), createCheckout(d, body()), createCheckout(d, body())]);
  assert.ok(a.ok && b.ok && c.ok); assert.equal(a.orderNumber, b.orderNumber); assert.equal(b.orderNumber, c.orderNumber);
  const again = await createCheckout(d, body()); assert.ok(again.ok); assert.equal(again.orderNumber, a.orderNumber); assert.equal(again.checkoutUrl, a.checkoutUrl);
  assert.equal(gw.calls.length, 1); assert.equal((await repo.listOrders()).length, 1);
});
test("checkout: same key with a changed cart is rejected", async () => {
  const { d } = await deps(); assert.ok((await createCheckout(d, body())).ok);
  const r = await createCheckout(d, body({ lines: [{ itemId: "water", qty: 5 }] })); assert.ok(!r.ok); assert.equal(r.code, "IDEMPOTENCY_KEY_REUSED"); assert.equal(r.status, 409);
});
test("checkout: invalid input and invalid cart do not create orders", async () => {
  const { d, gw, repo } = await deps();
  const a = await createCheckout(d, body({ customer: { name: "", phone: "1", email: "x" } })); assert.ok(!a.ok && a.code === "VALIDATION_FAILED" && a.fieldErrors);
  const b = await createCheckout(d, body({ lines: [{ itemId: "soldout", qty: 1 }] })); assert.ok(!b.ok && b.code === "CART_INVALID");
  const c = await createCheckout(d, body({ fulfilment: { type: "delivery", zoneId: "z1", address: "12 Long Test Street, Somewhere" }, lines: [{ itemId: "water", qty: 1 }] })); assert.ok(!c.ok && c.errors![0].code === "MIN_ORDER");
  assert.equal(gw.calls.length, 0); assert.equal((await repo.listOrders()).length, 0);
});
test("checkout: gateway failure keeps order unpaid and retry with same key reuses the reference", async () => {
  const { d, gw, repo } = await deps(); gw.fail = true;
  const a = await createCheckout(d, body()); assert.ok(!a.ok); assert.equal((a as any).code, "PAYMENT_START_FAILED");
  const o = (await repo.listOrders())[0]; assert.equal(o.paymentStatus, "pending"); assert.equal(o.status, "pending_payment");
  gw.fail = false; const b = await createCheckout(d, body()); assert.ok(b.ok); assert.equal((await repo.listOrders()).length, 1);
  assert.equal(gw.calls[0].reference, gw.calls[1].reference);
});

const open = async () => { const x = await deps(); const r = await createCheckout(x.d, body()); assert.ok(r.ok); return { ...x, r, ref: r.orderNumber }; };
const hook = (x: { repo: any }, payload: object, o: object = {}) => { const s = signed(payload, o); return handleBachsWebhook(s.raw, s.headers, { repo: x.repo, secrets: [SECRET], now: () => NOW }); };
const success = (ref: string, over: object = {}) => evt("collection.succeeded", { charge_id: "ch_1", checkout_id: "chk_1", reference: ref, status: "SUCCEEDED", amount: "11300.00", currency: "NGN", ...over });

test("payment: success page alone never marks paid; only a verified webhook does", async () => {
  const x = await open(); const view = await getPublicOrder(x.d, x.r.orderNumber, x.r.token); assert.equal(view!.paymentStatus, "pending"); assert.equal(view!.status, "pending_payment");
  const res = await hook(x, success(x.ref)); assert.equal(res.status, 200);
  const o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.paymentStatus, "paid"); assert.equal(o.status, "confirmed"); assert.ok(o.paidAt); assert.equal(o.attempts[0].status, "succeeded");
});
test("webhook: bad/stale/tampered signatures are rejected and change nothing", async () => {
  const x = await open(); const p = success(x.ref);
  const wrong = signed(p, { secret: "other_secret_value_xx" }); assert.equal((await handleBachsWebhook(wrong.raw, wrong.headers, { repo: x.repo, secrets: [SECRET], now: () => NOW })).status, 400);
  const stale = signed(p, { t: Math.floor(NOW.getTime() / 1000) - 3600 }); assert.equal((await handleBachsWebhook(stale.raw, stale.headers, { repo: x.repo, secrets: [SECRET], now: () => NOW })).status, 400);
  const s = signed(p); assert.equal((await handleBachsWebhook(s.raw.replace("11300.00", "1.00"), s.headers, { repo: x.repo, secrets: [SECRET], now: () => NOW })).status, 400);
  assert.equal((await handleBachsWebhook(s.raw, { get: () => null }, { repo: x.repo, secrets: [SECRET], now: () => NOW })).status, 400);
  assert.equal((await handleBachsWebhook(s.raw, s.headers, { repo: x.repo, secrets: [], now: () => NOW })).status, 400);
  assert.equal((await x.repo.findOrderByNumber(x.ref))!.paymentStatus, "pending");
});
test("webhook: secret rotation (two v1 signatures) and legacy headers verify", () => {
  const s = signed({ a: 1 }, { secret: "old_secret_value_xx", extraSecret: SECRET });
  assert.ok(verifyBachsSignature(s.raw, s.headers, [SECRET], NOW.getTime()));
  const raw = '{"a":1}'; const t = String(Math.floor(NOW.getTime() / 1000));
  const sig = require("node:crypto").createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
  const h = new Map([["x-bachs-timestamp", t], ["x-bachs-signature", sig]]);
  assert.ok(verifyBachsSignature(raw, { get: (n) => h.get(n) ?? null }, [SECRET], NOW.getTime()));
});
test("webhook: duplicate event delivery is processed once", async () => {
  const x = await open(); const e = success(x.ref); assert.equal((await hook(x, e)).body, "ok"); assert.equal((await hook(x, e)).body, "duplicate");
});
test("webhook: amount/currency mismatch and non-SUCCEEDED statuses need review, not confirmed", async () => {
  for (const over of [{ amount: "11299.00" }, { currency: "USD" }, { status: "ACCEPTED" }, { status: "OVERPAID" }]) {
    const x = await open(); await hook(x, success(x.ref, over)); const o = (await x.repo.findOrderByNumber(x.ref))!;
    assert.equal(o.paymentStatus, "needs_review", JSON.stringify(over)); assert.equal(o.status, "pending_payment"); assert.equal(o.paidAt, null);
  }
});
test("webhook: unknown reference and unknown events are acknowledged and ignored", async () => {
  const x = await open(); assert.equal((await hook(x, success("EF-000000-ZZZZ"))).body, "unknown reference"); assert.equal((await hook(x, evt("customer.created", {}))).body, "ignored");
});
test("payment: failed then retry creates a new reference; late failure of old attempt does not break the new one", async () => {
  const x = await open(); await hook(x, evt("collection.failed", { reference: x.ref, charge_id: "ch_a", status: "FAILED", reason: "Declined" }));
  let o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.paymentStatus, "failed");
  const view = await getPublicOrder(x.d, x.ref, x.r.token); assert.equal(view!.canRetryPayment, true);
  const r2 = await retryPayment(x.d, x.ref, x.r.token); assert.ok(r2.ok); o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.attempts.length, 2); assert.equal(o.attempts[1].reference, `${x.ref}-A2`); assert.equal(o.paymentStatus, "pending");
  await hook(x, evt("collection.failed", { reference: x.ref, charge_id: "ch_a", status: "FAILED" })); // replay-like late event for attempt 1
  assert.equal((await x.repo.findOrderByNumber(x.ref))!.paymentStatus, "pending");
  await hook(x, success(`${x.ref}-A2`, { charge_id: "ch_2" })); o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.paymentStatus, "paid"); assert.equal(o.status, "confirmed");
});
test("payment: retry never opens a parallel session while one is open; needs-review blocks retry; wrong token 404", async () => {
  const x = await open(); const r = await retryPayment(x.d, x.ref, x.r.token); assert.ok(r.ok); assert.equal(r.checkoutUrl, x.r.checkoutUrl); assert.equal(x.gw.calls.length, 1);
  const bad = await retryPayment(x.d, x.ref, "wrong-token-value-1234"); assert.ok(!bad.ok && bad.status === 404);
  await hook(x, success(x.ref, { amount: "1.00" })); const blocked = await retryPayment(x.d, x.ref, x.r.token); assert.ok(!blocked.ok && blocked.code === "PAYMENT_UNDER_REVIEW");
});
test("payment: a second charge on a paid order is flagged as a duplicate for refund", async () => {
  const x = await open(); await hook(x, evt("collection.failed", { reference: x.ref, status: "FAILED" })); await retryPayment(x.d, x.ref, x.r.token);
  await hook(x, success(`${x.ref}-A2`, { charge_id: "ch_2" })); await hook(x, success(x.ref, { charge_id: "ch_1" }));
  const o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.paymentStatus, "needs_review"); assert.ok(o.notes.some((n) => n.includes("DUPLICATE CHARGE"))); assert.ok(o.paidAt);
});
test("payment: expired checkout and refund events", async () => {
  const x = await open(); await hook(x, evt("checkout.expired", { reference: x.ref })); assert.equal((await x.repo.findOrderByNumber(x.ref))!.paymentStatus, "expired");
  const y = await open(); await hook(y, success(y.ref)); await hook(y, evt("refund.paid", { refund_id: "ref_1", charge_id: "ch_1", reference: "refund_1", status: "paid", refunded_amount: "5000.00" }));
  assert.equal((await y.repo.findOrderByNumber(y.ref))!.paymentStatus, "partially_refunded");
  await hook(y, evt("refund.paid", { refund_id: "ref_2", charge_id: "ch_1", reference: "refund_2", status: "paid", refunded_amount: "11300.00" })); assert.equal((await y.repo.findOrderByNumber(y.ref))!.paymentStatus, "refunded");
});
test("payment: payment for a cancelled order is flagged", async () => {
  const x = await open(); assert.equal((await setOrderStatus(x.repo, x.ref, "cancelled")).status, 200); await hook(x, success(x.ref));
  const o = (await x.repo.findOrderByNumber(x.ref))!; assert.equal(o.paymentStatus, "needs_review"); assert.equal(o.status, "cancelled");
});
test("public order view hides secrets and masks phone; wrong token returns null", async () => {
  const x = await open(); const v: any = await getPublicOrder(x.d, x.ref, x.r.token);
  assert.ok(!("publicToken" in v) && !("idempotencyKey" in v) && !("attempts" in v)); assert.equal(v.phoneMasked, "+234******4567"); assert.equal(v.totalKobo, TOTAL);
  assert.equal(await getPublicOrder(x.d, x.ref, "nope"), null); assert.equal(await getPublicOrder(x.d, "EF-NOPE", x.r.token), null);
});

test("status machine and admin status updates", async () => {
  const x = await open(); assert.equal((await setOrderStatus(x.repo, x.ref, "preparing")).status, 409); await hook(x, success(x.ref));
  for (const s of ["preparing", "ready"] as const) assert.equal((await setOrderStatus(x.repo, x.ref, s)).status, 200);
  assert.equal((await setOrderStatus(x.repo, x.ref, "completed")).status, 200);
  assert.equal((await setOrderStatus(x.repo, x.ref, "preparing")).status, 409); assert.equal((await setOrderStatus(x.repo, "EF-NONE", "ready")).status, 404);
  const del = { status: "ready", fulfilment: { type: "delivery" }, paymentStatus: "paid" } as any; assert.equal(canTransition(del, "completed").ok, false); assert.equal(canTransition(del, "out_for_delivery").ok, true);
  assert.equal(canTransition({ ...del, fulfilment: { type: "pickup" } }, "out_for_delivery").ok, false);
});
test("admin: item validation and add-on text editor round trip", async () => {
  const { repo } = await deps(); const ok = { name: "New Dish", categoryId: "c1", basePriceKobo: 120_000, description: "x" };
  const created: any = await saveItem(repo, ok); assert.equal(created.status, 201); assert.equal((await repo.getItem(created.body.id))!.name, "New Dish");
  assert.equal((await saveItem(repo, { ...ok, basePriceKobo: 0 })).status, 422); assert.equal((await saveItem(repo, { ...ok, categoryId: "zz" })).status, 422); assert.equal((await saveItem(repo, { ...ok, basePriceKobo: 12.5 })).status, 422);
  assert.equal((await saveItem(repo, { ...ok, imageUrl: "javascript:alert(1)", imageAlt: "a" })).status, 422); assert.equal((await saveItem(repo, { ...ok, imageUrl: "/media/food/a.jpg" })).status, 422);
  assert.equal((await saveItem(repo, { ...ok, imageUrl: "/media/food/a.jpg", imageAlt: "A dish" })).status, 201);
  const dis: any = await saveItem(repo, { ...ok, active: false, available: false }, created.body.id); assert.equal(dis.status, 200); assert.equal(dis.body.active, false);
  const v = parseVariants("Small | 2000\nLarge | 3500.50"); assert.ok(v.ok && v.value[1].priceKobo === 350_050); assert.ok(!parseVariants("Bad line").ok); assert.equal(serializeVariants((v as any).value), "Small | 2000\nLarge | 3500.50");
  const a = parseAddOns("# Extras | 0 | 2\n- Egg | 300\n- Plantain | 500"); assert.ok(a.ok && a.value[0].options.length === 2); assert.ok(!parseAddOns("- orphan | 1").ok); assert.ok(!parseAddOns("# G | 3 | 1").ok);
  assert.ok(serializeAddOns((a as any).value).startsWith("# Extras | 0 | 2"));
});
