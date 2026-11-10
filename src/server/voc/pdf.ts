import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, appendBezierCurve, clip, closePath, degrees, endPath, moveTo, popGraphicsState, pushGraphicsState, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { variantById, vocConfig } from "../../config/vocational";
import { site } from "../../config/site";
import { formatNaira } from "../../lib/money";
import { invoiceState, invoiceTotals, type Application, type Invoice, type Receipt } from "./model";

/**
 * Receipts, application confirmations and invoices, in the same design as the Everfresh emails.
 * Each document is first described as a small neutral "Doc" (blocks of text, tables and banners), then drawn as a PDF with pdf-lib
 * (no browser needed, so it works on Vercel) or, for tests, as HTML.
 */
type Fmt = (kobo: number) => string;
const pdfMoney: Fmt = (k) => formatNaira(k).replace(/\u20A6\s*/g, "NGN ");   // the built-in PDF font has no naira sign

type Block =
  | { t: "meta"; rows: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][]; bold?: number[] }   // last column is right-aligned; bold = row numbers
  | { t: "banner"; kind: "ok" | "warn"; text: string }
  | { t: "note"; lead?: string; text: string };
export interface Doc { title: string; no: string; issued: string | null; blocks: Block[]; stamp?: string }

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }) + " (WAT)" : "-");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" }) : "-");
const progLine = (a: Application) => { const v = variantById(a.variantId)!; const picks = a.courses?.length ? a.courses.join(", ") : a.course; const acc = a.accommodation === "hostel" ? "hostel student" : a.accommodation === "day" ? "day student" : null; const extra = [picks, acc].filter(Boolean).join("; "); return `${v.label}, ${v.durationLabel}${extra ? ` (${extra})` : ""}`; };
const contactText = () => [site.contact.address, site.contact.phone, site.contact.email].filter(Boolean).join("  -  ");
const footerText = () => [site.legalName, site.contact.address, site.contact.phone, site.contact.email].filter(Boolean).join(" - ");
const nice = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();   // "PAYMENT RECEIPT" -> "Payment receipt"

let logoBytes: Uint8Array | null | undefined;
function logoJpg(): Uint8Array | null {
  if (logoBytes !== undefined) return logoBytes;
  try { logoBytes = readFileSync(join(process.cwd(), "public/brand/everfresh-emblem-reference.jpg")); } catch { logoBytes = null; }
  return logoBytes;
}

// The brand colours, the same ones the emails use (see emailTemplate.ts).
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const P = { green: hex("#2E9E34"), deep: hex("#1B6B28"), amber: hex("#FDB10F"), cream: hex("#FAF8F2"), ink: hex("#1E1E1E"), line: hex("#E6E1D3"), soft: hex("#555555"), white: rgb(1, 1, 1), okBg: hex("#E8F3E9"), warnBg: hex("#FFF6DC"), red: hex("#D7191F") };

// ------------------------------------------------------------------ the three documents
/** Proof of a payment that was verified (online) or recorded by staff (manual). */
export function receiptDoc(r: Receipt, a: Application, f: Fmt): Doc {
  const isApp = r.kind === "application_fee";
  return {
    title: "PAYMENT RECEIPT", no: r.number, issued: r.paidAt,
    blocks: [
      { t: "meta", rows: [["Receipt number", r.number], ["Application reference", a.ref], ["Applicant", a.details.fullName], ["Programme and duration", progLine(a)], ["Payment date", date(r.paidAt)], ["Payment status", r.method === "online" ? "Paid, verified with the payment provider" : "Paid, recorded by staff"], ["Transaction reference", r.transactionRef], ["Payment method", r.method === "online" ? "Online (card or bank transfer)" : "Manual (bank/teller)"]] },
      { t: "table", head: ["Description", "Amount"], rows: [[isApp ? "Application-form fee" : `Payment towards invoice ${r.invoiceNumber ?? ""}`, f(r.amountKobo)], ["Amount paid", f(r.amountKobo)]], bold: [1] },
      { t: "banner", kind: "ok", text: `Payment received: ${f(r.amountKobo)}` },
      isApp
        ? { t: "note", lead: "This is not an offer of admission.", text: `This receipt confirms payment of the application-form fee only. The fee is ${vocConfig.applicationFee.nonRefundable ? "non-refundable and " : ""}${vocConfig.applicationFee.creditedToTuition ? "will be deducted from your school fees if you are accepted." : "separate from tuition and other programme charges."}` }
        : { t: "note", text: "This receipt confirms the payment shown. See the invoice for the remaining balance, if any." },
    ],
  };
}

export function confirmationDoc(a: Application, receipt: Receipt | null, f: Fmt): Doc {
  const paid = a.payment.status === "paid"; const accepted = a.status === "admitted";
  return {
    title: "APPLICATION CONFIRMATION", no: a.ref, issued: a.submittedAt ?? a.createdAt,
    blocks: [
      { t: "meta", rows: [["Applicant", a.details.fullName], ["Application reference", a.ref], ["Programme and duration", progLine(a)], ["Application-form fee", f(a.feeKobo)], ["Payment status", paid ? "Paid, verified" : "Not yet paid"], ["Transaction reference", receipt?.transactionRef ?? "-"], ["Payment date", date(a.payment.paidAt)], ["Receipt number", receipt?.number ?? "-"], ["Application status", paid ? (accepted ? "Accepted" : "Received, awaiting review") : "Incomplete"]] },
      { t: "banner", kind: paid ? "ok" : "warn", text: paid ? (accepted ? "Your application has been accepted." : "Your application has been received and its fee payment verified. It will now be reviewed.") : "Your application is incomplete until the application-form fee is paid." },
      accepted
        ? { t: "note", lead: "Accepted.", text: "You can now pay your school fees from your application page." }
        : { t: "note", lead: "This is not an offer of admission.", text: "Payment of the application-form fee does not mean you have been accepted. You will be told the outcome of your application by the institution. School fees can be paid only after you are accepted." },
      { t: "note", lead: "Next steps:", text: vocConfig.nextSteps ?? "Wait for an email from us confirming your acceptance." },
    ],
  };
}

/** An invoice is a request for payment. It is never proof of payment; receipts are. */
export function invoiceDoc(i: Invoice, a: Application, f: Fmt): Doc {
  const t = invoiceTotals(i), st = invoiceState(i);
  const kind = { tuition: "Tuition", accommodation: "Accommodation", other: "Other charge", discount: "Discount" } as const;
  const lines = i.lines.map((l) => [`${kind[l.kind]}: ${l.label}`, `${l.kind === "discount" ? "-" : ""}${f(l.amountKobo)}`]);
  const n = lines.length;
  const banner: Block = st === "paid"
    ? { t: "banner", kind: "ok", text: "Paid in full. This invoice is not a receipt: please keep the individual payment receipts as proof of payment." }
    : st === "draft" || st === "void"
      ? { t: "banner", kind: "warn", text: `${st === "draft" ? "DRAFT: not yet issued" : "VOID: cancelled invoice"}. Do not pay against this document.` }
      : { t: "banner", kind: "warn", text: `THIS IS AN INVOICE, NOT A RECEIPT. Payment is due. Outstanding balance: ${f(t.outstandingKobo)}.` };
  return {
    title: "INVOICE", no: i.number, issued: i.issuedAt ?? i.createdAt, stamp: st === "draft" ? "DRAFT" : st === "void" ? "VOID" : undefined,
    blocks: [
      { t: "meta", rows: [["Invoice number", i.number], ["Invoice date", day(i.issuedAt ?? i.createdAt)], ["Due date", i.dueDate ? day(i.dueDate) : "On receipt"], ["Application reference", a.ref], ["Billed to", a.details.fullName], ["Programme and duration", progLine(a)]] },
      { t: "table", head: ["Description", "Amount"], rows: [...lines, ["Total programme cost", f(t.totalKobo)], ["Amount paid", f(t.paidKobo)], ["Outstanding balance", f(t.outstandingKobo)]], bold: [n, n + 2] },
      ...(i.payments.length ? [{ t: "table" as const, head: ["Payments received", "Receipt no.", "Amount"], rows: i.payments.map((p) => [`${day(p.paidAt)} (${p.method})`, p.receiptNumber, f(p.amountKobo)]) }] : []),
      banner,
      { t: "note", lead: "Payment terms:", text: i.paymentTerms ?? vocConfig.paymentTerms ?? "[PAYMENT TERMS: to be supplied by the institution]" },
      { t: "note", text: `The application-form fee (${f(vocConfig.applicationFee.kobo)}) was paid earlier and is ${vocConfig.applicationFee.creditedToTuition ? "already credited on this invoice." : "not included in this invoice."}` },
    ],
  };
}

// ------------------------------------------------------------------ HTML (used only when a test supplies its own renderer)
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const SERIF = "Georgia,'Times New Roman','Noto Serif','DejaVu Serif',serif";
const SANS = "-apple-system,'Segoe UI',Roboto,'Nunito Sans','Noto Sans','DejaVu Sans',Helvetica,Arial,sans-serif";
const CSS = `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:14px/1.6 ${SANS};color:#1E1E1E;background:#fff}
.band{background:#1B6B28;padding:18px 44px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:12px}.brand img{width:48px;height:48px;border-radius:50%;background:#fff}
.wm{font:italic 700 26px/1 ${SERIF};color:#fff}.rt{text-align:right;color:#FAF8F2;font-size:11px;line-height:1.5}.stripe{height:5px;background:#FDB10F}
.content{padding:26px 44px 8px}h1{margin:0 0 14px;font:700 28px/1.2 ${SERIF};color:#1B6B28}
.badge{display:inline-block;background:#FDB10F;border-radius:10px;padding:10px 16px;font:700 18px/1 ${SANS};letter-spacing:.04em;margin:0 0 18px}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #E6E1D3;border-radius:12px;overflow:hidden;margin:0 0 18px}
td,th{padding:10px 14px;text-align:left;vertical-align:top;border-top:1px solid #E6E1D3}tr:first-child>td,tr:first-child>th{border-top:0}
.kv th{width:36%;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#1B6B28}.kv tr:nth-child(odd){background:#FAF8F2}
.tb th{background:#FAF8F2;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#1B6B28}.tb td.n,.tb th.n{text-align:right;white-space:nowrap}.tb tr.strong td{background:#FAF8F2;font-weight:700}.tb td.credit{color:#1B6B28}
.banner{border-radius:10px;padding:12px 16px;font-weight:700;margin:0 0 16px}.ok{background:#E8F3E9;border:1.5px solid #1B6B28;color:#1B6B28}.warn{background:#FFF6DC;border:1.5px solid #FDB10F}
.note{margin:0 0 10px;font-size:13px}.stamp{position:fixed;top:45%;left:12%;font:800 90px ${SANS};color:rgba(215,25,31,.12);transform:rotate(-24deg)}
.foot{background:#FAF8F2;border-top:1px solid #E6E1D3;padding:16px 44px;margin-top:24px;font-size:12px;color:#555}.foot b{display:block;color:#1B6B28;margin-top:6px}`;
const logoUri = () => { const b = logoJpg(); return b ? "data:image/jpeg;base64," + Buffer.from(b).toString("base64") : ""; };
const blockHtml = (b: Block): string => {
  if (b.t === "meta") return `<table class="kv">${b.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  if (b.t === "table") return `<table class="tb"><tr>${b.head.map((h, i) => `<th${i === b.head.length - 1 ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr>${b.rows.map((r, ri) => `<tr${b.bold?.includes(ri) ? ' class="strong"' : ""}>${r.map((c, i) => `<td class="${i === r.length - 1 ? "n" : ""}${i === r.length - 1 && c.startsWith("-") ? " credit" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
  if (b.t === "banner") return `<div class="banner ${b.kind}">${esc(b.text)}</div>`;
  return `<p class="note">${b.lead ? `<b>${esc(b.lead)}</b> ` : ""}${esc(b.text)}</p>`;
};
export function toHtml(d: Doc): string {
  const band = `<div class="band"><div class="brand">${logoUri() ? `<img src="${logoUri()}" alt="">` : ""}<span class="wm">Everfresh</span></div><div class="rt"><b>Vocational Studies</b><br>${esc(date(d.issued))}</div></div><div class="stripe"></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Everfresh</title><style>${CSS}</style></head><body>${d.stamp ? `<div class="stamp">${esc(d.stamp)}</div>` : ""}${band}<div class="content"><h1>${esc(d.title)}</h1><div class="badge">No. ${esc(d.no)}</div>${d.blocks.map(blockHtml).join("")}</div><div class="foot">${esc(contactText())}<b>${esc(site.legalName)}</b></div></body></html>`;
}

// ------------------------------------------------------------------ PDF (pdf-lib)
/** The built-in PDF fonts only know basic Latin: reduce accents, replace fancy punctuation, and never let an odd character crash the file. */
const safe = (v: unknown) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\r\t]/g, " ").replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, " ")
  .replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014\u2212\u00B7]/g, "-").replace(/\u2026/g, "...")
  .replace(/\u20A6\s*/g, "NGN ")
  .replace(/[^\x20-\x7E\n]/g, "?");

function wrap(text: string, f: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (f.widthOfTextAtSize(w, size) > width) {   // a single very long word (an email, a reference): break it
        let n = w.length; while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
        if (cur) { out.push(cur); cur = ""; }
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) <= width) cur = test; else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out;
}

/** A rounded rectangle as an SVG path, with its top-left corner at (0, 0). */
const rrPath = (w: number, h: number, r: number) => `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
type Row = { h: number; fill: RGB; draw: (top: number) => void };

export async function toPdf(doc: Doc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${site.legalName} ${doc.title} ${doc.no}`));
  const sans = await pdf.embedFont(StandardFonts.Helvetica); const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold); const serifBI = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  let logo: PDFImage | null = null; const lb = logoJpg(); if (lb) { try { logo = await pdf.embedJpg(lb); } catch { logo = null; } }
  const W = 595.28, H = 841.89, M = 44, CW = W - 2 * M, FOOT = 52, LIMIT = FOOT + 22;
  let page: PDFPage = pdf.addPage([W, H]); let y = 0;

  const rrect = (x: number, top: number, w: number, h: number, r: number, o: { color?: RGB; borderColor?: RGB; borderWidth?: number }) => page.drawSvgPath(rrPath(w, h, r), { x, y: top, ...o });
  const rightText = (s: string, size: number, f: PDFFont, yy: number, color: RGB) => { const t = safe(s); page.drawText(t, { x: W - M - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color }); };

  /** The green band with the logo and wordmark, the amber stripe, and the starting height for the content. Later pages get a slimmer band. */
  function drawHeader(compact: boolean): number {
    const bandH = compact ? 46 : 78, stripe = compact ? 3 : 5, r = compact ? 15 : 24;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: P.deep });
    page.drawRectangle({ x: 0, y: H - bandH - stripe, width: W, height: stripe, color: P.amber });
    const cx = M + r, cy = H - bandH / 2;
    if (logo) {   // the logo is cropped to a circle, like in the email
      page.drawCircle({ x: cx, y: cy, size: r, color: P.white });
      const k = 0.5523 * r;
      page.pushOperators(pushGraphicsState(), moveTo(cx + r, cy), appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r), appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy), appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r), appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy), closePath(), clip(), endPath());
      page.drawImage(logo, { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r });
      page.pushOperators(popGraphicsState());
    }
    const ws = compact ? 17 : 26;
    page.drawText("Everfresh", { x: M + 2 * r + 12, y: cy - ws * 0.32, size: ws, font: serifBI, color: P.white });
    if (compact) rightText(`${nice(doc.title)} ${doc.no}`, 8.5, sans, cy - 3, P.cream);
    else { rightText("Vocational Studies", 9, sansB, cy + 4, P.cream); rightText(date(doc.issued), 8.5, sans, cy - 9, P.cream); }
    return H - bandH - stripe - (compact ? 26 : 32);
  }
  const nextPage = () => { page = pdf.addPage([W, H]); y = drawHeader(true); };
  const need = (h: number) => { if (y - h < LIMIT) nextPage(); };

  /** A bordered, rounded box made of rows. If it runs past the page, it continues in its own box on the next page. */
  function box(rows: Row[]) {
    let segTop = y;
    const close = () => { if (segTop - y > 1) rrect(M, segTop, CW, segTop - y, 6, { borderColor: P.line, borderWidth: 1 }); };
    rows.forEach((r, i) => {
      if (y - r.h < LIMIT) { close(); nextPage(); segTop = y; }
      page.drawRectangle({ x: M, y: y - r.h, width: CW, height: r.h, color: r.fill });
      if (i > 0 && y !== segTop) page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.7, color: P.line });
      r.draw(y); y -= r.h;
    });
    close(); y -= 18;
  }

  function kvBlock(rows: [string, string][]) {
    const LW = CW * 0.36;
    box(rows.map(([k, v], i): Row => {
      const kl = wrap(safe(k).toUpperCase(), sansB, 8, LW - 24), vl = wrap(safe(v), sans, 10, CW - LW - 16);
      return { h: Math.max(kl.length * 11, vl.length * 13) + 20, fill: i % 2 ? P.white : P.cream, draw: (top) => { kl.forEach((l, j) => page.drawText(l, { x: M + 14, y: top - 19 - j * 11, size: 8, font: sansB, color: P.deep })); vl.forEach((l, j) => page.drawText(l, { x: M + LW, y: top - 21 - j * 13, size: 10, font: sans, color: P.ink })); } };
    }));
  }

  function tableBlock(head: string[], rows: string[][], bold: number[] = []) {
    const n = head.length, lastW = 130, otherW = (CW - lastW) / (n - 1);
    const widths = head.map((_, i) => (i === n - 1 ? lastW : otherW));
    const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((s, w) => s + w, 0));
    const put = (i: number, s: string, f: PDFFont, size: number, base: number, color: RGB) => page.drawText(s, { x: i === n - 1 ? xs[i] + widths[i] - 14 - f.widthOfTextAtSize(s, size) : xs[i] + 14, y: base, size, font: f, color });
    const specs: Row[] = [{ h: 26, fill: P.cream, draw: (top) => head.forEach((h, i) => put(i, safe(h).toUpperCase(), sansB, 8, top - 17, P.deep)) }];
    rows.forEach((row, ri) => {
      const b = bold.includes(ri), f = b ? sansB : sans; const cells = row.map((c, i) => wrap(safe(c), f, 10.5, widths[i] - 28));
      specs.push({ h: Math.max(...cells.map((l) => l.length)) * 14 + 18, fill: b ? P.cream : P.white, draw: (top) => cells.forEach((lines, i) => lines.forEach((ln, li) => put(i, ln, f, 10.5, top - 19 - li * 14, i === n - 1 && ln.startsWith("-") ? P.deep : P.ink))) });
    });
    box(specs);
  }

  function bannerBlock(kind: "ok" | "warn", text: string) {
    const lines = wrap(safe(text), sansB, 10.5, CW - 32), h = lines.length * 14 + 24; need(h + 4);
    const ok = kind === "ok";
    rrect(M, y, CW, h, 8, { color: ok ? P.okBg : P.warnBg, borderColor: ok ? P.deep : P.amber, borderWidth: 1.2 });
    lines.forEach((ln, li) => page.drawText(ln, { x: M + 16, y: y - 22 - li * 14, size: 10.5, font: sansB, color: ok ? P.deep : P.ink }));
    y -= h + 16;
  }

  function noteBlock(lead: string | undefined, text: string) {
    if (lead) { need(16); page.drawText(safe(lead), { x: M, y: y - 11, size: 10.5, font: sansB, color: P.ink }); y -= 16; }
    for (const ln of wrap(safe(text), sans, 10, CW)) { need(14); page.drawText(ln, { x: M, y: y - 10, size: 10, font: sans, color: P.ink }); y -= 14; }
    y -= 10;
  }

  // ---- first page: header, title and the amber reference badge (like the email)
  y = drawHeader(false);
  page.drawText(safe(nice(doc.title)), { x: M, y: y - 22, size: 24, font: serifB, color: P.deep }); y -= 40;
  const badge = safe(doc.no), bw = sansB.widthOfTextAtSize(badge, 14) + 32;
  rrect(M, y, bw, 32, 8, { color: P.amber }); page.drawText(badge, { x: M + 16, y: y - 21, size: 14, font: sansB, color: P.ink }); y -= 52;

  for (const b of doc.blocks) {
    if (b.t === "meta") kvBlock(b.rows);
    else if (b.t === "table") tableBlock(b.head, b.rows, b.bold);
    else if (b.t === "banner") bannerBlock(b.kind, b.text);
    else noteBlock(b.lead, b.text);
  }

  // ---- footer on every page, then the DRAFT / VOID stamp
  const pages = pdf.getPages(); const contact = wrap(safe(contactText()), sans, 8.5, CW)[0] ?? "";
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 0, y: 0, width: W, height: FOOT, color: P.cream });
    p.drawLine({ start: { x: 0, y: FOOT }, end: { x: W, y: FOOT }, thickness: 0.8, color: P.line });
    if (contact) p.drawText(contact, { x: M, y: 33, size: 8.5, font: sans, color: P.soft });
    p.drawText(safe(site.legalName), { x: M, y: 19, size: 9, font: sansB, color: P.deep });
    const pn = `Page ${i + 1} of ${pages.length}`; p.drawText(pn, { x: W - M - sans.widthOfTextAtSize(pn, 8), y: 19, size: 8, font: sans, color: P.soft });
    if (doc.stamp) p.drawText(safe(doc.stamp), { x: 90, y: 280, size: 110, font: sansB, color: P.red, opacity: 0.12, rotate: degrees(35) });
  });
  return pdf.save();
}

// ------------------------------------------------------------------ what the rest of the app calls
export const receiptHtml = (r: Receipt, a: Application) => toHtml(receiptDoc(r, a, formatNaira));
export const receiptPdf = (r: Receipt, a: Application) => toPdf(receiptDoc(r, a, pdfMoney));
export const confirmationHtml = (a: Application, r: Receipt | null) => toHtml(confirmationDoc(a, r, formatNaira));
export const confirmationPdf = (a: Application, r: Receipt | null) => toPdf(confirmationDoc(a, r, pdfMoney));
export const invoiceHtml = (i: Invoice, a: Application) => toHtml(invoiceDoc(i, a, formatNaira));
export const invoicePdf = (i: Invoice, a: Application) => toPdf(invoiceDoc(i, a, pdfMoney));
export { footerText };

/**
 * Test-only HTML-to-PDF renderer using Playwright.
 * Production PDF generation continues to use pdf-lib. Playwright is loaded here, only when a test asks for it,
 * so the live site never loads the browser library.
 */
export async function chromiumPdf(html: string): Promise<Uint8Array> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}