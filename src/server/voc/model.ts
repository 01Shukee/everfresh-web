import type { VariantId } from "../../config/vocational";
import type { PaymentAttempt } from "../types";

export type AppStatus = "draft" | "awaiting_payment" | "submitted" | "under_review" | "admitted" | "not_admitted" | "waitlisted" | "withdrawn";
export type AppPayStatus = "unpaid" | "pending" | "paid" | "failed" | "expired" | "needs_review" | "refunded";
export interface VocAttempt extends PaymentAttempt { amountKobo: number }
export interface ApplicationDetails { fullName: string; phone: string; email: string; dob: string | null; address: string; education: string | null; emergencyName: string | null; emergencyPhone: string | null; additional: string | null }
export interface Application {
  ref: string; token: string; idempotencyKey: string; variantId: VariantId; course: string | null; details: ApplicationDetails;
  status: AppStatus; feeKobo: number; payment: { status: AppPayStatus; attempts: VocAttempt[]; paidAt: string | null; receiptNumber: string | null };
  notes: string[]; createdAt: string; updatedAt: string; submittedAt: string | null;
}
export type LineKind = "tuition" | "accommodation" | "other" | "discount";
export interface InvoiceLine { id: string; kind: LineKind; label: string; amountKobo: number }
export interface InvoicePayment { id: string; amountKobo: number; method: "online" | "manual"; reference: string; chargeId: string | null; paidAt: string; receiptNumber: string; note: string | null }
export interface Invoice {
  number: string; appRef: string; status: "draft" | "issued" | "void"; createdAt: string; issuedAt: string | null; dueDate: string | null; paymentTerms: string | null;
  lines: InvoiceLine[]; payments: InvoicePayment[]; attempts: VocAttempt[]; notes: string[];
}
export interface Receipt {
  number: string; kind: "application_fee" | "invoice_payment"; appRef: string; invoiceNumber: string | null; amountKobo: number;
  transactionRef: string; chargeId: string | null; paidAt: string; method: "online" | "manual"; note: string | null;
}
export interface VariantContent {
  variantId: VariantId; open: boolean; published: boolean; summary: string | null;
  courses: { id: string; name: string; description: string | null }[]; curriculum: { title: string; topics: string[] }[];
  requirements: string[]; benefits: string[];
  fees: { id: string; label: string; kind: "tuition" | "accommodation" | "other"; amountKobo: number | null; note: string | null }[];
  accommodation: { available: boolean | null; note: string | null }; intakeNote: string | null;
}
export const emptyContent = (variantId: VariantId): VariantContent => ({ variantId, open: false, published: false, summary: null, courses: [], curriculum: [], requirements: [], benefits: [], fees: [], accommodation: { available: null, note: null }, intakeNote: null });
export interface PortfolioItem { id: string; kind: "project" | "student" | "instructor" | "facility"; title: string; caption: string; imageUrl: string; imageAlt: string; variantId: VariantId | null; published: boolean; sort: number }
export interface VideoItem { id: string; title: string; description: string; src: string; poster: string | null; captions: string | null; published: boolean; sort: number }
export interface Testimonial { id: string; quote: string; name: string; relation: string; permission: boolean; published: boolean }

export const sumKind = (l: InvoiceLine[], f: (k: LineKind) => boolean) => l.filter((x) => f(x.kind)).reduce((s, x) => s + x.amountKobo, 0);
/** Totals are always derived from lines and payments; nothing is typed in by hand. */
export function invoiceTotals(i: Pick<Invoice, "lines" | "payments">) {
  const charges = sumKind(i.lines, (k) => k !== "discount"), discounts = sumKind(i.lines, (k) => k === "discount");
  const total = charges - discounts, paid = i.payments.reduce((s, p) => s + p.amountKobo, 0);
  return { chargesKobo: charges, discountsKobo: discounts, totalKobo: total, paidKobo: paid, outstandingKobo: Math.max(total - paid, 0) };
}
export function invoiceState(i: Invoice): "draft" | "void" | "unpaid" | "part_paid" | "paid" {
  if (i.status !== "issued") return i.status; const t = invoiceTotals(i);
  return t.outstandingKobo === 0 && t.totalKobo > 0 ? "paid" : t.paidKobo > 0 ? "part_paid" : "unpaid";
}
