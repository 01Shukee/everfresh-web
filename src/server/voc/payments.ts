import { decimalToKobo } from "../../lib/money";
import { newRef } from "../../lib/ids";
import { UniqueViolation, type Repo } from "../repo";
import { invoiceTotals, type Application, type Invoice, type Receipt, type VocAttempt } from "./model";
import { randomUUID } from "node:crypto";
import { getContent } from "./applications";
import { issueProgrammeInvoice } from "./autoinvoice";
import { mailFeeReceived } from "./emails";
import { getInstitute } from "./institute";
import { mailRefund, mailPaymentReview } from "../notify";

export const isVocRef = (r: unknown): r is string => typeof r === "string" && (r.startsWith("VA-") || r.startsWith("VI-"));
import { baseRef } from "../../lib/refs";
const appRefOf = baseRef;
const invNumberOf = baseRef;

export async function vocClaims(ev: { type: string; data: Record<string, any> }, repo: Repo): Promise<boolean> {
  if (isVocRef(ev.data.reference)) return true;
  return ev.type === "refund.paid" && typeof ev.data.charge_id === "string" && !!(await repo.docGet("idx", `charge:${ev.data.charge_id}`));
}

/** One receipt per payment, even if processing is retried after a failure: the payment reference reserves the receipt number first. */
export async function issueReceipt(repo: Repo, now: Date, r: Omit<Receipt, "number">): Promise<Receipt> {
  const key = `rcpt:${r.kind}:${r.invoiceNumber ?? r.appRef}:${r.transactionRef}`;
  for (let i = 0; ; i++) {
    const number = newRef("VR", now);
    try { await repo.docCreate("idx", key, { number }); }
    catch (e) { if (!(e instanceof UniqueViolation)) throw e; const ex = await repo.docGet<{ number: string }>("idx", key); if (!ex) continue; const have = await repo.docGet<Receipt>("receipt", ex.number); if (have) return have; const rec: Receipt = { ...r, number: ex.number }; await repo.docPut("receipt", rec.number, rec); return rec; }
    const rec: Receipt = { ...r, number };
    try { await repo.docCreate("receipt", rec.number, rec); return rec; } catch (e) { if (!(e instanceof UniqueViolation) || i > 5) throw e; await repo.docDelete("idx", key); }
  }
}

/** Applies a verified Bachs event to an application-fee or invoice payment. Only this path can mark vocational payments paid. */
export async function handleVocEvent(ev: { type: string; data: Record<string, any> }, repo: Repo, now: Date): Promise<{ status: number; body: string }> {
  const d = ev.data; const ts = now.toISOString(); const ok = (b = "ok") => ({ status: 200, body: b });
  const refundId = typeof d.refund_id === "string" ? d.refund_id : null;
  let kind: "app" | "inv" | null = null, ref = "";
  if (typeof d.reference === "string" && d.reference.startsWith("VA-")) { kind = "app"; ref = d.reference; }
  else if (typeof d.reference === "string" && d.reference.startsWith("VI-")) { kind = "inv"; ref = d.reference; }
  else if (typeof d.charge_id === "string") { const x = await repo.docGet<{ kind: "app" | "inv"; ref: string }>("idx", `charge:${d.charge_id}`); if (x) { kind = x.kind; ref = x.ref; } }
  if (!kind) return ok("unknown reference");

  if (kind === "app") {
    const app = await repo.docGet<Application>("app", appRefOf(ref)); if (!app) return ok("unknown reference");
    const attempt = app.payment.attempts.find((a) => a.reference === ref) ?? app.payment.attempts.find((a) => a.chargeId && a.chargeId === d.charge_id);
    if (!attempt) return ok("unknown reference");
    const latest = app.payment.attempts[app.payment.attempts.length - 1]; const note = (m: string) => app.notes.push(`${ts} ${m}`); const before = app.payment.status; let firstPaid = false; let appRefunded = false; let appRefundKobo: number | null = null;
    switch (ev.type) {
      case "collection.succeeded": {
        attempt.chargeId = typeof d.charge_id === "string" ? d.charge_id : attempt.chargeId;
        if (app.payment.status === "paid" && app.payment.attempts.some((a) => a !== attempt && a.status === "succeeded")) { attempt.status = "needs_review"; app.payment.status = "needs_review"; note(`DUPLICATE CHARGE: a second application-fee payment (${d.charge_id ?? "no charge id"}) arrived. Refund it in Bachs.`); }
        else if (d.currency !== "NGN" || decimalToKobo(d.amount) !== attempt.amountKobo || attempt.amountKobo !== app.feeKobo) { attempt.status = "needs_review"; app.payment.status = "needs_review"; note(`AMOUNT MISMATCH: expected NGN ${attempt.amountKobo / 100}, received ${d.currency} ${d.amount}. Not confirmed.`); }
        else if (d.status !== "SUCCEEDED") { attempt.status = "needs_review"; app.payment.status = "needs_review"; note(`Payment status ${d.status} needs manual review.`); }
        else if (app.status === "withdrawn") { attempt.status = "needs_review"; app.payment.status = "needs_review"; note("Payment received for a withdrawn application. Refund it in Bachs."); }
        else {
          attempt.status = "succeeded"; app.payment.status = "paid"; app.payment.paidAt = app.payment.paidAt ?? ts;
          if (!app.payment.receiptNumber) { const r = await issueReceipt(repo, now, { kind: "application_fee", appRef: app.ref, invoiceNumber: null, amountKobo: attempt.amountKobo, transactionRef: attempt.reference, chargeId: attempt.chargeId, paidAt: ts, method: "online", note: null }); app.payment.receiptNumber = r.number; }
          if (app.status === "draft" || app.status === "awaiting_payment") { app.status = "submitted"; app.submittedAt = ts; firstPaid = true; }
          if (attempt.chargeId) await repo.docPut("idx", `charge:${attempt.chargeId}`, { kind: "app", ref: app.ref });
        }
        break;
      }
      case "collection.failed":
        if (attempt.status !== "succeeded") attempt.status = "failed"; attempt.error = String(d.reason ?? "Payment failed");
        if (app.payment.status !== "paid" && attempt.reference === latest.reference) { app.payment.status = "failed"; note(`Payment attempt failed: ${attempt.error}`); }
        break;
      case "checkout.expired":
        if (attempt.status === "open" || attempt.status === "initiating") attempt.status = "expired";
        if (app.payment.status === "pending" && attempt.reference === latest.reference) app.payment.status = "expired";
        break;
      case "collection.underpaid": attempt.status = "needs_review"; if (app.payment.status !== "paid") app.payment.status = "needs_review"; note("Applicant underpaid. Review in Bachs."); break;
      case "refund.paid": app.payment.status = "refunded"; note(`Refund ${d.refund_id ?? ""} paid. (Application-form fee is non-refundable; this was an exceptional refund.)`); appRefunded = true; appRefundKobo = decimalToKobo(d.refunded_amount); break;
      default: return ok("ignored");
    }
        if (before !== "needs_review" && app.payment.status === "needs_review") await mailPaymentReview(repo, { to: app.details.email, name: app.details.fullName, ref: app.ref, what: "application-form fee", detail: app.notes[app.notes.length - 1] ?? "", path: `/application/${app.ref}/${app.token}` });
    if (appRefunded) await mailRefund(repo, { kind: "application", to: app.details.email, name: app.details.fullName, ref: app.ref, what: "application-form fee", amountKobo: appRefundKobo, refundId, totalKobo: app.feeKobo, path: `/application/${app.ref}/${app.token}` });
    // Save payment state before follow-up work. A failed write must throw so
    // the webhook can release its event marker and the provider can retry.
    await repo.docPut("app", app.ref, app);
    if (firstPaid) {
      // The school-fees invoice is NOT raised here: it is raised when staff accept the applicant.
      let inv: Invoice | null = null;
      try { inv = await issueProgrammeInvoice(repo, now, app); } catch (e) { app.notes.push(`${ts} The programme invoice could not be raised automatically (${(e as Error).message}). Raise it by hand in the admin.`); await repo.docPut("app", app.ref, app); }
      try { await mailFeeReceived(repo, app, await getContent(repo, app.variantId), await getInstitute(repo), inv); } catch { /* retried from the outbox */ }
    }
    return ok();
  }

  const num = invNumberOf(ref); const inv = await repo.docGet<Invoice>("invoice", num); if (!inv) return ok("unknown reference");
  const attempt = inv.attempts.find((a) => a.reference === ref) ?? inv.attempts.find((a) => a.chargeId && a.chargeId === d.charge_id); if (!attempt) return ok("unknown reference");
  const latest = inv.attempts[inv.attempts.length - 1]; const note = (m: string) => inv.notes.push(`${ts} ${m}`); const beforeA = attempt.status; let invRefunded = false; let invRefundKobo: number | null = null;
  switch (ev.type) {
    case "collection.succeeded": {
      attempt.chargeId = typeof d.charge_id === "string" ? d.charge_id : attempt.chargeId;
      const t = invoiceTotals(inv);
      if (attempt.chargeId && inv.payments.some((p) => p.chargeId === attempt.chargeId)) break; // already applied
      if (d.currency !== "NGN" || decimalToKobo(d.amount) !== attempt.amountKobo || d.status !== "SUCCEEDED") { attempt.status = "needs_review"; note(`AMOUNT/STATUS MISMATCH: expected NGN ${attempt.amountKobo / 100}, received ${d.currency} ${d.amount} (${d.status}). Not applied.`); }
      else if (inv.status !== "issued" || attempt.amountKobo > t.outstandingKobo) { attempt.status = "needs_review"; note(`Payment of NGN ${attempt.amountKobo / 100} exceeds the outstanding balance or the invoice is not open. Not applied; review/refund in Bachs.`); }
      else {
        attempt.status = "succeeded";
        const r = await issueReceipt(repo, now, { kind: "invoice_payment", appRef: inv.appRef, invoiceNumber: inv.number, amountKobo: attempt.amountKobo, transactionRef: attempt.reference, chargeId: attempt.chargeId, paidAt: ts, method: "online", note: null });
        inv.payments.push({ id: randomUUID(), amountKobo: attempt.amountKobo, method: "online", reference: attempt.reference, chargeId: attempt.chargeId, paidAt: ts, receiptNumber: r.number, note: null });
        if (attempt.chargeId) await repo.docPut("idx", `charge:${attempt.chargeId}`, { kind: "inv", ref: inv.number });
      }
      break;
    }
    case "collection.failed": if (attempt.status !== "succeeded") { attempt.status = "failed"; attempt.error = String(d.reason ?? "Payment failed"); } break;
    case "checkout.expired": if (attempt.status === "open" || attempt.status === "initiating") attempt.status = "expired"; break;
    case "collection.underpaid": attempt.status = "needs_review"; note("Applicant underpaid. Review in Bachs."); break;
    case "refund.paid": note(`Refund ${d.refund_id ?? ""} paid (${d.refunded_amount ?? "?"}). Adjust the invoice manually if needed.`); invRefunded = true; invRefundKobo = decimalToKobo(d.refunded_amount); break;
    default: return ok("ignored");
  }
    if (beforeA !== "needs_review" && attempt.status === "needs_review") { const a0 = await repo.docGet<Application>("app", inv.appRef); if (a0) await mailPaymentReview(repo, { to: a0.details.email, name: a0.details.fullName, ref: inv.number, what: "school fees payment", detail: inv.notes[inv.notes.length - 1] ?? "", path: `/application/${a0.ref}/${a0.token}` }); }
  // Save invoice payment state while still inside the webhook's invoice lock.
  // A failed write must throw so the event can be retried safely.
  await repo.docPut("invoice", inv.number, inv);
  if (invRefunded) {
    const a = await repo.docGet<Application>("app", inv.appRef);
    if (a) await mailRefund(repo, { kind: "application", to: a.details.email, name: a.details.fullName, ref: inv.number, what: "school fees payment", amountKobo: invRefundKobo, refundId, totalKobo: attempt.amountKobo, path: `/application/${a.ref}/${a.token}` });
  }
  return ok();
}