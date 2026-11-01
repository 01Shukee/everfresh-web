import { cleanImageUrl, IMAGE_URL_HELP } from "./image-url";
import { randomUUID } from "node:crypto";
import type { Repo } from "./repo";
import { canTransition } from "./status";
import type { Category, MenuItem, OrderStatus } from "./types";

export interface ApiResult { status: number; body: unknown }
const bad = (message: string, extra: object = {}): ApiResult => ({ status: 422, body: { error: message, ...extra } });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
const kobo = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

export async function saveCategory(repo: Repo, raw: unknown, id?: string): Promise<ApiResult> {
  if (!isRec(raw) || typeof raw.name !== "string" || raw.name.trim().length < 2 || raw.name.trim().length > 60) return bad("Category name must be 2 to 60 characters.");
  const existing = id ? await repo.getCategory(id) : null;
  if (id && !existing) return { status: 404, body: { error: "Category not found." } };
  const c: Category = { id: existing?.id ?? randomUUID(), name: raw.name.trim(), slug: slug(raw.name), sort: Number.isInteger(raw.sort) ? (raw.sort as number) : existing?.sort ?? 0, active: raw.active === undefined ? existing?.active ?? true : raw.active === true };
  await repo.saveCategory(c); return { status: existing ? 200 : 201, body: c };
}
export async function removeCategory(repo: Repo, id: string): Promise<ApiResult> {
  if ((await repo.listItems()).some((i) => i.categoryId === id)) return { status: 409, body: { error: "Move or delete this category's items first, or disable the category." } };
  await repo.deleteCategory(id); return { status: 200, body: { ok: true } };
}

export async function saveItem(repo: Repo, raw: unknown, id?: string): Promise<ApiResult> {
  if (!isRec(raw)) return bad("Invalid item.");
  const existing = id ? await repo.getItem(id) : null;
  if (id && !existing) return { status: 404, body: { error: "Item not found." } };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2 || name.length > 80) return bad("Name must be 2 to 80 characters.");
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > 500) return bad("Description is limited to 500 characters.");
  if (typeof raw.categoryId !== "string" || !(await repo.getCategory(raw.categoryId))) return bad("Choose a valid category.");
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const groups = Array.isArray(raw.addOnGroups) ? raw.addOnGroups : [];
  if (variants.length > 8 || groups.length > 6) return bad("Too many sizes or add-on groups.");
  const vs = variants.map((v: any) => ({ id: typeof v?.id === "string" ? v.id : randomUUID(), name: String(v?.name ?? "").trim(), priceKobo: kobo(v?.priceKobo) ?? -1 }));
  if (vs.some((v) => !v.name || v.priceKobo <= 0)) return bad("Each size needs a name and a price above zero.");
  const gs = groups.map((g: any) => ({
    id: typeof g?.id === "string" ? g.id : randomUUID(), name: String(g?.name ?? "").trim(), min: Number(g?.min), max: Number(g?.max),
    options: (Array.isArray(g?.options) ? g.options : []).map((o: any) => ({ id: typeof o?.id === "string" ? o.id : randomUUID(), name: String(o?.name ?? "").trim(), priceKobo: kobo(o?.priceKobo) ?? -1, available: o?.available !== false })),
  }));
  if (gs.some((g) => !g.name || !Number.isInteger(g.min) || !Number.isInteger(g.max) || g.min < 0 || g.max < 1 || g.min > g.max || g.options.length === 0 || g.options.length > 20 || g.options.some((o: any) => !o.name || o.priceKobo < 0) || g.min > g.options.length)) return bad("Check the add-on groups: names, min/max and option prices.");
  let base = kobo(raw.basePriceKobo);
  if (!vs.length && (base === null || base <= 0)) return bad("Enter a price above zero.");
  if (vs.length) base = base ?? 0;
  const imageUrl = typeof raw.imageUrl === "string" && raw.imageUrl.trim() ? raw.imageUrl.trim() : null;
  const cleanImage = imageUrl ? cleanImageUrl(imageUrl) : null; if (imageUrl && !cleanImage) return bad(`That image address cannot be used. ${IMAGE_URL_HELP}`);
  const now = new Date().toISOString();
  const item: MenuItem = {
    id: existing?.id ?? randomUUID(), categoryId: raw.categoryId, name, description, basePriceKobo: base ?? 0, variants: vs, addOnGroups: gs,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
    imageUrl: cleanImage, imageAlt: typeof raw.imageAlt === "string" ? raw.imageAlt.trim().slice(0, 140) : "",
    active: raw.active === undefined ? existing?.active ?? true : raw.active === true, available: raw.available === undefined ? existing?.available ?? true : raw.available === true,
    sort: Number.isInteger(raw.sort) ? (raw.sort as number) : existing?.sort ?? 0, createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  if (imageUrl && !item.imageAlt) return bad("Add alt text describing the photo.");
  await repo.saveItem(item); return { status: existing ? 200 : 201, body: item };
}
export async function removeItem(repo: Repo, id: string): Promise<ApiResult> { await repo.deleteItem(id); return { status: 200, body: { ok: true } }; }

export function setOrderStatus(repo: Repo, number: string, to: OrderStatus): Promise<ApiResult> { return repo.withLock(`order:${number}`, () => setOrderStatusImpl(repo, number, to)); }
async function setOrderStatusImpl(repo: Repo, number: string, to: OrderStatus): Promise<ApiResult> {
  const o = await repo.findOrderByNumber(number);
  if (!o) return { status: 404, body: { error: "Order not found." } };
  const t = canTransition(o, to);
  if (!t.ok) return { status: 409, body: { error: t.reason } };
  const warn = to === "cancelled" && o.paymentStatus === "paid" ? "Order cancelled. It was paid: refund it in the Bachs dashboard." : null;
  o.status = to; o.updatedAt = new Date().toISOString(); o.notes.push(`${o.updatedAt} Status set to ${to}.`);
  await repo.saveOrder(o); return { status: 200, body: { orderNumber: o.orderNumber, status: o.status, warning: warn } };
}
