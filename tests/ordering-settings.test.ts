import assert from "node:assert/strict";
import { test } from "node:test";
import { getOrderingConfig, saveOrderingSettings, validateOrderingSettings } from "../src/server/ordering-settings";
import { createCheckout, quote } from "../src/server/orders";
import { MemoryRepo } from "../src/server/repo";
import { validateCheckout } from "../src/server/validation";
import { FakeGateway, NOW, body, cats, cart, items } from "./helpers";

const ok = { zones: [{ name: "Test Zone", feeKobo: 100_000, minOrderKobo: 300_000 }, { name: "Closed Zone", feeKobo: 50_000, minOrderKobo: 0, active: false }], pickupLocations: [{ name: "Test Pickup", address: "1 Test Road" }], scheduling: { enabled: true, leadMinutes: 90, maxDaysAhead: 5, hours: { open: "09:00", close: "20:00" } }, promos: [{ code: "save10", type: "percent", value: 10, minOrderKobo: 100_000, expiresAt: "2099-01-01" }, { code: "OFF500", type: "fixed", value: 50_000, minOrderKobo: 0 }] };
async function env() { const repo = new MemoryRepo(); for (const c of cats) await repo.saveCategory(c); for (const i of items) await repo.saveItem(i); const cfg = async () => await getOrderingConfig(repo); return { repo, cfg }; }
test("defaults: nothing is offered until the business sets it up", async () => { const { cfg } = await env(); const c = await cfg(); assert.equal(c.zones.length, 0); assert.equal(c.pickupLocations.length, 0); assert.equal(c.promos.length, 0); });
test("validation: bad areas, fees, hours, promo codes and duplicates are refused with a message", () => {
  const bad = (o: object) => assert.equal(validateOrderingSettings({ ...ok, ...o }).ok, false, JSON.stringify(o).slice(0, 70));
  bad({ zones: [{ name: "", feeKobo: 1, minOrderKobo: 0 }] }); bad({ zones: [{ name: "A", feeKobo: -1, minOrderKobo: 0 }] }); bad({ zones: [{ name: "A", feeKobo: 1.5, minOrderKobo: 0 }] }); bad({ zones: [{ name: "A", feeKobo: 1, minOrderKobo: 0 }, { name: "a", feeKobo: 1, minOrderKobo: 0 }] });
  bad({ pickupLocations: [{ name: "A", address: "" }] }); bad({ scheduling: { enabled: true, leadMinutes: -5, maxDaysAhead: 5 } }); bad({ scheduling: { enabled: true, leadMinutes: 5, maxDaysAhead: 0 } }); bad({ scheduling: { enabled: true, leadMinutes: 5, maxDaysAhead: 5, hours: { open: "20:00", close: "09:00" } } }); bad({ scheduling: { enabled: true, leadMinutes: 5, maxDaysAhead: 5, hours: { open: "9am", close: "5pm" } } });
  bad({ promos: [{ code: "x", type: "percent", value: 10, minOrderKobo: 0 }] }); bad({ promos: [{ code: "ABC", type: "percent", value: 150, minOrderKobo: 0 }] }); bad({ promos: [{ code: "ABC", type: "weird", value: 1, minOrderKobo: 0 }] }); bad({ promos: [{ code: "ABC", type: "fixed", value: 5, minOrderKobo: 0 }, { code: "abc", type: "fixed", value: 5, minOrderKobo: 0 }] });
  assert.equal(validateOrderingSettings(null).ok, false);
});
test("saved settings persist and drive pricing: delivery fee, minimum order, closed areas, pickup, promos", async () => {
  const { repo, cfg } = await env(); assert.ok((await saveOrderingSettings(repo, ok)).ok); const c = await cfg(); assert.equal(c.zones.length, 2); assert.equal(c.promos[0].code, "SAVE10");
  const deps = { repo, gateway: new FakeGateway(), cfg: c, siteUrl: "https://shop.test", now: () => NOW }; const lines = cart().lines;
  const d: any = await quote(deps, { lines, fulfilment: { type: "delivery", zoneId: "test-zone" } }); assert.ok(d.ok); assert.equal(d.deliveryFeeKobo, 100_000);
  assert.equal(((await quote(deps, { lines, fulfilment: { type: "delivery", zoneId: "closed-zone" } })) as any).errors[0].code, "ZONE_INVALID"); assert.equal(((await quote(deps, { lines: [{ itemId: "water", qty: 1 }], fulfilment: { type: "delivery", zoneId: "test-zone" } })) as any).errors[0].code, "MIN_ORDER");
  assert.ok(((await quote(deps, { lines, fulfilment: { type: "pickup", pickupLocationId: "test-pickup" } })) as any).ok); const p: any = await quote(deps, { lines, promoCode: "save10" }); assert.equal(p.discountKobo, Math.floor(p.subtotalKobo * 0.1)); assert.equal(((await quote(deps, { lines, promoCode: "OFF500" })) as any).discountKobo, 50_000);
  const order: any = await createCheckout(deps, body({ fulfilment: { type: "delivery", zoneId: "test-zone", address: "12 Long Test Street, Somewhere" }, lines })); assert.ok(order.ok); assert.equal((await repo.findOrderByNumber(order.orderNumber))!.deliveryFeeKobo, 100_000);
  await saveOrderingSettings(repo, { ...ok, zones: [] }); const c2 = await cfg(); assert.equal(((await quote({ ...deps, cfg: c2 }, { lines, fulfilment: { type: "delivery", zoneId: "test-zone" } })) as any).errors[0].code, "ZONE_INVALID");
});
test("scheduling rules from settings are enforced at checkout (notice, days ahead, hours, switched off)", async () => {
  const { repo, cfg } = await env(); await saveOrderingSettings(repo, ok); const c = await cfg(); const at = (iso: string) => validateCheckout(body({ fulfilment: { type: "pickup", pickupLocationId: "test-pickup", scheduledFor: iso } }), NOW, c) as any;
  assert.ok(at("2026-10-10T10:30:00Z").fieldErrors.scheduledFor); assert.ok(at("2026-10-10T12:00:00Z").ok); assert.ok(at("2026-10-20T12:00:00Z").fieldErrors.scheduledFor); assert.ok(at("2026-10-10T22:30:00Z").fieldErrors.scheduledFor);
  await saveOrderingSettings(repo, { ...ok, scheduling: { enabled: false, leadMinutes: 30, maxDaysAhead: 3, hours: null } }); assert.ok((validateCheckout(body({ fulfilment: { type: "pickup", scheduledFor: "2026-10-10T14:00:00Z" } }), NOW, await cfg()) as any).fieldErrors.scheduledFor);
});
