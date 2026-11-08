import { formatNaira } from "../../lib/money";
import { newRef } from "../../lib/ids";
import { normaliseWhatsAppNumber, WA_MAX_ENCODED } from "../catering/whatsapp";
import { UniqueViolation, type Repo } from "../repo";
import { randomUUID } from "node:crypto";

/** The VIP menu is kept apart from the regular menu on purpose: its own categories, items, settings and orders, so nothing here can reach regular ordering or checkout. */
export interface VipSettings { enabled: boolean; mode: "static" | "whatsapp"; whatsapp: string | null; title: string; intro: string | null; tableLabel: string }
export interface VipCategory { id: string; name: string; sort: number; active: boolean }
export interface VipItem { id: string; categoryId: string; name: string; description: string; priceKobo: number; imageUrl: string | null; imageAlt: string; available: boolean; active: boolean; sort: number }
export interface VipOrderLine { itemId: string; name: string; unitKobo: number; qty: number; note: string | null }
export interface VipOrder { ref: string; table: string | null; lines: VipOrderLine[]; totalKobo: number; note: string | null; createdAt: string }
type Out = { status: number; body: unknown };
const bad = (error: string, extra: object = {}): Out => ({ status: 422, body: { error, ...extra } });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").trim().slice(0, max) : "");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sortOf = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 100000 ? (v as number) : 0);
const imgOk = (u: string) => u.length <= 500 && /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s<>"']+)$/.test(u);
export const DEFAULT_VIP: VipSettings = { enabled: true, mode: "static", whatsapp: null, title: "VIP Menu", intro: null, tableLabel: "Table" };

// ---------------------------------------------------------------- settings
export async function getVipSettings(repo: Repo): Promise<VipSettings> { return { ...DEFAULT_VIP, ...((await repo.docGet<VipSettings>("settings", "vip")) ?? {}) }; }
export async function saveVipSettings(repo: Repo, raw: unknown): Promise<Out> {
  const r = isRec(raw) ? raw : {}; const title = clean(r.title, 60) || DEFAULT_VIP.title; const waRaw = clean(r.whatsapp, 30); const digits = waRaw ? normaliseWhatsAppNumber(waRaw) : null;
  if (waRaw && !digits) return bad("Enter the WhatsApp number with its country code, for example +2348012345678.");
  const v: VipSettings = { enabled: r.enabled !== false, mode: r.mode === "whatsapp" ? "whatsapp" : "static", whatsapp: digits, title, intro: clean(r.intro, 300) || null, tableLabel: clean(r.tableLabel, 20) || DEFAULT_VIP.tableLabel };
  await repo.docPut("settings", "vip", v); return { status: 200, body: v };
}
/** The number orders go to: the VIP number if set, otherwise the business WhatsApp number (passed in by the caller). */
export const vipDigits = (s: VipSettings, fallback: string | null) => s.whatsapp ?? fallback;

// ---------------------------------------------------------------- categories and items
const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name);
export const listVipCategories = async (repo: Repo) => (await repo.docList<VipCategory>("vipcat")).sort(bySort);
export const listVipItems = async (repo: Repo) => (await repo.docList<VipItem>("vipitem")).sort(bySort);
export async function saveVipCategory(repo: Repo, raw: unknown, id?: string): Promise<Out> {
  const r = isRec(raw) ? raw : {}; const name = clean(r.name, 60); if (name.length < 2) return bad("Enter a category name (at least 2 characters).");
  const existing = id ? await repo.docGet<VipCategory>("vipcat", id) : null; if (id && !existing) return { status: 404, body: { error: "Category not found." } };
  const c: VipCategory = { id: existing?.id ?? randomUUID(), name, sort: sortOf(r.sort), active: r.active !== false }; await repo.docPut("vipcat", c.id, c); return { status: existing ? 200 : 201, body: c };
}
export async function removeVipCategory(repo: Repo, id: string): Promise<Out> {
  if ((await listVipItems(repo)).some((i) => i.categoryId === id)) return { status: 409, body: { error: "This category still has items. Move or delete them first." } };
  await repo.docDelete("vipcat", id); return { status: 200, body: { ok: true } };
}
export async function saveVipItem(repo: Repo, raw: unknown, id?: string): Promise<Out> {
  const r = isRec(raw) ? raw : {}; const e: Record<string, string> = {}; const name = clean(r.name, 80); if (name.length < 2) e.name = "Enter the item's name.";
  const categoryId = typeof r.categoryId === "string" ? r.categoryId : ""; if (!categoryId || !(await repo.docGet("vipcat", categoryId))) e.categoryId = "Choose a category.";
  const price = Number(r.priceKobo); if (!Number.isInteger(price) || price <= 0 || price > 100_000_000) e.priceKobo = "Enter a price above zero.";
  const imageUrl = clean(r.imageUrl, 500) || null; if (imageUrl && !imgOk(imageUrl)) e.imageUrl = "Use an uploaded photo or a link starting with https://.";
  if (Object.keys(e).length) return bad("Please correct the highlighted fields.", { fieldErrors: e });
  const existing = id ? await repo.docGet<VipItem>("vipitem", id) : null; if (id && !existing) return { status: 404, body: { error: "Item not found." } };
  const it: VipItem = { id: existing?.id ?? randomUUID(), categoryId, name, description: clean(r.description, 400), priceKobo: price, imageUrl, imageAlt: clean(r.imageAlt, 140) || name, available: r.available !== false, active: r.active !== false, sort: sortOf(r.sort) };
  await repo.docPut("vipitem", it.id, it); return { status: existing ? 200 : 201, body: it };
}
export async function removeVipItem(repo: Repo, id: string): Promise<Out> { await repo.docDelete("vipitem", id); return { status: 200, body: { ok: true } }; }

/** What the public VIP page needs. The WhatsApp number is never sent to the browser: orders go through the server. */
export async function publicVip(repo: Repo, fallbackDigits: string | null) {
  const s = await getVipSettings(repo); const cats = (await listVipCategories(repo)).filter((c) => c.active); const items = (await listVipItems(repo)).filter((i) => i.active);
  const orderable = s.mode === "whatsapp" && !!vipDigits(s, fallbackDigits);
  return { enabled: s.enabled, title: s.title, intro: s.intro, tableLabel: s.tableLabel, orderable, categories: cats.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.categoryId === c.id).map(({ id, name, description, priceKobo, imageUrl, imageAlt, available }) => ({ id, name, description, priceKobo, imageUrl, imageAlt, available })) })).filter((c) => c.items.length) };
}

// ---------------------------------------------------------------- orders: WhatsApp, same approach as Event Catering
export function buildVipMessage(o: VipOrder, trim = 200, label = "Table"): string {
  const cut = (t: string | null) => (t && t.length > trim ? `${t.slice(0, Math.max(trim - 1, 1))}…` : t);
  const lines = o.lines.flatMap((l, i) => [`${i + 1}. ${l.name} x${l.qty} @ ${formatNaira(l.unitKobo)} = ${formatNaira(l.unitKobo * l.qty)}`, ...(cut(l.note) ? [`   Note: ${cut(l.note)}`] : [])]);
  return ["NEW VIP ORDER", "", `VIP order reference: ${o.ref}`, ...(o.table ? [`${label}: ${o.table}`] : []), "", ...lines, "", `Total: ${formatNaira(o.totalKobo)}`, ...(cut(o.note) ? ["", `Special instructions: ${cut(o.note)}`] : [])].join("\n");
}
export function buildVipWhatsApp(o: VipOrder, digits: string | null, label = "Table") {
  let trim = 200, msg = buildVipMessage(o, trim, label), enc = encodeURIComponent(msg), truncated = false;
  while (enc.length > WA_MAX_ENCODED && trim > 20) { trim = Math.floor(trim * 0.6); msg = buildVipMessage(o, trim, label); enc = encodeURIComponent(msg); truncated = true; }
  if (enc.length > WA_MAX_ENCODED) { msg = buildVipMessage({ ...o, lines: o.lines.map((l) => ({ ...l, note: null })), note: null }, 0, label) + "\n(Notes are saved under this reference.)"; enc = encodeURIComponent(msg); truncated = true; }
  return { message: msg, url: digits ? `https://wa.me/${digits}?text=${enc}` : null, truncated };
}
export async function createVipOrder(repo: Repo, raw: unknown, ctx: { now: Date; fallbackDigits: string | null }): Promise<Out> {
  const r = isRec(raw) ? raw : {}; const s = await getVipSettings(repo);
  if (!s.enabled) return { status: 409, body: { error: "The VIP menu is not available right now." } };
  const digits = vipDigits(s, ctx.fallbackDigits); if (s.mode !== "whatsapp" || !digits) return { status: 409, body: { error: "Ordering from this menu is not switched on. Please tell your waiter what you would like." } };
  const list = Array.isArray(r.lines) ? r.lines : []; if (!list.length) return bad("Add at least one item to your order."); if (list.length > 30) return bad("An order can have up to 30 different items.");
  const items = new Map((await listVipItems(repo)).map((i) => [i.id, i])); const lines: VipOrderLine[] = []; const gone: string[] = []; const seen = new Set<string>();
  for (const l of list) {
    if (!isRec(l)) return bad("Something is wrong with your order. Please start again."); const it = typeof l.itemId === "string" ? items.get(l.itemId) : undefined; const qty = Number(l.qty);
    if (!it) return bad("An item in your order is no longer on the menu. Please review your order."); if (!Number.isInteger(qty) || qty < 1 || qty > 20) return bad("Each item can be ordered from 1 to 20.");
    if (seen.has(it.id)) return bad("An item appears twice. Please review your order."); seen.add(it.id);
    if (!it.active || !it.available) { gone.push(it.name); continue; }
    lines.push({ itemId: it.id, name: it.name, unitKobo: it.priceKobo, qty, note: clean(l.note, 200) || null });   // the price always comes from the menu, never from the browser
  }
  if (gone.length) return { status: 409, body: { error: `${gone.join(", ")} ${gone.length === 1 ? "is" : "are"} not available right now. Please remove ${gone.length === 1 ? "it" : "them"} and try again.`, unavailable: gone } };
  const table = clean(r.table, 20).replace(/[^\w \-]/g, "") || null; const total = lines.reduce((t, l) => t + l.unitKobo * l.qty, 0);
  for (let i = 0; ; i++) {
    const o: VipOrder = { ref: newRef("VIP", ctx.now), table, lines, totalKobo: total, note: clean(r.note, 300) || null, createdAt: ctx.now.toISOString() };
    try { await repo.docCreate("viporder", o.ref, o); const wa = buildVipWhatsApp(o, digits, s.tableLabel); return { status: 201, body: { ref: o.ref, totalKobo: total, whatsappUrl: wa.url, message: wa.message } }; } catch (e) { if (!(e instanceof UniqueViolation) || i > 5) throw e; }
  }
}
export const listVipOrders = async (repo: Repo, limit = 100) => (await repo.docList<VipOrder>("viporder")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);

// ---------------------------------------------------------------- staff API (the route has already verified the admin session)
export async function adminVipApi(repo: Repo, method: string, path: string[], body: unknown): Promise<Out> {
  const [r, id] = path; const ok = (b: unknown): Out => ({ status: 200, body: b }); const no = (): Out => ({ status: 405, body: { error: "Method not allowed." } });
  if (r === "menu") return method === "GET" ? ok({ settings: await getVipSettings(repo), categories: await listVipCategories(repo), items: await listVipItems(repo) }) : no();
  if (r === "settings") return method === "PUT" ? saveVipSettings(repo, body) : method === "GET" ? ok(await getVipSettings(repo)) : no();
  if (r === "categories") { if (method === "POST" && !id) return saveVipCategory(repo, body); if (method === "PUT" && id) return saveVipCategory(repo, body, id); if (method === "DELETE" && id) return removeVipCategory(repo, id); return no(); }
  if (r === "items") { if (method === "POST" && !id) return saveVipItem(repo, body); if (method === "PUT" && id) return saveVipItem(repo, body, id); if (method === "DELETE" && id) return removeVipItem(repo, id); return no(); }
  if (r === "orders") return method === "GET" ? ok({ orders: await listVipOrders(repo) }) : no();
  return { status: 404, body: { error: "Not found." } };
}
