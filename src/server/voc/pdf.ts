import { readFileSync } from "node:fs";
import { join } from "node:path";
import { variantById, vocConfig } from "../../config/vocational";
import { site } from "../../config/site";
import { formatNaira } from "../../lib/money";
import { invoiceState, invoiceTotals, type Application, type Invoice, type Receipt } from "./model";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }) + " (WAT)" : "—");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" }) : "—");
let logo = "";
function logoUri() { if (logo) return logo; try { logo = "data:image/jpeg;base64," + readFileSync(join(process.cwd(), "public/brand/everfresh-emblem-reference.jpg")).toString("base64"); } catch { logo = ""; } return logo; }

const CSS = `*{box-sizing:border-box}body{margin:0;font:13px/1.5 "Nunito Sans","Noto Sans","DejaVu Sans",Arial,sans-serif;color:#1E1E1E}
h1,h2{font-family:"Fraunces","Noto Serif","DejaVu Serif",Georgia,serif;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FDB10F;padding-bottom:12px}.brand{display:flex;gap:12px;align-items:center}.brand img{width:56px;height:56px;border-radius:50%}
.brand b{font-size:16px;color:#1B6B28;display:block}.doc{text-align:right}.doc h1{font-size:24px;color:#1B6B28}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:18px 0}.meta div span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#555;font-weight:700}
table{width:100%;border-collapse:collapse;margin:14px 0}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #ddd}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#555}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.tot td{font-weight:700;border-top:2px solid #1B6B28}.banner{padding:10px 14px;border-radius:8px;font-weight:700;margin:14px 0}.warn{background:#FFF3CF;border:1.5px solid #B58300}.ok{background:#E6F2E7;border:1.5px solid #1B6B28;color:#1B6B28}
.note{font-size:11.5px;color:#444;margin-top:14px}.stamp{position:fixed;top:45%;left:12%;font:800 90px "DejaVu Sans",Arial;color:rgba(215,25,31,.12);transform:rotate(-24deg)}
.foot{margin-top:28px;border-top:1px solid #ccc;padding-top:8px;font-size:10.5px;color:#555}`;
const head = (title: string, no: string, issued: string | null) => `<div class="top"><div class="brand">${logoUri() ? `<img src="${logoUri()}" alt="">` : ""}<div><b>${esc(site.legalName)}</b><span>Vocational Studies</span></div></div><div class="doc"><h1>${esc(title)}</h1><div>No. <b>${esc(no)}</b></div><div>${esc(date(issued))}</div></div></div>`;
const page = (body: string, extra = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Everfresh</title><style>${CSS}</style></head><body>${extra}${body}<div class="foot">${esc(site.legalName)}${site.contact.address ? " · " + esc(site.contact.address) : ""}${site.contact.phone ? " · " + esc(site.contact.phone) : ""}${site.contact.email ? " · " + esc(site.contact.email) : ""}</div></body></html>`;
const progLine = (a: Application) => { const v = variantById(a.variantId)!; return `${v.label}, ${v.durationLabel}${a.course ? ` (${a.course})` : ""}`; };
const kv = (rows: [string, string][]) => `<div class="meta">${rows.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("")}</div>`;

/** Proof of a payment that was verified (online) or recorded by staff (manual). */
export function receiptHtml(r: Receipt, a: Application): string {
  const isApp = r.kind === "application_fee";
  return page(`${head("PAYMENT RECEIPT", r.number, r.paidAt)}
${kv([["Receipt number", r.number], ["Application reference", a.ref], ["Applicant", a.details.fullName], ["Programme and duration", progLine(a)], ["Payment date", date(r.paidAt)], ["Payment status", r.method === "online" ? "Paid, verified with the payment provider" : "Paid, recorded by staff"], ["Transaction reference", r.transactionRef], ["Payment method", r.method === "online" ? "Online (card or bank transfer)" : "Manual (bank/teller)"]])}
<table><tr><th>Description</th><th class="n">Amount</th></tr><tr><td>${isApp ? "Application-form fee" : `Payment towards invoice ${esc(r.invoiceNumber)}`}</td><td class="n">${formatNaira(r.amountKobo)}</td></tr><tr class="tot"><td>Amount paid</td><td class="n">${formatNaira(r.amountKobo)}</td></tr></table>
<div class="banner ok">Payment received: ${formatNaira(r.amountKobo)}</div>
<p class="note">${isApp ? `This receipt confirms payment of the application-form fee only. It is not an offer of admission. The application-form fee is ${vocConfig.applicationFee.nonRefundable ? "non-refundable and " : ""}separate from tuition and other programme charges.` : "This receipt confirms the payment shown. See the invoice for the remaining balance, if any."}</p>`);
}

export function confirmationHtml(a: Application, receipt: Receipt | null): string {
  const paid = a.payment.status === "paid";
  return page(`${head("APPLICATION CONFIRMATION", a.ref, a.submittedAt ?? a.createdAt)}
${kv([["Applicant", a.details.fullName], ["Application reference", a.ref], ["Programme and duration", progLine(a)], ["Application-form fee", formatNaira(a.feeKobo)], ["Payment status", paid ? "Paid, verified" : "Not yet paid"], ["Transaction reference", receipt?.transactionRef ?? "—"], ["Payment date", date(a.payment.paidAt)], ["Receipt number", receipt?.number ?? "—"], ["Application status", paid ? "Received, awaiting review" : "Incomplete"]])}
<div class="banner ${paid ? "ok" : "warn"}">${paid ? "Your application has been received and its fee payment verified. It will now be reviewed." : "Your application is incomplete until the application-form fee is paid."}</div>
<p class="note"><b>This is not an offer of admission.</b> Payment of the application-form fee does not mean you have been accepted. You will be told the outcome of your application by the institution.</p>
<p class="note"><b>Next steps:</b> ${esc(vocConfig.nextSteps ?? "[NEXT STEPS: to be supplied by the institution]")}</p>`);
}

/** An invoice is a request for payment. It is never proof of payment; receipts are. */
export function invoiceHtml(i: Invoice, a: Application): string {
  const t = invoiceTotals(i), st = invoiceState(i);
  const kind = { tuition: "Tuition", accommodation: "Accommodation", other: "Other charge", discount: "Discount" } as const;
  const rows = i.lines.map((l) => `<tr><td>${kind[l.kind]}: ${esc(l.label)}</td><td class="n">${l.kind === "discount" ? "-" : ""}${formatNaira(l.amountKobo)}</td></tr>`).join("");
  const banner = st === "paid" ? `<div class="banner ok">Paid in full. This invoice is not a receipt: please keep the individual payment receipts as proof of payment.</div>` : st === "draft" || st === "void" ? `<div class="banner warn">${st === "draft" ? "DRAFT: not yet issued" : "VOID: cancelled invoice"}. Do not pay against this document.</div>` : `<div class="banner warn">THIS IS AN INVOICE, NOT A RECEIPT. Payment is due. Outstanding balance: ${formatNaira(t.outstandingKobo)}.</div>`;
  return page(`${head("INVOICE", i.number, i.issuedAt ?? i.createdAt)}
${kv([["Invoice number", i.number], ["Invoice date", day(i.issuedAt ?? i.createdAt)], ["Due date", i.dueDate ? day(i.dueDate) : "On receipt"], ["Application reference", a.ref], ["Billed to", a.details.fullName], ["Programme and duration", progLine(a)]])}
<table><tr><th>Description</th><th class="n">Amount</th></tr>${rows}<tr class="tot"><td>Total programme cost</td><td class="n">${formatNaira(t.totalKobo)}</td></tr><tr><td>Amount paid</td><td class="n">${formatNaira(t.paidKobo)}</td></tr><tr class="tot"><td>Outstanding balance</td><td class="n">${formatNaira(t.outstandingKobo)}</td></tr></table>
${i.payments.length ? `<table><tr><th>Payments received</th><th>Receipt no.</th><th class="n">Amount</th></tr>${i.payments.map((p) => `<tr><td>${esc(day(p.paidAt))} (${p.method})</td><td>${esc(p.receiptNumber)}</td><td class="n">${formatNaira(p.amountKobo)}</td></tr>`).join("")}</table>` : ""}
${banner}
<p class="note"><b>Payment terms:</b> ${esc(i.paymentTerms ?? vocConfig.paymentTerms ?? "[PAYMENT TERMS: to be supplied by the institution]")}</p>
<p class="note">The application-form fee (${formatNaira(vocConfig.applicationFee.kobo)}) is separate and is not included in this invoice.</p>`, st === "draft" || st === "void" ? `<div class="stamp">${st === "draft" ? "DRAFT" : "VOID"}</div>` : "");
}

/** Renders HTML to PDF with headless Chromium (full Unicode/font support, so the naira sign and Igbo letters render). Requires `npx playwright install chromium` on the host. */
export async function chromiumPdf(html: string): Promise<Uint8Array> {
  let pw: any; try { pw = await import("playwright"); } catch { pw = (await import("node:module")).createRequire(join(process.cwd(), "package.json"))("playwright"); }
  const b = await (pw.chromium ?? pw.default.chromium).launch();
  try { const p = await b.newPage(); await p.setContent(html, { waitUntil: "load" }); return await p.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } }); } finally { await b.close(); }
}
