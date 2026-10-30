import assert from "node:assert/strict";
import { test } from "node:test";
import { adminCateringApi, cateringApi } from "../src/server/catering/api";
import type { Enquiry } from "../src/server/catering/model";
import { adminEnquiry, createEnquiry, listEnquiries, markWhatsAppOpened, publicEnquiry, saveCateringContent, saveGallery, staffAction, type CatDeps } from "../src/server/catering/service";
import { lagosToday, parseBudget, validDate, validateEnquiry } from "../src/server/catering/validation";
import { WA_MAX_ENCODED, buildMessage, buildWhatsApp, normaliseWhatsAppNumber } from "../src/server/catering/whatsapp";
import { MemoryRepo } from "../src/server/repo";

const NOW = new Date("2026-10-10T10:00:00Z"); const TEST_DIGITS = "2349990000000";
const mk = (o: Partial<CatDeps> = {}): CatDeps => ({ repo: new MemoryRepo(), whatsappDigits: TEST_DIGITS, now: () => NOW, ...o });
let n = 0; const key = () => `enq-${String(++n).padStart(4, "0")}-abcdefghijkl`;
const form = (o: Record<string, unknown> = {}) => ({ idempotencyKey: key(), name: "Test Customer", phone: "0803 123 4567", eventType: "Wedding", eventDate: "2026-12-12", location: "Test Hall, Test Town", guests: "150", ...o });
const errs = (o: Record<string, unknown>, types: string[] | null = null) => (validateEnquiry(o, NOW, types) as any).fieldErrors ?? {};
const full = (o: Partial<Enquiry> = {}): Enquiry => ({ ref: "CE-261010-ABCD", token: "t", idempotencyKey: "k", name: "Test Customer", phone: "+2348031234567", email: "t@example.com", eventType: "Wedding", eventDate: "2026-12-12", location: "Test Hall", guests: 150, style: "Buffet", menu: "TEST menu", dietary: "TEST dietary", budgetKobo: 50_000_000, additional: "TEST extra", status: "new", whatsapp: { preparedAt: null, openedAt: null, openedCount: 0, staffConfirmedAt: null }, notes: [], contacts: [], quotes: [], history: [], createdAt: "", updatedAt: "", ...o });

test("required fields: each missing field is reported; optional fields may be blank", () => {
  const all = errs({}); assert.deepEqual(Object.keys(all).sort(), ["eventDate", "eventType", "guests", "location", "name", "phone"]);
  for (const f of ["name", "phone", "eventType", "eventDate", "location", "guests"]) { const e = errs({ ...form(), [f]: "" }); assert.ok(e[f], `missing ${f}`); assert.equal(Object.keys(e).length, 1, f); }
  assert.ok(validateEnquiry(form(), NOW, null).ok); const v: any = validateEnquiry(form(), NOW, null); assert.equal(v.value.email, null); assert.equal(v.value.budgetKobo, null); assert.equal(v.value.style, null);
  assert.ok(errs(form({ email: "bad" })).email); assert.ok(!errs(form({ email: "" })).email); assert.ok(errs(form({ phone: "12345" })).phone); assert.ok(errs(form({ name: "A" })).name); assert.ok(errs(form({ location: "ab" })).location);
});
test("guests and budget handling", () => {
  for (const g of ["0", "-5", "1.5", "abc", "100001", ""]) assert.ok(errs(form({ guests: g })).guests, g); for (const g of ["1", "150", "1,200", 80, "100000"]) assert.ok(!errs(form({ guests: g })).guests, String(g));
  assert.equal(parseBudget("₦500,000"), 50_000_000); assert.equal(parseBudget("500000"), 50_000_000); assert.equal(parseBudget(""), null); assert.equal(parseBudget("12.5"), "invalid"); assert.equal(parseBudget("lots"), "invalid"); assert.equal(parseBudget("-1"), "invalid");
  assert.ok(errs(form({ budget: "lots" })).budget); assert.equal((validateEnquiry(form({ budget: "N750,000" }), NOW, null) as any).value.budgetKobo, 75_000_000);
});
test("date handling: today ok, past rejected, invalid calendar dates, leap day, 3-year limit, Lagos midnight boundary", () => {
  assert.equal(lagosToday(NOW), "2026-10-10"); assert.ok(!errs(form({ eventDate: "2026-10-10" })).eventDate); assert.ok(errs(form({ eventDate: "2026-10-09" })).eventDate);
  for (const d of ["2026-02-30", "2026-13-01", "2026-00-10", "12/12/2026", "2026-1-5", "garbage", "2026-12-12T10:00", "0000-00-00"]) assert.ok(errs(form({ eventDate: d })).eventDate, d);
  assert.equal(validDate("2028-02-29"), true); assert.equal(validDate("2027-02-29"), false); assert.ok(!errs(form({ eventDate: "2028-02-29" })).eventDate);
  assert.ok(errs(form({ eventDate: "2030-01-01" })).eventDate); assert.ok(!errs(form({ eventDate: "2029-10-10" })).eventDate);
  const late = new Date("2026-10-10T23:30:00Z"); assert.equal(lagosToday(late), "2026-10-11"); assert.ok((validateEnquiry(form({ eventDate: "2026-10-10" }), late, null) as any).fieldErrors.eventDate); assert.ok(validateEnquiry(form({ eventDate: "2026-10-11" }), late, null).ok);
});
test("event types: only configured categories are accepted; free text allowed when none configured", () => {
  assert.ok(validateEnquiry(form({ eventType: "Anything" }), NOW, null).ok); assert.ok(validateEnquiry(form({ eventType: "Anything" }), NOW, []).ok);
  assert.ok(errs(form({ eventType: "Funeral" }), ["Wedding", "Birthday"]).eventType); assert.ok(!errs(form({ eventType: "Wedding" }), ["Wedding", "Birthday"]).eventType);
});

test("message: exact structure and only supplied fields", () => {
  const m = buildMessage(full()); assert.equal(m, ["NEW CATERING QUOTATION REQUEST", "", "Enquiry Reference: CE-261010-ABCD", "Customer Name: Test Customer", "Phone Number: +2348031234567", "Email: t@example.com", "Event Type: Wedding", "Event Date: 12 December 2026", "Event Location: Test Hall", "Number of Guests: 150", "Catering Style: Buffet", "Preferred Menu: TEST menu", "Dietary Requirements: TEST dietary", "Estimated Budget: ₦500,000", "Additional Information: TEST extra"].join("\n"));
  const min = buildMessage(full({ email: null, style: null, menu: null, dietary: null, budgetKobo: null, additional: null })); assert.equal(min, ["NEW CATERING QUOTATION REQUEST", "", "Enquiry Reference: CE-261010-ABCD", "Customer Name: Test Customer", "Phone Number: +2348031234567", "Event Type: Wedding", "Event Date: 12 December 2026", "Event Location: Test Hall", "Number of Guests: 150"].join("\n"));
  for (const l of ["Email:", "Catering Style:", "Preferred Menu:", "Dietary Requirements:", "Estimated Budget:", "Additional Information:"]) assert.ok(!min.includes(l), l);
});
test("WhatsApp link: destination number, encoding round-trip with special characters", () => {
  const nasty = "Ọgbọnna & Sons \"Ịfeanyị\" 100% #1 + more ₦50,000 <b>x</b> 😀 café\nline two\n\nline—four ?x=1&y=2 \\ / ' `";
  const e = full({ name: "Ịfeanyị Ọkafọ", additional: nasty, location: "Plot #5, Lekki/Ajah (Phase 1) & Co." });
  const w = buildWhatsApp(e, TEST_DIGITS); assert.ok(w.url!.startsWith(`https://wa.me/${TEST_DIGITS}?text=`)); const u = new URL(w.url!);
  assert.equal(u.host, "wa.me"); assert.equal(u.pathname, `/${TEST_DIGITS}`); assert.deepEqual([...u.searchParams.keys()], ["text"]); assert.equal(u.searchParams.get("text"), w.message); assert.equal(decodeURIComponent(w.url!.split("?text=")[1]), w.message);
  assert.ok(w.message.includes(nasty)); assert.ok(!/[ \n"<>#]/.test(w.url!.split("?text=")[1])); assert.ok(w.url!.includes("%0A") && w.url!.includes("%26") && w.url!.includes("%23") && w.url!.includes("%25") && w.url!.includes("%2B"));
  assert.equal(w.truncated, false);
});
test("WhatsApp number: normalisation and not-configured behaviour (no invented number)", () => {
  assert.equal(normaliseWhatsAppNumber("+234 803 123 4567"), "2348031234567"); assert.equal(normaliseWhatsAppNumber("0803 123 4567"), "2348031234567"); assert.equal(normaliseWhatsAppNumber("2348031234567"), "2348031234567"); assert.equal(normaliseWhatsAppNumber("+44 7700 900123"), "447700900123");
  for (const bad of [null, undefined, "", "abc", "0123", "12", "+0123456789", "1".repeat(16), "080-ABC"]) assert.equal(normaliseWhatsAppNumber(bad as any), null, String(bad));
  const w = buildWhatsApp(full(), null); assert.equal(w.url, null); assert.ok(w.message.startsWith("NEW CATERING QUOTATION REQUEST"));
});
test("long input: link stays within the cap and the saved enquiry is never shortened", async () => {
  const d = mk(); const long = "Long text with ₦ and Ọ and & symbols. ".repeat(60); const r: any = await createEnquiry(d, form({ additional: long, menu: long, dietary: long })); assert.ok(r.ok);
  const v: any = await publicEnquiry(d, r.ref, r.token); assert.ok(v.whatsapp.url.length < 2200 && v.whatsapp.truncated); assert.ok(encodeURIComponent(v.whatsapp.message).length <= WA_MAX_ENCODED); assert.ok(v.whatsapp.message.includes(r.ref));
  const saved = (await adminEnquiry(d.repo, r.ref))!; assert.ok(saved.additional!.length >= 1000 && saved.menu!.length === 500);
});

test("persistence, reference and idempotency", async () => {
  const d = mk(); const k = key(); const [a, b, c] = await Promise.all([1, 2, 3].map(() => createEnquiry(d, form({ idempotencyKey: k })))); assert.ok(a.ok && b.ok && c.ok && a.ref === b.ref && b.ref === c.ref);
  assert.match((a as any).ref, /^CE-261010-[A-Z2-9]{4}$/); assert.equal((await d.repo.docList("enquiry")).length, 1);
  const again: any = await createEnquiry(d, form({ idempotencyKey: k, name: "Different Name" })); assert.ok(again.ok && again.replay && again.ref === (a as any).ref); assert.equal((await adminEnquiry(d.repo, again.ref))!.name, "Test Customer");
  const e = (await adminEnquiry(d.repo, (a as any).ref))!; assert.equal(e.status, "new"); assert.equal(e.guests, 150); assert.equal(e.phone, "+2348031234567"); assert.equal(e.whatsapp.openedAt, null); assert.ok(e.whatsapp.preparedAt); assert.ok(!("token" in e) && !("idempotencyKey" in e)); assert.equal(e.history[0].status, "new");
  const refs = new Set(); for (let i = 0; i < 30; i++) refs.add(((await createEnquiry(d, form())) as any).ref); assert.equal(refs.size, 30);
  const bad: any = await createEnquiry(d, form({ phone: "1" })); assert.ok(!bad.ok && bad.fieldErrors.phone); const nk: any = await createEnquiry(d, { ...form(), idempotencyKey: "short" }); assert.ok(!nk.ok);
  assert.equal((await d.repo.docList("enquiry")).length, 31);
});
test("confirmation view: token required, no delivery claim, 'opened' is not 'sent'", async () => {
  const d = mk(); const r: any = await createEnquiry(d, form()); assert.equal(await publicEnquiry(d, r.ref, "wrong"), null); assert.equal(await publicEnquiry(d, "CE-NOPE", r.token), null);
  const v: any = await publicEnquiry(d, r.ref, r.token); assert.equal(v.whatsapp.configured, true); assert.ok(v.whatsapp.url.startsWith(`https://wa.me/${TEST_DIGITS}?text=`)); assert.equal(v.whatsapp.openedAt, null); assert.ok(!("token" in v) && !("status" in v));
  assert.equal(await markWhatsAppOpened(d, r.ref, "wrong"), false); assert.equal(await markWhatsAppOpened(d, r.ref, r.token), true); const e = (await adminEnquiry(d.repo, r.ref))!; assert.ok(e.whatsapp.openedAt && e.whatsapp.openedCount === 1); assert.equal(e.whatsapp.staffConfirmedAt, null); assert.equal(e.status, "new");
  const nd = mk({ whatsappDigits: null, repo: d.repo }); const nv: any = await publicEnquiry(nd, r.ref, r.token); assert.equal(nv.whatsapp.configured, false); assert.equal(nv.whatsapp.url, null);
});
test("event type is checked against published categories at save time", async () => {
  const d = mk(); await saveCateringContent(d.repo, { categories: [{ name: "Wedding", published: true }, { name: "Hidden Type", published: false }] });
  assert.ok(!((await createEnquiry(d, form({ eventType: "Funeral" }))) as any).ok); assert.ok(!((await createEnquiry(d, form({ eventType: "Hidden Type" }))) as any).ok); assert.ok(((await createEnquiry(d, form({ eventType: "Wedding" }))) as any).ok);
});
test("staff: search, status, notes, contacts, quotation progress", async () => {
  const d = mk(); const a: any = await createEnquiry(d, form({ name: "Ada Test", location: "Hall One", eventType: "Birthday" })); const b: any = await createEnquiry(d, form({ name: "Bola Test", location: "Hall Two", dietary: "No pork" }));
  assert.equal((await listEnquiries(d.repo)).length, 2); assert.equal((await listEnquiries(d.repo, { q: "ada" })).length, 1); assert.equal((await listEnquiries(d.repo, { q: "hall two" })).length, 1); assert.equal((await listEnquiries(d.repo, { q: "pork" }))[0].ref, b.ref); assert.equal((await listEnquiries(d.repo, { q: b.ref.toLowerCase() })).length, 1); assert.equal((await listEnquiries(d.repo, { q: "0803 123 4567" })).length, 2); assert.equal((await listEnquiries(d.repo, { q: "zzz" })).length, 0);
  const S = (ref: string, action: string, body: object) => staffAction(d.repo, ref, action, body, NOW);
  assert.equal((await S(a.ref, "status", { status: "bogus" })).status, 422); assert.equal((await S("CE-NONE", "status", { status: "contacted" })).status, 404); assert.equal((await S(a.ref, "note", { text: "  " })).status, 422);
  assert.equal((await S(a.ref, "note", { text: "Customer prefers evening calls" })).status, 200); assert.equal((await listEnquiries(d.repo, { q: "evening calls" }))[0].ref, a.ref);
  assert.equal((await S(a.ref, "contact", { method: "call", direction: "outbound", summary: "Left a voicemail" })).status, 200); assert.equal((await adminEnquiry(d.repo, a.ref))!.status, "contacted");
  assert.equal((await S(a.ref, "contact", { method: "pigeon", direction: "outbound", summary: "x" })).status, 422);
  assert.equal((await S(a.ref, "quote", { status: "draft", amountKobo: 90_000_000, note: "first draft" })).status, 200); assert.equal((await adminEnquiry(d.repo, a.ref))!.status, "quote_in_progress");
  assert.equal((await S(a.ref, "quote", { status: "sent", amountKobo: 85_000_000 })).status, 200); assert.equal((await adminEnquiry(d.repo, a.ref))!.status, "quote_sent"); assert.equal((await S(a.ref, "quote", { status: "sent", amountKobo: -1 })).status, 422);
  assert.equal((await S(a.ref, "quote", { status: "accepted", amountKobo: 85_000_000 })).status, 200); const e = (await adminEnquiry(d.repo, a.ref))!; assert.equal(e.status, "confirmed"); assert.equal(e.quotes.length, 3); assert.equal(e.contacts.length, 1); assert.equal(e.notes.length, 1); assert.deepEqual(e.history.map((h) => h.status), ["new", "contacted", "quote_in_progress", "quote_sent", "confirmed"]);
  assert.equal((await S(a.ref, "status", { status: "completed", note: "Event held" })).status, 200); await S(a.ref, "quote", { status: "declined" }); assert.equal((await adminEnquiry(d.repo, a.ref))!.status, "completed");
  assert.equal((await S(b.ref, "whatsapp-received", {})).status, 200); assert.ok((await adminEnquiry(d.repo, b.ref))!.whatsapp.staffConfirmedAt); assert.equal((await listEnquiries(d.repo, { status: "completed" })).length, 1);
});
test("content and gallery: validation; API dispatch", async () => {
  const d = mk(); assert.equal((await saveCateringContent(d.repo, { categories: [{ name: "" }] })).status, 422); assert.equal((await saveCateringContent(d.repo, { categories: [{ name: "A" }, { name: "a" }] })).status, 422); assert.equal((await saveCateringContent(d.repo, { services: [{ name: "S" }] })).status, 422);
  assert.equal((await saveCateringContent(d.repo, { categories: [{ name: "Wedding", published: true }], services: [{ name: "Buffet", description: "TEST", published: true }], styles: ["Buffet", "Plated"] })).status, 200);
  assert.equal((await saveGallery(d.repo, { kind: "food", title: "T", imageUrl: "javascript:x", imageAlt: "a" })).status, 422); assert.equal((await saveGallery(d.repo, { kind: "food", title: "T", imageUrl: "/media/catering/a.jpg" })).status, 422);
  assert.equal((await saveGallery(d.repo, { kind: "event", title: "T", imageUrl: "/media/catering/a.jpg", imageAlt: "Alt", published: true })).status, 201); await saveGallery(d.repo, { kind: "food", title: "Draft", imageUrl: "/media/catering/b.jpg", imageAlt: "Alt" });
  const pub: any = await cateringApi(d, "GET", ["content"], null, new URLSearchParams()); assert.equal(pub.body.gallery.length, 1); assert.equal(pub.body.categories.length, 1); assert.equal(pub.body.whatsappConfigured, true);
  const c: any = await cateringApi(d, "POST", ["enquiries"], form(), new URLSearchParams()); assert.equal(c.status, 201); const g: any = await cateringApi(d, "GET", ["enquiries", c.body.ref], null, new URLSearchParams({ t: c.body.token })); assert.equal(g.status, 200); assert.equal((await cateringApi(d, "GET", ["enquiries", c.body.ref], null, new URLSearchParams({ t: "x" }))).status, 404);
  assert.equal((await cateringApi(d, "POST", ["enquiries", c.body.ref, "whatsapp-opened"], { token: c.body.token }, new URLSearchParams())).status, 200); assert.equal((await cateringApi(d, "POST", ["enquiries"], form({ name: "" }), new URLSearchParams())).status, 422);
  assert.equal((await adminCateringApi(d, "GET", ["enquiries"], null, new URLSearchParams({ q: "test" }))).status, 200);
});
