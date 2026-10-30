import { newRef } from "../../lib/ids";
import { UniqueViolation, type Repo } from "../repo";
import { normalisePhone } from "../validation";
import { notifyContact } from "../notify";

export interface ContactMessage { id: string; name: string; phone: string | null; email: string | null; topic: string | null; message: string; status: "new" | "read" | "handled"; createdAt: string; idempotencyKey: string }
const hits = new Map<string, number[]>();
export const resetRateLimit = () => hits.clear();
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, n) : "");

export async function submitContact(repo: Repo, raw: any, ip: string, now: Date): Promise<{ status: number; body: unknown }> {
  if (typeof raw?.website === "string" && raw.website.trim()) return { status: 200, body: { ok: true } }; // honeypot: bots fill the hidden field; pretend success, save nothing
  const key = typeof raw?.idempotencyKey === "string" ? raw.idempotencyKey : ""; if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return { status: 422, body: { error: "Missing request key." } };
  const t = now.getTime(); const recent = (hits.get(ip) ?? []).filter((x) => t - x < 3600_000); if (recent.length >= 5) return { status: 429, body: { error: "Too many messages from this connection. Please try again later." } };
  const e: Record<string, string> = {}; const name = clean(raw?.name, 80); if (name.length < 2) e.name = "Enter your name.";
  const pRaw = clean(raw?.phone, 30), eRaw = clean(raw?.email, 120).toLowerCase(); const phone = pRaw ? normalisePhone(pRaw) : null; if (pRaw && !phone) e.phone = "Enter a valid Nigerian mobile number, or leave it blank.";
  if (eRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eRaw)) e.email = "Enter a valid email address, or leave it blank."; if (!pRaw && !eRaw) e.contact = "Give a phone number or an email address so we can reply.";
  const message = clean(raw?.message, 2000); if (message.length < 10) e.message = "Write your message (at least 10 characters).";
  if (Object.keys(e).length) return { status: 422, body: { error: "Please check the highlighted fields.", fieldErrors: e } };
  const prior = await repo.docGet<{ id: string }>("idx", `cmkey:${key}`); if (prior) return { status: 200, body: { ok: true, ref: prior.id } };
  hits.set(ip, [...recent, t]); const id = newRef("CM", now);
  try { await repo.docCreate("idx", `cmkey:${key}`, { id }); } catch (x) { if (!(x instanceof UniqueViolation)) throw x; return { status: 200, body: { ok: true } }; }
  const m: ContactMessage = { id, name, phone, email: eRaw || null, topic: clean(raw?.topic, 80) || null, message, status: "new", createdAt: now.toISOString(), idempotencyKey: key };
  await repo.docCreate("contact", id, m); await notifyContact(repo, id); return { status: 201, body: { ok: true, ref: id } };
}
export async function listMessages(repo: Repo, o: { q?: string; status?: string }) {
  const q = (o.q ?? "").toLowerCase().trim(); return (await repo.docList<ContactMessage>("contact")).filter((m) => (!o.status || m.status === o.status) && (!q || `${m.id} ${m.name} ${m.phone} ${m.email} ${m.topic} ${m.message}`.toLowerCase().includes(q))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ idempotencyKey, ...m }) => m);
}
