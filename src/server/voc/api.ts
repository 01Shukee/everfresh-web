import type { ApiResult } from "../admin-api";
import { setApplicationStatus, adminApplication, createInvoice, listApplications, listMedia, recordManualPayment, saveContent, saveMedia, updateInvoice } from "./admin";
import { getInstitute, saveInstitute } from "./institute";
import { appForToken, createApplication, getContent, invoicesFor, startApplicationPayment, startInvoicePayment, updateApplication, type VocDeps } from "./applications";
import { onAdmitted, ownerViewGated } from "./gate";
import type { Application, Invoice, Receipt } from "./model";
import { confirmationHtml, confirmationPdf, invoiceHtml, invoicePdf, receiptHtml, receiptPdf } from "./pdf";

export type ApiOut = ApiResult | { status: 200; pdf: Uint8Array; filename: string };
const j = (status: number, body: unknown): ApiResult => ({ status, body });
const failOut = (r: { status: number; code: string; message: string; fieldErrors?: Record<string, string> }) => j(r.status, { code: r.code, error: r.message, fieldErrors: r.fieldErrors });
const NOT_ACCEPTED = { code: "NOT_ACCEPTED", error: "Your school fees can be paid only after your application has been accepted. Please wait for our acceptance email." };

/** Makes a PDF without a browser (pdf-lib). A test can still pass deps.renderPdf to take the HTML instead. A failure is logged and returns a clear error, never a blank 500. */
const pdf = async (d: VocDeps, html: () => string, make: () => Promise<Uint8Array>, filename: string): Promise<ApiOut> => {
  try { return { status: 200, pdf: d.renderPdf ? await d.renderPdf(html()) : await make(), filename }; }
  catch (e) { console.error("[pdf] could not create", filename, e); return j(500, { error: "We could not create the PDF. Please try again in a moment." }); }
};

/** Applicant-facing API. Everything except POST /applications requires the application's private token. */
export async function applicationsApi(d: VocDeps, method: string, path: string[], body: unknown, q: URLSearchParams): Promise<ApiOut> {
  const [ref, a1, a2] = path; const token = (typeof (body as any)?.token === "string" ? (body as any).token : q.get("t")) ?? "";
  if (!ref) { if (method !== "POST") return j(405, { error: "Method not allowed." }); const r = await createApplication(d, body); return r.ok ? j(r.replay ? 200 : 201, { ref: r.ref, token: r.token }) : failOut(r); }
  if (!a1) {
    if (method === "GET") { const v = await ownerViewGated(d, ref, token); return v ? j(200, v) : j(404, { error: "Application not found." }); }
    if (method === "PUT") { const r = await updateApplication(d, ref, token, body); return r.ok ? j(200, { ok: true }) : failOut(r); }
  }
  if (a1 === "pay" && method === "POST") { const r = await startApplicationPayment(d, ref, token, (body as any)?.acknowledged === true); return r.ok ? j(200, { checkoutUrl: r.checkoutUrl, paymentStatus: r.paymentStatus }) : failOut(r); }
  if (a1 === "invoice" && a2 === "pay" && method === "POST") {
    const app = await appForToken(d.repo, ref, token); if (!app) return j(404, { error: "Application not found." });
    if (app.status !== "admitted") return j(403, NOT_ACCEPTED);   // school fees are payable only after acceptance, whatever the browser sends
    const r = await startInvoicePayment(d, ref, token, (body as any)?.invoice); return r.ok ? j(200, { checkoutUrl: r.checkoutUrl }) : failOut(r);
  }
  if (method === "GET" && (a1 === "receipt" || a1 === "confirmation" || a1 === "invoice")) {
    const app = await appForToken(d.repo, ref, token); if (!app) return j(404, { error: "Not found." });
    if (a1 === "invoice") {
      if (app.status !== "admitted") return j(403, NOT_ACCEPTED);
      const inv = (await invoicesFor(d.repo, ref)).find((i) => i.number === q.get("inv") && i.status === "issued");
      return inv ? pdf(d, () => invoiceHtml(inv, app), () => invoicePdf(inv, app), `invoice-${inv.number}.pdf`) : j(404, { error: "Invoice not found." });
    }
    const receipts = (await d.repo.docList<Receipt>("receipt")).filter((r) => r.appRef === ref);
    if (a1 === "confirmation") { const rc = receipts.find((r) => r.kind === "application_fee") ?? null; return pdf(d, () => confirmationHtml(app, rc), () => confirmationPdf(app, rc), `application-${ref}.pdf`); }
    const r = receipts.find((x) => x.number === (q.get("n") ?? app.payment.receiptNumber));
    return r ? pdf(d, () => receiptHtml(r, app), () => receiptPdf(r, app), `receipt-${r.number}.pdf`) : j(404, { error: "No verified payment receipt yet." });
  }
  return j(404, { error: "Not found." });
}

/** Staff API. The caller (route) must already have verified the admin session. */
export async function adminVocApi(d: VocDeps, method: string, path: string[], body: unknown, q: URLSearchParams): Promise<ApiOut> {
  const [r, id, sub, sub2] = path; const now = d.now?.() ?? new Date();
  if (r === "applications") {
    if (!id) return method === "GET" ? j(200, { applications: await listApplications(d.repo, q.get("status") ?? undefined) }) : j(405, { error: "Method not allowed." });
    if (!sub) {
      if (method === "GET") { const a = await adminApplication(d.repo, id); return a ? j(200, a) : j(404, { error: "Not found." }); }
      if (method === "PATCH") {
        const to = (body as any)?.status; const res = await setApplicationStatus(d.repo, id, to, (body as any)?.note);
        if (res.status === 200 && to === "admitted") await onAdmitted(d, id);   // accepting an applicant raises the school-fees invoice and sends the acceptance email
        return res;
      }
    }
    if (sub === "invoices" && method === "POST") return createInvoice(d.repo, id, body, now);
  }
  if (r === "invoices" && id) {
    if (!sub && method === "PUT") return updateInvoice(d.repo, id, body, now);
    if (sub === "payments" && method === "POST") return recordManualPayment(d.repo, id, body, now);
    if (sub === "pdf" && method === "GET") { const inv = await d.repo.docGet<Invoice>("invoice", id); const app = inv ? await d.repo.docGet<Application>("app", inv.appRef) : null; return inv && app ? pdf(d, () => invoiceHtml(inv, app), () => invoicePdf(inv, app), `invoice-${id}.pdf`) : j(404, { error: "Not found." }); }
  }
  if (r === "receipts" && id && sub === "pdf" && method === "GET") { const rc = await d.repo.docGet<Receipt>("receipt", id); const app = rc ? await d.repo.docGet<Application>("app", rc.appRef) : null; return rc && app ? pdf(d, () => receiptHtml(rc, app), () => receiptPdf(rc, app), `receipt-${id}.pdf`) : j(404, { error: "Not found." }); }
  if (r === "institute") { if (method === "GET") return j(200, await getInstitute(d.repo)); if (method === "PUT") return saveInstitute(d.repo, body); }
  if (r === "content" && id) { if (method === "GET") return j(200, await getContent(d.repo, id)); if (method === "PUT") return saveContent(d.repo, id, body); }
  if (r === "media" && id && ["portfolio", "video", "testimonial"].includes(id)) {
    const kind = id as "portfolio" | "video" | "testimonial";
    if (!sub) { if (method === "GET") return j(200, { items: await listMedia(d.repo, kind) }); if (method === "POST") return saveMedia(d.repo, kind, body); }
    if (sub && method === "PUT") return saveMedia(d.repo, kind, body, sub);
    if (sub && method === "DELETE") { await d.repo.docDelete(kind, sub); return j(200, { ok: true }); }
  }
  void sub2; return j(404, { error: "Not found." });
}