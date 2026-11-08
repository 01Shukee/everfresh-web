import type { Repo } from "../repo";

/** Institute details shown in emails and PDFs. Editable in Admin > Vocational studies > Institute details. */
export interface Institute { name: string; address: string | null; phones: string[]; note: string | null }
export const DEFAULT_INSTITUTE: Institute = { name: "Vocational Institute", address: null, phones: [], note: null };
export async function getInstitute(repo: Repo): Promise<Institute> { return { ...DEFAULT_INSTITUTE, ...((await repo.docGet<Institute>("settings", "institute")) ?? {}) }; }
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "");
export async function saveInstitute(repo: Repo, raw: unknown): Promise<{ status: number; body: unknown }> {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}; const name = s(r.name, 80); if (!name) return { status: 422, body: { error: "Enter the institute's name." } };
  const phones = (Array.isArray(r.phones) ? r.phones : []).map((x) => s(x, 30)).filter(Boolean).slice(0, 8);
  if (phones.some((p) => !/^[+\d][\d\s()+\-]{6,}$/.test(p))) return { status: 422, body: { error: "A phone number looks wrong. Use digits, spaces, + and - only." } };
  const v: Institute = { name, address: s(r.address, 200) || null, phones, note: s(r.note, 200) || null }; await repo.docPut("settings", "institute", v); return { status: 200, body: v };
}
