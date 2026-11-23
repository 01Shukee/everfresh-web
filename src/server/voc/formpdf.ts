import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { admissionForm, type FormField, type SignRole } from "../../config/admissionForm";
import { site } from "../../config/site";
import { variantById } from "../../config/vocational";
import { BRAND } from "../emailTemplate";
import type { AdmissionFormRec } from "./form";
import type { Application } from "./model";

export interface FormPdfFiles { passport: Uint8Array | null; signatures: Partial<Record<SignRole, Uint8Array>> }

/** The built-in PDF fonts only know basic Latin: reduce accents and never let an odd character crash the file. */
const safe = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\r\t]/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u20A6\s*/g, "NGN ").replace(/[^\x20-\x7E\n]/g, "?");
function wrap(text: string, f: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (f.widthOfTextAtSize(w, size) > width) { let n = w.length; while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > width) n--; if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, n)); w = w.slice(n); }
      const test = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(test, size) <= width) cur = test; else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out;
}
const hex = (h: string): Color => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const dateStr = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" });

/** blank = a printable form with only the applicant's known details filled in; otherwise the form as saved, with the photo and signatures. */
export async function admissionFormPdf(app: Application, rec: AdmissionFormRec | null, files: FormPdfFiles, blank: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.setTitle(safe(`${site.legalName} ${admissionForm.title} ${app.ref}`));
  const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold); const serifBI = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const deep = hex(BRAND.deep), amber = hex(BRAND.amber), cream = hex(BRAND.cream), ink = hex(BRAND.ink), line = hex(BRAND.line); const grey = rgb(0.38, 0.38, 0.38), white = rgb(1, 1, 1);
  const W = 595.28, H = 841.89, M = 44, CW = W - 2 * M, BOTTOM = 62;
  const embed = async (b: Uint8Array | null | undefined): Promise<PDFImage | null> => { if (!b) return null; try { return b[0] === 0x89 ? await pdf.embedPng(b) : await pdf.embedJpg(b); } catch { return null; } };

  const pre: Record<string, string> = { fullName: app.details.fullName, phone: app.details.phone, email: app.details.email, dob: app.details.dob ?? "", address: app.details.address ?? "", education: app.details.education ?? "" };
  const values: Record<string, string> = {};
  for (const s of admissionForm.sections) for (const f of s.fields) { const own = !blank ? rec?.data[f.id] ?? "" : ""; values[f.id] = own || (f.prefill ? pre[f.prefill] ?? "" : ""); }

  let page!: PDFPage; let y = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: deep }); page.drawRectangle({ x: 0, y: H - 37, width: W, height: 3, color: amber });
    page.drawText("Everfresh", { x: M, y: H - 23, size: 15, font: serifBI, color: white });
    const t = safe(`${admissionForm.title} ${app.ref}`); page.drawText(t, { x: W - M - bold.widthOfTextAtSize(t, 9), y: H - 21, size: 9, font: bold, color: white });
    y = H - 37 - 26;
  };
  const need = (h: number) => { if (y - h < BOTTOM) newPage(); };

  // ---- title, applicant, passport box
  newPage();
  const boxW = 92, boxH = 116, boxX = W - M - boxW, leftW = CW - boxW - 16;
  page.drawText(safe(admissionForm.title), { x: M, y: y - 20, size: 26, font: serifB, color: deep });
  let my = y - 44;
  const meta = (k: string, v: string) => { for (const ln of wrap(`${k}: ${safe(v)}`, font, 10, leftW)) { page.drawText(ln, { x: M, y: my, size: 10, font, color: ink }); my -= 13; } };
  const prog = variantById(app.variantId); const picks = app.courses?.length ? app.courses.join(", ") : app.course;
  meta("Application reference", app.ref); meta("Applicant", app.details.fullName); meta("Programme", `${prog ? `${prog.label}, ${prog.durationLabel}` : ""}${picks ? ` (${picks})` : ""}`);
  if (admissionForm.isPlaceholder) for (const ln of wrap("Draft template: the school's final form will replace this one.", bold, 8.5, leftW)) { page.drawText(ln, { x: M, y: my - 2, size: 8.5, font: bold, color: rgb(0.7, 0.1, 0.1) }); my -= 11; }
  page.drawRectangle({ x: boxX, y: y - boxH, width: boxW, height: boxH, borderColor: grey, borderWidth: 0.8 });
  const photo = await embed(files.passport);
  if (photo) { const s = Math.min((boxW - 6) / photo.width, (boxH - 6) / photo.height); page.drawImage(photo, { x: boxX + (boxW - photo.width * s) / 2, y: y - boxH + (boxH - photo.height * s) / 2, width: photo.width * s, height: photo.height * s }); }
  else { page.drawText("Passport", { x: boxX + 26, y: y - boxH / 2 + 4, size: 8, font: bold, color: grey }); page.drawText("photograph", { x: boxX + 20, y: y - boxH / 2 - 6, size: 8, font: bold, color: grey }); }
  y = Math.min(my, y - boxH) - 14;

  // ---- sections
  const cellH = (f: FormField, w: number) => { const v = values[f.id]; return wrap(safe(f.label), bold, 8, w).length * 10 + 3 + (v ? wrap(safe(v), font, 10, w - 6).length * 13 + 4 : f.kind === "textarea" ? 52 : 24); };
  const drawCell = (x: number, top: number, w: number, f: FormField) => {
    let ty = top; for (const ln of wrap(safe(f.label), bold, 8, w)) { page.drawText(ln, { x, y: ty - 8, size: 8, font: bold, color: deep }); ty -= 10; } ty -= 3;
    const v = values[f.id];
    if (v) { for (const ln of wrap(safe(v), font, 10, w - 6)) { page.drawText(ln, { x: x + 3, y: ty - 10, size: 10, font, color: ink }); ty -= 13; } page.drawLine({ start: { x, y: ty - 3 }, end: { x: x + w, y: ty - 3 }, thickness: 0.5, color: line }); }
    else { const h = f.kind === "textarea" ? 48 : 20; page.drawRectangle({ x, y: ty - h, width: w, height: h, borderColor: line, borderWidth: 0.8 }); }
  };
  const row = (fs: FormField[], ws: number[]) => { const h = Math.max(...fs.map((f, i) => cellH(f, ws[i]))); need(h + 8); let x = M; fs.forEach((f, i) => { drawCell(x, y, ws[i], f); x += ws[i] + 14; }); y -= h + 8; };
  const half = (CW - 14) / 2;
  for (const s of admissionForm.sections) {
    need(70); page.drawText(safe(s.title), { x: M, y: y - 14, size: 13, font: serifB, color: deep }); y -= 22;
    if (s.intro) for (const ln of wrap(safe(s.intro), font, 9, CW)) { page.drawText(ln, { x: M, y: y - 9, size: 9, font, color: grey }); y -= 11; }
    for (let i = 0; i < s.fields.length; i++) {
      const f = s.fields[i]; const g = s.fields[i + 1];
      if (f.kind === "textarea" || !g || g.kind === "textarea") row([f], [CW]); else { row([f, g], [half, half]); i++; }
    }
    y -= 6;
  }

  // ---- declarations and signatures
  for (const b of admissionForm.signBlocks) {
    const img = await embed(files.signatures[b.role]); const decl = wrap(safe(b.declaration), font, 9.5, CW); const sw = 190, sh = 52;
    need(40 + decl.length * 12 + sh + 40);
    page.drawText(safe(b.title), { x: M, y: y - 13, size: 12, font: serifB, color: deep }); y -= 22;
    for (const ln of decl) { page.drawText(ln, { x: M, y: y - 9, size: 9.5, font, color: grey }); y -= 12; }
    y -= 8; page.drawLine({ start: { x: M, y: y - sh }, end: { x: M + sw, y: y - sh }, thickness: 0.8, color: ink });
    if (img) { const s = Math.min(sw / img.width, sh / img.height); page.drawImage(img, { x: M, y: y - sh + 2, width: img.width * s, height: img.height * s }); }
    page.drawText("Signature", { x: M, y: y - sh - 11, size: 8, font: bold, color: grey });
    const nm = wrap(safe(values[b.nameField] ?? ""), font, 10, CW - sw - 30)[0] || ""; const signed = rec?.signatures[b.role]?.signedAt;
    page.drawText(`Name: ${nm || "______________________________"}`, { x: M + sw + 24, y: y - 22, size: 10, font, color: ink });
    page.drawText(`Date: ${signed && !blank ? safe(dateStr(signed)) : "____ / ____ / ________"}`, { x: M + sw + 24, y: y - 46, size: 10, font, color: ink });
    y -= sh + 28;
  }

  // ---- for the school
  need(120); page.drawText("For official use only", { x: M, y: y - 13, size: 12, font: serifB, color: deep }); y -= 22;
  const bh = 74; page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, borderColor: grey, borderWidth: 0.8, color: cream });
  admissionForm.officeLines.forEach((l, i) => { const cx = M + 12 + (i % 2) * (CW / 2); const cy = y - 22 - Math.floor(i / 2) * 32; page.drawText(safe(l), { x: cx, y: cy, size: 8, font: bold, color: deep }); page.drawLine({ start: { x: cx, y: cy - 14 }, end: { x: cx + CW / 2 - 30, y: cy - 14 }, thickness: 0.5, color: ink }); });
  y -= bh + 10;

  // ---- footer on every page
  const pages = pdf.getPages(); const contact = safe([site.contact.address, site.contact.phone, site.contact.email].filter(Boolean).join("   |   "));
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 46 }, end: { x: M + CW, y: 46 }, thickness: 0.5, color: line });
    wrap(contact, font, 8, CW).slice(0, 2).forEach((ln, k) => p.drawText(ln, { x: M, y: 34 - k * 10, size: 8, font, color: grey }));
    p.drawText(safe(site.legalName), { x: M, y: 14, size: 8.5, font: bold, color: deep });
    const t = `Page ${i + 1} of ${pages.length}`; p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 8.5), y: 14, size: 8.5, font, color: grey });
  });
  return pdf.save();
}