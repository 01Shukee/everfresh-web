import type { ApiResult } from "../admin-api";
import { adminEnquiry, createEnquiry, getCateringContent, listEnquiries, markWhatsAppOpened, publicCatering, publicEnquiry, saveCateringContent, saveGallery, staffAction, type CatDeps } from "./service";

const j = (status: number, body: unknown): ApiResult => ({ status, body });
export async function cateringApi(d: CatDeps, method: string, path: string[], body: any, q: URLSearchParams): Promise<ApiResult> {
  const [r, ref, sub] = path; const token = (typeof body?.token === "string" ? body.token : q.get("t")) ?? "";
  if (r === "content" && method === "GET") return j(200, await publicCatering(d.repo, d.whatsappDigits));
  if (r !== "enquiries") return j(404, { error: "Not found." });
  if (!ref) { if (method !== "POST") return j(405, { error: "Method not allowed." }); const x = await createEnquiry(d, body); return x.ok ? j(x.replay ? 200 : 201, { ref: x.ref, token: x.token }) : j(x.status, { code: x.code, error: x.message, fieldErrors: x.fieldErrors }); }
  if (!sub && method === "GET") { const v = await publicEnquiry(d, ref, token); return v ? j(200, v) : j(404, { error: "Enquiry not found." }); }
  if (sub === "whatsapp-opened" && method === "POST") return (await markWhatsAppOpened(d, ref, token)) ? j(200, { ok: true }) : j(404, { error: "Enquiry not found." });
  return j(404, { error: "Not found." });
}
export async function adminCateringApi(d: CatDeps, method: string, path: string[], body: any, q: URLSearchParams): Promise<ApiResult> {
  const [r, id, sub] = path; const now = d.now?.() ?? new Date();
  if (r === "enquiries") {
    if (!id) return method === "GET" ? j(200, { enquiries: await listEnquiries(d.repo, { q: q.get("q") ?? undefined, status: q.get("status") ?? undefined }) }) : j(405, { error: "Method not allowed." });
    if (!sub && method === "GET") { const e = await adminEnquiry(d.repo, id); return e ? j(200, e) : j(404, { error: "Not found." }); }
    if (sub && method === "POST") return staffAction(d.repo, id, sub, body, now);
  }
  if (r === "content") { if (method === "GET") return j(200, await getCateringContent(d.repo)); if (method === "PUT") return saveCateringContent(d.repo, body); }
  if (r === "gallery") {
    if (!id) { if (method === "GET") return j(200, { items: (await d.repo.docList<{ sort: number }>("cgallery")).sort((a, b) => a.sort - b.sort) }); if (method === "POST") return saveGallery(d.repo, body); }
    else { if (method === "PUT") return saveGallery(d.repo, body, id); if (method === "DELETE") { await d.repo.docDelete("cgallery", id); return j(200, { ok: true }); } }
  }
  return j(404, { error: "Not found." });
}
