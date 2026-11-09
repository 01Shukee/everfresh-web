import { vocConfig } from "../../config/vocational";
import { newRef } from "../../lib/ids";
import { UniqueViolation, type Repo } from "../repo";
import { getContent } from "./applications";
import type { Application, Invoice } from "./model";
import { buildInvoiceLines, netOf } from "./pricing";

/**
 * Raises the programme (school fees) invoice when staff ACCEPT the applicant: the first-year charges for the applicant's choices
 * (hostel/day, chosen courses), with the application-form fee already paid credited. Before acceptance nothing is invoiced, so this returns null.
 * Safe to call twice: the first call wins (a unique marker), the second returns the same invoice.
 * Returns null when the programme has no fees set yet; staff can still raise an invoice by hand in the admin.
 */
export async function issueProgrammeInvoice(repo: Repo, now: Date, app: Application): Promise<Invoice | null> {
  if (app.status !== "admitted") return null;
  const marker = `autoinv:${app.ref}`;
  try { await repo.docCreate("idx", marker, { number: "" }); } catch (e) { if (!(e instanceof UniqueViolation)) throw e; const m = await repo.docGet<{ number: string }>("idx", marker); return m?.number ? repo.docGet<Invoice>("invoice", m.number) : null; }
  const lines = buildInvoiceLines(await getContent(repo, app.variantId), app, app.payment.receiptNumber);
  if (netOf(lines) <= 0) { await repo.docDelete("idx", marker); return null; }
  for (let i = 0; ; i++) {
    const inv: Invoice = { number: newRef("VI", now), appRef: app.ref, status: "issued", createdAt: now.toISOString(), issuedAt: now.toISOString(), dueDate: null, paymentTerms: vocConfig.paymentTerms, lines, payments: [], attempts: [], notes: ["Raised automatically when the application was accepted."], auto: true };
    try { await repo.docCreate("invoice", inv.number, inv); await repo.docPut("idx", marker, { number: inv.number }); return inv; } catch (e) { if (!(e instanceof UniqueViolation) || i > 5) { await repo.docDelete("idx", marker); throw e; } }
  }
}