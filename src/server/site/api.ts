import type { ApiResult } from "../admin-api";
import type { Repo } from "../repo";
import { listMessages } from "./contact";
import { SECTIONS, getSettings, saveSection, type Section } from "./settings";

const j = (status: number, body: unknown): ApiResult => ({ status, body });
/** Paths are authorised before this runs: site/settings/* needs 'settings', other site/* needs 'content', inbox/* needs 'inbox'. */
export async function siteAdminApi(repo: Repo, method: string, path: string[], body: any, q: URLSearchParams): Promise<ApiResult> {
  const [r, a, b] = path;
  if (r === "site") {
    const s = await getSettings(repo);
    if (a === "settings" && !b && method === "GET") return j(200, { business: s.business, contact: s.contact });
    if (a === "settings" && (b === "business" || b === "contact") && method === "PUT") { const x = await saveSection(repo, b, body); return x.ok ? j(200, x.value) : j(422, { error: x.error }); }
    if (a === "content" && method === "GET") return j(200, { about: s.about, homepage: s.homepage, brand: s.brand, faqs: s.faqs });
    if (a && ["about", "homepage", "brand", "faqs"].includes(a) && method === "PUT") { const x = await saveSection(repo, a as Section, a === "faqs" ? { faqs: body?.faqs } : body); return x.ok ? j(200, x.value) : j(422, { error: x.error }); }
  }
  if (r === "inbox" && a === "messages") {
    if (!b && method === "GET") return j(200, { messages: await listMessages(repo, { q: q.get("q") ?? undefined, status: q.get("status") ?? undefined }) });
    if (b && method === "PATCH") { const m = await repo.docGet<any>("contact", b); if (!m) return j(404, { error: "Not found." }); if (!["new", "read", "handled"].includes(body?.status)) return j(422, { error: "Unknown status." }); m.status = body.status; await repo.docPut("contact", b, m); return j(200, { ok: true }); }
    if (b && method === "DELETE") { await repo.docDelete("contact", b); return j(200, { ok: true }); }
  }
  return j(404, { error: "Not found." });
}
void SECTIONS;
