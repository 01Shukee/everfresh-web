import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { newRef } from "../../lib/ids";
import { UniqueViolation, type Repo } from "../repo";
import { emptyCateringContent, ENQ_STATUSES, type CateringContent, type Enquiry, type EnqStatus, type GalleryItem } from "./model";
import { normalisePhone } from "../validation";
import { mailEnquiry } from "../notify";
import { validateEnquiry } from "./validation";
import { buildWhatsApp } from "./whatsapp";

export interface CatDeps { repo: Repo; whatsappDigits: string | null; now?: () => Date }
const nowOf = (d: CatDeps) => d.now?.() ?? new Date();
const sameToken = (a: string, b: string) => typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (status: number, code: string, message: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, status, code, message, fieldErrors });
export const getEnquiry = (repo: Repo, ref: string) => repo.docGet<Enquiry>("enquiry", ref);
export async function getCateringContent(repo: Repo): Promise<CateringContent> { return (await repo.docGet<CateringContent>("cat-content", "main")) ?? emptyCateringContent(); }
export async function publicCatering(repo: Repo, whatsappDigits: string | null) {
  const c = await getCateringContent(repo); const g = (await repo.docList<GalleryItem>("cgallery")).filter((x) => x.published).sort((a, b) => a.sort - b.sort);
  return { categories: c.categories.filter((x) => x.published), services: c.services.filter((x) => x.published), styles: c.styles, gallery: g, whatsappConfigured: !!whatsappDigits };
}

const inflight = new Map<string, Promise<unknown>>();
export type CreateOut = { ok: true; ref: string; token: string; replay: boolean } | ReturnType<typeof fail>;
export function createEnquiry(deps: CatDeps, raw: unknown): Promise<CreateOut> {
  const key = typeof (raw as any)?.idempotencyKey === "string" ? (raw as any).idempotencyKey : "";
  const hit = inflight.get(key); if (key && hit) return hit as Promise<CreateOut>;
  const p = doCreate(deps, raw, key).finally(() => inflight.delete(key)); if (key) inflight.set(key, p); return p;
}
async function doCreate(deps: CatDeps, raw: unknown, key: string): Promise<CreateOut> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return fail(422, "VALIDATION_FAILED", "Missing or invalid request key.");
  const repo = deps.repo, now = nowOf(deps);
  const prior = await repo.docGet<{ ref: string }>("idx", `enqkey:${key}`); if (prior) { const e = await getEnquiry(repo, prior.ref); if (e) return { ok: true, ref: e.ref, token: e.token, replay: true }; }
  const c = await getCateringContent(repo); const types = c.categories.filter((x) => x.published).map((x) => x.name);
  const v = validateEnquiry(raw, now, types); if (!v.ok) return fail(422, "VALIDATION_FAILED", "Please check the highlighted fields.", v.fieldErrors);
  const ts = now.toISOString(); let ref = newRef("CE", now);
  try { await repo.docCreate("idx", `enqkey:${key}`, { ref }); } catch (e) { if (!(e instanceof UniqueViolation)) throw e; const p = await repo.docGet<{ ref: string }>("idx", `enqkey:${key}`); const x = p ? await getEnquiry(repo, p.ref) : null; if (x) return { ok: true, ref: x.ref, token: x.token, replay: true }; throw e; }
  const enq: Enquiry = { ref, token: randomBytes(18).toString("base64url"), idempotencyKey: key, ...v.value, status: "new", whatsapp: { preparedAt: ts, openedAt: null, openedCount: 0, staffConfirmedAt: null }, notes: [], contacts: [], quotes: [], history: [{ at: ts, status: "new", note: "Enquiry saved from the website" }], createdAt: ts, updatedAt: ts };
  for (let i = 0; ; i++) { try { await repo.docCreate("enquiry", enq.ref, enq); break; } catch (e) { if (!(e instanceof UniqueViolation) || i >= 5) throw e; enq.ref = newRef("CE", now); await repo.docPut("idx", `enqkey:${key}`, { ref: enq.ref }); } }
  await mailEnquiry(repo, enq); return { ok: true, ref: enq.ref, token: enq.token, replay: false };
}

/** Customer-facing view for the confirmation page. The WhatsApp link is rebuilt from the saved enquiry and the configured number. */
export async function publicEnquiry(deps: CatDeps, ref: string, token: string) {
  const e = await getEnquiry(deps.repo, ref); if (!e || !sameToken(e.token, token)) return null;
  const wa = buildWhatsApp(e, deps.whatsappDigits);
  return { ref: e.ref, name: e.name, phone: e.phone, email: e.email, eventType: e.eventType, eventDate: e.eventDate, location: e.location, guests: e.guests, style: e.style, menu: e.menu, dietary: e.dietary, budgetKobo: e.budgetKobo, additional: e.additional,
    createdAt: e.createdAt, whatsapp: { configured: !!deps.whatsappDigits, url: wa.url, message: wa.message, truncated: wa.truncated, openedAt: e.whatsapp.openedAt } };
}
export function markWhatsAppOpened(deps: CatDeps, ref: string, token: string) { return deps.repo.withLock(`enq:${ref}`, () => markWhatsAppOpenedImpl(deps, ref, token)); }
async function markWhatsAppOpenedImpl(deps: CatDeps, ref: string, token: string) {
  const e = await getEnquiry(deps.repo, ref); if (!e || !sameToken(e.token, token)) return false;
  const ts = nowOf(deps).toISOString(); e.whatsapp.openedAt = ts; e.whatsapp.openedCount += 1; e.updatedAt = ts; await deps.repo.docPut("enquiry", e.ref, e); return true;
}

// ---------------- staff ----------------
export async function listEnquiries(repo: Repo, opts: { q?: string; status?: string } = {}) {
  const q = (opts.q ?? "").trim().toLowerCase(); const qPhone = normalisePhone(q); const all = await repo.docList<Enquiry>("enquiry");
  const hay = (e: Enquiry) => [e.ref, e.name, e.phone, e.email, e.eventType, e.location, e.eventDate, e.style, e.menu, e.dietary, e.additional, ...e.notes.map((n) => n.text), ...e.contacts.map((c) => c.summary)].filter(Boolean).join(" ").toLowerCase();
  return all.filter((e) => (!opts.status || e.status === opts.status) && (!q || hay(e).includes(q) || (qPhone !== null && e.phone === qPhone))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((e) => ({ ref: e.ref, name: e.name, phone: e.phone, eventType: e.eventType, eventDate: e.eventDate, location: e.location, guests: e.guests, status: e.status, createdAt: e.createdAt, whatsapp: e.whatsapp, lastQuote: e.quotes[e.quotes.length - 1]?.status ?? null }));
}
export async function adminEnquiry(repo: Repo, ref: string) { const e = await getEnquiry(repo, ref); if (!e) return null; const { token, idempotencyKey, ...rest } = e; return rest; }

type R = { status: number; body: unknown };
const save = async (repo: Repo, e: Enquiry, now: Date) => { e.updatedAt = now.toISOString(); await repo.docPut("enquiry", e.ref, e); };
const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export function staffAction(repo: Repo, ref: string, action: string, b: any, now: Date): Promise<R> { return repo.withLock(`enq:${ref}`, () => staffActionImpl(repo, ref, action, b, now)); }
async function staffActionImpl(repo: Repo, ref: string, action: string, b: any, now: Date): Promise<R> {
  const e = await getEnquiry(repo, ref); if (!e) return { status: 404, body: { error: "Enquiry not found." } }; const ts = now.toISOString(); const bad = (m: string): R => ({ status: 422, body: { error: m } });
  switch (action) {
    case "status": { if (!ENQ_STATUSES.includes(b?.status)) return bad("Unknown status."); if (b.status !== e.status) { e.status = b.status as EnqStatus; e.history.push({ at: ts, status: e.status, note: text(b.note, 300) || null }); } break; }
    case "note": { const t = text(b?.text, 2000); if (!t) return bad("Write a note first."); e.notes.push({ id: randomUUID(), at: ts, text: t }); break; }
    case "contact": { const m = ["call", "whatsapp", "email", "visit", "other"]; const s = text(b?.summary, 1000); if (!m.includes(b?.method) || !["outbound", "inbound"].includes(b?.direction) || !s) return bad("Choose the method and direction and summarise the contact."); e.contacts.push({ id: randomUUID(), at: ts, method: b.method, direction: b.direction, summary: s }); if (e.status === "new") { e.status = "contacted"; e.history.push({ at: ts, status: "contacted", note: "Contact recorded" }); } break; }
    case "quote": { const st = ["draft", "sent", "accepted", "declined"]; const amt = b?.amountKobo === null || b?.amountKobo === undefined || b?.amountKobo === "" ? null : b.amountKobo; if (!st.includes(b?.status) || (amt !== null && !(Number.isSafeInteger(amt) && amt >= 0))) return bad("Choose the quotation status and a valid amount (or leave it blank).");
      e.quotes.push({ id: randomUUID(), at: ts, status: b.status, amountKobo: amt, note: text(b.note, 500) });
      const map: Record<string, EnqStatus> = { draft: "quote_in_progress", sent: "quote_sent", accepted: "confirmed" }; const to = map[b.status]; if (to && e.status !== to && !["completed", "lost"].includes(e.status)) { e.status = to; e.history.push({ at: ts, status: to, note: "Quotation " + b.status }); } break; }
    case "whatsapp-received": e.whatsapp.staffConfirmedAt = e.whatsapp.staffConfirmedAt ?? ts; break;
    default: return { status: 404, body: { error: "Unknown action." } };
  }
  await save(repo, e, now); const { token, idempotencyKey, ...rest } = e; return { status: 200, body: rest };
}

const slugOk = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export async function saveCateringContent(repo: Repo, raw: any): Promise<R> {
  const bad = (m: string): R => ({ status: 422, body: { error: m } }); if (!raw || typeof raw !== "object") return bad("Invalid content.");
  const cats = (Array.isArray(raw.categories) ? raw.categories : []).slice(0, 20).map((c: any) => ({ id: slugOk(c?.id, 40) || randomUUID(), name: slugOk(c?.name, 80), description: slugOk(c?.description, 600) || null, published: c?.published === true }));
  const services = (Array.isArray(raw.services) ? raw.services : []).slice(0, 20).map((c: any) => ({ id: slugOk(c?.id, 40) || randomUUID(), name: slugOk(c?.name, 80), description: slugOk(c?.description, 800), published: c?.published === true }));
  if (cats.some((c: any) => !c.name) || services.some((s: any) => !s.name || !s.description)) return bad("Every category needs a name, and every service needs a name and a description.");
  if (new Set(cats.map((c: any) => c.name.toLowerCase())).size !== cats.length) return bad("Category names must be different.");
  const styles = (Array.isArray(raw.styles) ? raw.styles : []).map((s: unknown) => slugOk(s, 80)).filter(Boolean).slice(0, 20);
  const c: CateringContent = { categories: cats, services, styles }; await repo.docPut("cat-content", "main", c); return { status: 200, body: c };
}
export async function saveGallery(repo: Repo, raw: any, id?: string): Promise<R> {
  const bad = (m: string): R => ({ status: 422, body: { error: m } }); const url = (v: unknown) => { const x = slugOk(v, 400); return /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s]+)$/.test(x) ? x : null; };
  const img = url(raw?.imageUrl); if (!img || !["food", "event"].includes(raw?.kind) || !slugOk(raw?.title, 100) || !slugOk(raw?.imageAlt, 140)) return bad("A photo needs a type, title, image path or https URL, and alt text.");
  if (id && !(await repo.docGet("cgallery", id))) return { status: 404, body: { error: "Not found." } };
  const item: GalleryItem = { id: id ?? randomUUID(), kind: raw.kind, title: slugOk(raw.title, 100), caption: slugOk(raw.caption, 300), imageUrl: img, imageAlt: slugOk(raw.imageAlt, 140), published: raw.published === true, sort: Number.isInteger(raw.sort) ? raw.sort : 0 };
  await repo.docPut("cgallery", item.id, item); return { status: id ? 200 : 201, body: item };
}
