import assert from "node:assert/strict";
import { test } from "node:test";
import { seedAll } from "../prisma/seed-data";
import { qrMatrix, qrSvg } from "../src/lib/qr";
import { MemoryRepo } from "../src/server/repo";
import { adminVipApi, buildVipMessage, createVipOrder, getVipSettings, listVipItems, publicVip, saveVipItem, saveVipSettings } from "../src/server/vip/service";

const NOW = new Date("2026-11-06T10:00:00Z");
async function setup() { const repo = new MemoryRepo(); await seedAll(repo, () => {}); return { repo, items: await listVipItems(repo) }; }
const turnOn = (repo: MemoryRepo, whatsapp = "+2348012345678") => saveVipSettings(repo, { enabled: true, mode: "whatsapp", whatsapp, title: "VIP Menu", tableLabel: "Table" });

test("the VIP menu starts static and separate from the regular menu", async () => {
  const { repo, items } = await setup(); const s = await getVipSettings(repo); assert.equal(s.mode, "static"); assert.ok(items.length >= 8);
  const pub = await publicVip(repo, "2348099999999"); assert.equal(pub.orderable, false, "static mode shows no ordering"); assert.ok(pub.categories.length >= 3);
  assert.ok(!JSON.stringify(pub).includes("2348099999999"), "the WhatsApp number is never sent to the browser");
  const regular = (await repo.listItems()).map((i) => i.id); assert.ok(items.every((i) => !regular.includes(i.id)), "VIP items are not in the regular menu");
  const r = await createVipOrder(repo, { lines: [{ itemId: items[0].id, qty: 1 }] }, { now: NOW, fallbackDigits: "2348099999999" }); assert.equal(r.status, 409, "static mode refuses orders");
});
test("WhatsApp order: priced by the server, saved with a reference, message lists everything", async () => {
  const { repo, items } = await setup(); await turnOn(repo as MemoryRepo);
  const jollof = items.find((i) => i.name === "Jollof Rice")!, cat = items.find((i) => i.name === "Grilled Catfish")!;
  const r = await createVipOrder(repo, { table: "VIP 5", note: "Please serve together", lines: [{ itemId: jollof.id, qty: 2, note: "less pepper", priceKobo: 1 }, { itemId: cat.id, qty: 1 }] }, { now: NOW, fallbackDigits: null }); assert.equal(r.status, 201, JSON.stringify(r.body));
  const b = r.body as any; assert.match(b.ref, /^VIP-\d{6}-[A-Z0-9]{4}$/); assert.equal(b.totalKobo, 2 * 250_000 + 600_000, "price comes from the menu, not the browser");
  assert.ok(b.whatsappUrl.startsWith("https://wa.me/2348012345678?text=")); const msg = decodeURIComponent(b.whatsappUrl.split("?text=")[1]); assert.equal(msg, b.message);
  for (const part of ["NEW VIP ORDER", `VIP order reference: ${b.ref}`, "Table: VIP 5", "1. Jollof Rice x2 @ ₦2,500 = ₦5,000", "Note: less pepper", "2. Grilled Catfish x1 @ ₦6,000 = ₦6,000", "Total: ₦11,000", "Special instructions: Please serve together"]) assert.ok(msg.includes(part), part);
  assert.equal((await repo.docList("viporder")).length, 1, "the order is saved for the admin");
});
test("falls back to the business WhatsApp number when no VIP number is set", async () => {
  const { repo, items } = await setup(); await saveVipSettings(repo, { enabled: true, mode: "whatsapp", whatsapp: "" });
  assert.equal((await publicVip(repo, null)).orderable, false, "no number anywhere: cannot order"); assert.equal((await publicVip(repo, "2348055555555")).orderable, true);
  const r = await createVipOrder(repo, { lines: [{ itemId: items[0].id, qty: 1 }] }, { now: NOW, fallbackDigits: "2348055555555" }); assert.ok((r.body as any).whatsappUrl.includes("wa.me/2348055555555"));
});
test("bad orders are rejected: unavailable, hidden, unknown, wrong quantity, empty, duplicates", async () => {
  const { repo, items } = await setup(); await turnOn(repo as MemoryRepo); const o = (lines: unknown, extra = {}) => createVipOrder(repo, { lines, ...extra }, { now: NOW, fallbackDigits: null });
  const [a, b] = items; await saveVipItem(repo, { ...a, available: false }, a.id); await saveVipItem(repo, { ...b, active: false }, b.id);
  const sold: any = await o([{ itemId: a.id, qty: 1 }]); assert.equal(sold.status, 409, "sold-out item"); assert.match(JSON.stringify(sold.body), /not available/); assert.deepEqual(sold.body.unavailable, [a.name]);
  const c = items[2]; assert.equal((await o([{ itemId: b.id, qty: 1 }])).status, 409, "a hidden item gets the same friendly message"); assert.equal((await o([{ itemId: "nope", qty: 1 }])).status, 422, "unknown item");
  for (const qty of [0, -1, 21, 1.5, "x"]) assert.equal((await o([{ itemId: c.id, qty }])).status, 422, `qty ${qty}`);
  assert.equal((await o([])).status, 422); assert.equal((await o([{ itemId: c.id, qty: 1 }, { itemId: c.id, qty: 1 }])).status, 422); assert.equal((await o("nope")).status, 422);
  assert.equal((await repo.docList("viporder")).length, 0, "nothing saved for rejected orders");
});
test("long notes cannot break the WhatsApp link, and the table label is cleaned", async () => {
  const { repo, items } = await setup(); await turnOn(repo as MemoryRepo);
  const r = await createVipOrder(repo, { table: "<b>7</b>; DROP", note: "x".repeat(5000), lines: items.slice(0, 8).map((i) => ({ itemId: i.id, qty: 1, note: "y".repeat(500) })) }, { now: NOW, fallbackDigits: null }); assert.equal(r.status, 201); const b = r.body as any;
  assert.ok(b.whatsappUrl.length < 2100, `link length ${b.whatsappUrl.length}`); assert.ok(!b.message.includes("<b>"), "markup stripped from the table"); assert.ok((await repo.docList<any>("viporder"))[0].note.length <= 300, "stored note is capped");
  const m = buildVipMessage({ ref: "VIP-1", table: null, lines: [{ itemId: "a", name: "A", unitKobo: 100_000, qty: 1, note: null }], totalKobo: 100_000, note: null, createdAt: "" }); assert.ok(!m.includes("Table:"));
});
test("admin API: settings validation, items CRUD, category with items cannot be deleted", async () => {
  const { repo, items } = await setup(); assert.equal((await saveVipSettings(repo, { mode: "whatsapp", whatsapp: "12345" })).status, 422, "number needs a country code");
  const menu: any = (await adminVipApi(repo, "GET", ["menu"], null)).body; const cat = menu.categories[0];
  assert.equal((await adminVipApi(repo, "DELETE", ["categories", cat.id], null)).status, 409, "category still has items");
  assert.equal((await adminVipApi(repo, "POST", ["items"], { name: "x", categoryId: cat.id, priceKobo: 0 })).status, 422, "price above zero"); assert.equal((await adminVipApi(repo, "POST", ["items"], { name: "Test Dish", categoryId: "missing", priceKobo: 100 })).status, 422);
  const made: any = (await adminVipApi(repo, "POST", ["items"], { name: "Test Dish", categoryId: cat.id, priceKobo: 123_400, imageUrl: "/uploads/" + "a".repeat(32) + ".jpg" })).body; assert.equal((await adminVipApi(repo, "PUT", ["items", made.id], { ...made, priceKobo: 200_000, name: "Renamed" })).status, 200);
  assert.equal((await listVipItems(repo)).find((i) => i.id === made.id)!.name, "Renamed"); assert.equal((await adminVipApi(repo, "DELETE", ["items", made.id], null)).status, 200); assert.equal((await listVipItems(repo)).length, items.length);
  assert.equal((await adminVipApi(repo, "POST", ["items"], { name: "Bad", categoryId: cat.id, priceKobo: 100, imageUrl: "javascript:alert(1)" })).status, 422, "unsafe image link refused");
});
test("QR codes: right size per version, finder patterns present, deterministic, too-long link refused", () => {
  const a = qrMatrix("https://everfresh-web.vercel.app/vip?t=5"); assert.equal(a.length, 29); const same = qrMatrix("https://everfresh-web.vercel.app/vip?t=5"); assert.deepEqual(a, same);
  const finder = (r: number, c: number) => [0, 1, 2, 3, 4, 5, 6].every((i) => a[r][c + i] && a[r + 6][c + i] && a[r + i][c] && a[r + i][c + 6]) && !a[r + 1][c + 1] && a[r + 3][c + 3]; assert.ok(finder(0, 0) && finder(0, a.length - 7) && finder(a.length - 7, 0));
  assert.equal(qrMatrix("hi").length, 21); assert.equal(qrMatrix("x".repeat(213)).length, 57); assert.throws(() => qrMatrix("x".repeat(300)), /too long/);
  const svg = qrSvg("https://a.co/v"); assert.ok(svg.startsWith("<svg") && svg.includes("viewBox"));
});
