import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { variantById, vocConfig } from "../../config/vocational";
import { newRef } from "../../lib/ids";
import { GatewayError, type PaymentGateway } from "../gateway";
import { UniqueViolation, type Repo } from "../repo";
import { normalisePhone } from "../validation";
import { getInstitute } from "./institute";
import { mailRegistration } from "./emails";
import { checkChoices } from "./pricing";
import { emptyContent, invoiceState, invoiceTotals, type Application, type ApplicationDetails, type Invoice, type VariantContent, type VocAttempt } from "./model";

export interface VocDeps { repo: Repo; gateway: PaymentGateway; siteUrl: string; now?: () => Date; renderPdf?: (html: string) => Promise<Uint8Array> }
export type VocFail = { ok: false; status: number; code: string; message: string; fieldErrors?: Record<string, string> };
const fail = (status: number, code: string, message: string, fieldErrors?: Record<string, string>): VocFail => ({ ok: false, status, code, message, fieldErrors });
const nowOf = (d: VocDeps) => d.now?.() ?? new Date();
export const sameToken = (a: string, b: string) => typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");

export function validateDetails(raw: unknown, now: Date): { ok: true; value: ApplicationDetails } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {}; const r = isRec(raw) ? raw : {}; const f = vocConfig.form;
  const fullName = clean(r.fullName, 80).replace(/\s+/g, " "); if (fullName.length < 2) e.fullName = "Enter your full name.";
  const phone = normalisePhone(r.phone); if (!phone) e.phone = "Enter a valid Nigerian mobile number, for example 0803 123 4567.";
  const email = clean(r.email, 120).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Enter a valid email address.";
  const address = clean(r.address, 250); if (address.length < 10) e.address = "Enter your full residential address (at least 10 characters).";
  let dob: string | null = null; const dobRaw = clean(r.dob, 10);
  if (dobRaw) { const d = new Date(dobRaw + "T00:00:00Z"); if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw) || Number.isNaN(d.getTime()) || d > now || now.getUTCFullYear() - d.getUTCFullYear() > 100) e.dob = "Enter a valid date of birth."; else dob = dobRaw; }
  else if (f.dobRequired) e.dob = "Date of birth is required.";
  const education = clean(r.education, 300) || null; if (!education && f.educationRequired) e.education = "Educational background is required.";
  const emergencyName = clean(r.emergencyName, 80) || null; const ep = clean(r.emergencyPhone, 30); const emergencyPhone = ep ? normalisePhone(ep) : null;
  if (ep && !emergencyPhone) e.emergencyPhone = "Enter a valid Nigerian mobile number.";
  if ((emergencyName && !ep) || (!emergencyName && ep) || (f.emergencyContactRequired && !emergencyName)) e.emergencyName = "Give both the emergency contact's name and phone number.";
  const additional = clean(r.additional, 1000) || null;
  return Object.keys(e).length ? { ok: false, fieldErrors: e } : { ok: true, value: { fullName, phone: phone!, email, dob, address, education, emergencyName, emergencyPhone, additional } };
}

export async function getContent(repo: Repo, variantId: string): Promise<VariantContent> {
  return (await repo.docGet<VariantContent>("content", variantId)) ?? emptyContent(variantId as VariantContent["variantId"]);
}
export const getApp = (repo: Repo, ref: string) => repo.docGet<Application>("app", ref);
export async function appForToken(repo: Repo, ref: string, token: string): Promise<Application | null> {
  const a = await getApp(repo, ref); return a && sameToken(a.token, token) ? a : null;
}
export async function invoicesFor(repo: Repo, ref: string): Promise<Invoice[]> {
  return (await repo.docList<Invoice>("invoice")).filter((i) => i.appRef === ref).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> { const e = inflight.get(key); if (e) return e as Promise<T>; const p = run().finally(() => inflight.delete(key)); inflight.set(key, p); return p; }

async function selection(deps: VocDeps, raw: Record<string, unknown>): Promise<{ variantId: Application["variantId"]; course: string | null; courses: string[]; accommodation: Application["accommodation"] } | VocFail> {
  const v = variantById(raw.variantId); if (!v) return fail(422, "VARIANT_INVALID", "Choose a programme and duration.", { variantId: "Choose a programme and duration." });
  const c = await getContent(deps.repo, v.id);
  if (!c.open) return fail(409, "APPLICATIONS_CLOSED", "Applications for this programme are not open yet.");
  const ch = checkChoices(c, { accommodation: raw.accommodation, courses: raw.courses, course: raw.course });
  if (!ch.ok) return fail(422, ch.errors.courses ? "COURSE_INVALID" : "ACCOMMODATION_INVALID", Object.values(ch.errors)[0], { ...ch.errors, ...(ch.errors.courses ? { course: ch.errors.courses } : {}) });
  return { variantId: v.id, course: ch.course, courses: ch.courses, accommodation: ch.accommodation };
}

export type CreateOut = { ok: true; ref: string; token: string; replay: boolean } | VocFail;
export function createApplication(deps: VocDeps, raw: unknown): Promise<CreateOut> {
  const key = isRec(raw) && typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : "";
  return once("create:" + key, () => doCreate(deps, raw, key));
}
async function doCreate(deps: VocDeps, raw: unknown, key: string): Promise<CreateOut> {
  if (!isRec(raw)) return fail(400, "BAD_REQUEST", "Invalid request.");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return fail(422, "VALIDATION_FAILED", "Missing or invalid request key.");
  const now = nowOf(deps), repo = deps.repo;
  const prior = await repo.docGet<{ ref: string }>("idx", `appkey:${key}`);
  if (prior) { const a = await getApp(repo, prior.ref); if (a) return { ok: true, ref: a.ref, token: a.token, replay: true }; }
  const sel = await selection(deps, raw); if ("ok" in sel) return sel;
  const d = validateDetails(raw.details, now); if (!d.ok) return fail(422, "VALIDATION_FAILED", "Please check the highlighted fields.", d.fieldErrors);

  let ref = newRef("VA", now); const activeKey = `active:${d.value.email}:${sel.variantId}`;
  try { await repo.docCreate("idx", activeKey, { ref }); }
  catch (e) {
    if (!(e instanceof UniqueViolation)) throw e;
    const ex = await repo.docGet<{ ref: string }>("idx", activeKey); const old = ex ? await getApp(repo, ex.ref) : null;
    if (old && old.status !== "withdrawn") return fail(409, "DUPLICATE_APPLICATION", "An application for this programme already exists for this email address. Open the link you saved when you started it, or contact us.");
    await repo.docPut("idx", activeKey, { ref });
  }
  try { await repo.docCreate("idx", `appkey:${key}`, { ref }); }
  catch (e) { if (!(e instanceof UniqueViolation)) throw e; await repo.docDelete("idx", activeKey); const p = await repo.docGet<{ ref: string }>("idx", `appkey:${key}`); const a = p ? await getApp(repo, p.ref) : null; if (a) return { ok: true, ref: a.ref, token: a.token, replay: true }; throw e; }
  const app: Application = { ref, token: randomBytes(18).toString("base64url"), idempotencyKey: key, variantId: sel.variantId, course: sel.course, courses: sel.courses, accommodation: sel.accommodation, details: d.value, status: "draft", feeKobo: vocConfig.applicationFee.kobo,
    payment: { status: "unpaid", attempts: [], paidAt: null, receiptNumber: null }, notes: [], createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: null };
  for (let i = 0; ; i++) {
    try { await repo.docCreate("app", app.ref, app); break; }
    catch (e) { if (!(e instanceof UniqueViolation) || i >= 5) throw e; app.ref = newRef("VA", now); await repo.docPut("idx", activeKey, { ref: app.ref }); await repo.docPut("idx", `appkey:${key}`, { ref: app.ref }); }
  }
  // The registration is saved above. The email is sent afterwards and can never undo or duplicate it: a failure only leaves it queued for a retry.
  try { await mailRegistration(repo, app, await getContent(repo, app.variantId), await getInstitute(repo)); } catch { /* never affects the saved registration */ }
  return { ok: true, ref: app.ref, token: app.token, replay: false };
}

export function updateApplication(deps: VocDeps, ref: string, token: string, raw: unknown): Promise<{ ok: true } | VocFail> { return deps.repo.withLock(`app:${ref}`, () => updateApplicationImpl(deps, ref, token, raw)); }
async function updateApplicationImpl(deps: VocDeps, ref: string, token: string, raw: unknown): Promise<{ ok: true } | VocFail> {
  const app = await appForToken(deps.repo, ref, token); if (!app) return fail(404, "NOT_FOUND", "Application not found.");
  if (app.payment.status === "paid" || !["draft", "awaiting_payment"].includes(app.status)) return fail(409, "LOCKED", "This application has been submitted and can no longer be edited online. Please contact us for corrections.");
  if (!isRec(raw)) return fail(400, "BAD_REQUEST", "Invalid request.");
  const sel = await selection(deps, { variantId: raw.variantId ?? app.variantId, course: raw.course ?? app.course, courses: raw.courses ?? app.courses, accommodation: raw.accommodation ?? app.accommodation }); if ("ok" in sel) return sel;
  const d = validateDetails(raw.details, nowOf(deps)); if (!d.ok) return fail(422, "VALIDATION_FAILED", "Please check the highlighted fields.", d.fieldErrors);
  const oldKey = `active:${app.details.email}:${app.variantId}`, newKey = `active:${d.value.email}:${sel.variantId}`;
  if (oldKey !== newKey) {
    try { await deps.repo.docCreate("idx", newKey, { ref }); }
    catch (e) { if (!(e instanceof UniqueViolation)) throw e; const ex = await deps.repo.docGet<{ ref: string }>("idx", newKey); const o = ex ? await getApp(deps.repo, ex.ref) : null; if (o && o.status !== "withdrawn") return fail(409, "DUPLICATE_APPLICATION", "An application for this programme already exists for that email address."); await deps.repo.docPut("idx", newKey, { ref }); }
    await deps.repo.docDelete("idx", oldKey);
  }
  app.variantId = sel.variantId; app.course = sel.course; app.courses = sel.courses; app.accommodation = sel.accommodation; app.details = d.value; app.updatedAt = nowOf(deps).toISOString();
  await deps.repo.docPut("app", app.ref, app); return { ok: true };
}

export type PayOut = { ok: true; checkoutUrl: string | null; paymentStatus: Application["payment"]["status"] } | VocFail;
/** Starts (or resumes) the application-form fee payment. The amount is fixed on the server; nothing from the browser sets it. */
export async function startApplicationPayment(deps: VocDeps, ref: string, token: string, acknowledged = true): Promise<PayOut> {
  return once("pay:" + ref, () => deps.repo.withLock(`app:${ref}`, async (): Promise<PayOut> => {
    const app = await appForToken(deps.repo, ref, token); if (!app) return fail(404, "NOT_FOUND", "Application not found.");
    const view = (u: string | null): PayOut => ({ ok: true, checkoutUrl: u, paymentStatus: app.payment.status });
    if (app.status === "withdrawn") return fail(409, "WITHDRAWN", "This application was withdrawn.");
    if (app.payment.status === "paid") return view(null);
    const latest = app.payment.attempts[app.payment.attempts.length - 1];
    if (latest && latest.status === "needs_review") return fail(409, "PAYMENT_UNDER_REVIEW", "Your payment needs review. Please contact us before paying again.");
    if (latest && latest.status === "open" && latest.checkoutUrl) return view(latest.checkoutUrl);
    if (!acknowledged && !app.notes.some((n) => n.includes("Acknowledged non-refundable"))) return fail(422, "ACK_REQUIRED", "Please confirm that you understand the application-form fee is non-refundable.");
    if (acknowledged && !app.notes.some((n) => n.includes("Acknowledged non-refundable"))) app.notes.push(`${nowOf(deps).toISOString()} Acknowledged non-refundable application-form fee.`);
    let a = latest && latest.status === "initiating" ? latest : null;
    if (!a) { const n = app.payment.attempts.length + 1; a = { reference: n === 1 ? app.ref : `${app.ref}-A${n}`, checkoutId: null, checkoutUrl: null, status: "initiating", chargeId: null, createdAt: nowOf(deps).toISOString(), error: null, amountKobo: vocConfig.applicationFee.kobo }; app.payment.attempts.push(a); }
    app.payment.status = "pending"; app.status = "awaiting_payment"; await deps.repo.docPut("app", app.ref, app);
    try {
      const s = await deps.gateway.createCheckout({ reference: a.reference, amountKobo: a.amountKobo, customer: { name: app.details.fullName, email: app.details.email, phone: app.details.phone },
        successUrl: `${deps.siteUrl}/application/${app.ref}/${app.token}`, cancelUrl: `${deps.siteUrl}/application/${app.ref}/${app.token}`, metadata: { application_ref: app.ref, kind: "application_fee" }, expiresInMinutes: 60 });
      a.checkoutId = s.checkoutId; a.checkoutUrl = s.checkoutUrl; a.status = "open"; a.error = null; await deps.repo.docPut("app", app.ref, app); return view(s.checkoutUrl);
    } catch (e) { a.error = e instanceof GatewayError ? e.message : "Payment could not be started"; await deps.repo.docPut("app", app.ref, app); return fail(502, "PAYMENT_START_FAILED", "We couldn't start the payment. Nothing was charged. Please try again."); }
  }));
}

/** Staff-issued invoice payment by the applicant: pays the full outstanding balance (no instalments). */
export async function startInvoicePayment(deps: VocDeps, ref: string, token: string, invoiceNumber?: string): Promise<PayOut> {
  return once("invpay:" + ref, async () => {
    const app = await appForToken(deps.repo, ref, token); if (!app) return fail(404, "NOT_FOUND", "Application not found.");
    const cand = (await invoicesFor(deps.repo, ref)).find((i) => i.status === "issued" && (!invoiceNumber || i.number === invoiceNumber) && invoiceTotals(i).outstandingKobo > 0);
    if (!cand) return fail(404, "NO_PAYABLE_INVOICE", "There is no invoice awaiting payment.");
    return deps.repo.withLock(`inv:${cand.number}`, async (): Promise<PayOut> => {
    const inv = (await deps.repo.docGet<Invoice>("invoice", cand.number))!;
    if (inv.status !== "issued" || invoiceTotals(inv).outstandingKobo <= 0) return fail(404, "NO_PAYABLE_INVOICE", "There is no invoice awaiting payment.");
    const owed = invoiceTotals(inv).outstandingKobo; const latest = inv.attempts[inv.attempts.length - 1];
    if (latest && latest.status === "open" && latest.checkoutUrl) return latest.amountKobo === owed ? { ok: true, checkoutUrl: latest.checkoutUrl, paymentStatus: "pending" } : fail(409, "PAYMENT_PENDING", "A payment is already in progress for this invoice. Wait for it to complete or expire.");
    if (latest && latest.status === "needs_review") return fail(409, "PAYMENT_UNDER_REVIEW", "A payment for this invoice needs review. Please contact us.");
    let a = latest && latest.status === "initiating" && latest.amountKobo === owed ? latest : null;
    if (!a) { const n = inv.attempts.length + 1; a = { reference: `${inv.number}-P${n}`, checkoutId: null, checkoutUrl: null, status: "initiating", chargeId: null, createdAt: nowOf(deps).toISOString(), error: null, amountKobo: owed }; inv.attempts.push(a); }
    await deps.repo.docPut("invoice", inv.number, inv);
    try {
      const s = await deps.gateway.createCheckout({ reference: a.reference, amountKobo: owed, customer: { name: app.details.fullName, email: app.details.email, phone: app.details.phone },
        successUrl: `${deps.siteUrl}/application/${app.ref}/${app.token}`, cancelUrl: `${deps.siteUrl}/application/${app.ref}/${app.token}`, metadata: { application_ref: app.ref, invoice: inv.number, kind: "invoice_payment" }, expiresInMinutes: 60 });
      a.checkoutId = s.checkoutId; a.checkoutUrl = s.checkoutUrl; a.status = "open"; await deps.repo.docPut("invoice", inv.number, inv); return { ok: true, checkoutUrl: s.checkoutUrl, paymentStatus: "pending" };
    } catch (e) { a.error = e instanceof GatewayError ? e.message : "Payment could not be started"; await deps.repo.docPut("invoice", inv.number, inv); return fail(502, "PAYMENT_START_FAILED", "We couldn't start the payment. Nothing was charged. Please try again."); }
  }); });
}

/** What the applicant (token holder) may see. Never exposes the token, idempotency key or checkout URLs. */
export async function ownerView(deps: VocDeps, ref: string, token: string) {
  const app = await appForToken(deps.repo, ref, token); if (!app) return null;
  const v = variantById(app.variantId)!; const invs = (await invoicesFor(deps.repo, ref)).filter((i) => i.status === "issued");
  const receipts = await deps.repo.docList<{ number: string; appRef: string; kind: string; amountKobo: number; paidAt: string; invoiceNumber: string | null }>("receipt");
  const last = app.payment.attempts[app.payment.attempts.length - 1];
  return {
    ref: app.ref, status: app.status, variantId: app.variantId, programme: v.label, duration: v.durationLabel, course: app.course, courses: app.courses ?? (app.course ? [app.course] : []), accommodation: app.accommodation ?? null, details: app.details, feeKobo: app.feeKobo,
    payment: { status: app.payment.status, paidAt: app.payment.paidAt, receiptNumber: app.payment.receiptNumber, transactionRef: app.payment.attempts.find((a) => a.status === "succeeded")?.reference ?? null, canRetry: ["failed", "expired"].includes(app.payment.status) || (app.payment.status === "unpaid") },
    lastAttemptError: last?.status === "failed" ? last.error : null, createdAt: app.createdAt, submittedAt: app.submittedAt,
    invoices: invs.map((i) => ({ number: i.number, state: invoiceState(i), issuedAt: i.issuedAt, dueDate: i.dueDate, lines: i.lines, paymentTerms: i.paymentTerms ?? vocConfig.paymentTerms, ...invoiceTotals(i), payments: i.payments.map((p) => ({ amountKobo: p.amountKobo, paidAt: p.paidAt, receiptNumber: p.receiptNumber, method: p.method })), awaitingPayment: i.attempts.some((a) => a.status === "open") })),
    receipts: receipts.filter((r) => r.appRef === ref).map((r) => ({ number: r.number, kind: r.kind, amountKobo: r.amountKobo, paidAt: r.paidAt, invoiceNumber: r.invoiceNumber })),
    nextSteps: vocConfig.nextSteps,
  };
}
export { randomUUID };
