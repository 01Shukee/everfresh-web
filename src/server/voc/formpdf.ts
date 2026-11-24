import { readFileSync } from "node:fs";
import { join } from "node:path";
import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { admissionForm, applicantName, SIGN_ROLES, type SignRole } from "../../config/admissionForm";
import type { AdmissionFormRec } from "./form";
import type { Application } from "./model";

export interface FormPdfFiles { passport: Uint8Array | null; signatures: Partial<Record<SignRole, Uint8Array>> }

/**
 * The school's own admission form, redrawn point for point (two US Letter pages, the size of the school's original).
 * Every position below was measured from the school's form: x runs from the left edge, y from the TOP edge of the page, in points.
 * `blank` = the printable form (only details we already know are filled in); otherwise the form as saved, with the photo and signatures.
 */
const W = 612, H = 792;
const INK = rgb(0, 0, 0), ENTRY = rgb(0.04, 0.12, 0.33), GREY = rgb(0.5, 0.5, 0.5), BAR = rgb(0.2, 0.2, 0.2), WHITE = rgb(1, 1, 1), CAPTION = rgb(0.15, 0.15, 0.15);
const BODY = 10.4;

/** The built-in PDF fonts only know basic Latin: reduce accents and never let an odd character crash the file. */
const safe = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\r\t\n]/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7E]/g, "?");
const dmy = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };
const signedOn = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" });
function wrap(text: string, f: PDFFont, size: number, width: number): string[] {
  const out: string[] = []; let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) { const t = cur ? `${cur} ${word}` : word; if (f.widthOfTextAtSize(t, size) <= width) cur = t; else { if (cur) out.push(cur); cur = word; } }
  if (cur) out.push(cur); return out;
}
function readLogo(): Uint8Array | null { try { return readFileSync(join(process.cwd(), admissionForm.logo.file)); } catch { return null; } }

type Row = [label: string, labelX: number, field: string | null, x1: number, x2: number];

export async function admissionFormPdf(app: Application, rec: AdmissionFormRec | null, files: FormPdfFiles, blank: boolean, withOffice = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.setTitle(safe(`${admissionForm.letterhead.name} ${admissionForm.title} ${app.ref}`));
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const times = await pdf.embedFont(StandardFonts.TimesRoman), timesBI = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const embed = async (b: Uint8Array | null | undefined): Promise<PDFImage | null> => { if (!b) return null; try { return b[0] === 0x89 ? await pdf.embedPng(b) : await pdf.embedJpg(b); } catch { return null; } };

  // What goes in each blank: what the applicant saved, else what we already know from the application. A printable form never carries the applicant's own entries.
  const known: Record<string, string> = { phone: app.details.phone, dob: app.details.dob ?? "", address: app.details.address ?? "" };
  const values: Record<string, string> = {};
  for (const fld of [...admissionForm.A.nameFields, ...admissionForm.A.fields]) values[fld.id] = (!blank ? rec?.data[fld.id] : "") || (fld.prefill ? known[fld.prefill] ?? "" : "");
  const all = [...admissionForm.B.rows.flat(), ...admissionForm.C.courses.map((c) => c.field), ...admissionForm.D.fields, ...admissionForm.E.fields, ...admissionForm.G.fields];
  for (const fld of all) values[fld.id] = !blank ? rec?.data[fld.id] ?? "" : "";
  const v = (id: string) => values[id] ?? "";
  const fullName = blank ? "" : applicantName(values);

  const sigImg: Partial<Record<SignRole, PDFImage | null>> = {};
  if (!blank) for (const r of SIGN_ROLES) sigImg[r] = await embed(files.signatures[r]);
  const photo = blank ? null : await embed(files.passport);
  const logoBytes = readLogo(); const logo = await embed(logoBytes);

  // ------------------------------------------------------------------ drawing helpers (y = distance from the top of the page)
  let page!: PDFPage;
  const Y = (top: number) => H - top;
  const text = (s: string, x: number, base: number, f: PDFFont, size: number, color = INK) => page.drawText(s, { x, y: Y(base), size, font: f, color });
  const centered = (s: string, cx: number, base: number, f: PDFFont, size: number, color = INK) => text(s, cx - f.widthOfTextAtSize(s, size) / 2, base, f, size, color);
  /** Draws the text stretched or squeezed to an exact width: this is how the school's narrow bold lettering is matched with the standard fonts. */
  const fitted = (s: string, x: number, base: number, f: PDFFont, size: number, width: number, color = INK) => {
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(width / f.widthOfTextAtSize(s, size), 0, 0, 1, x, Y(base)));
    page.drawText(s, { x: 0, y: 0, size, font: f, color }); page.pushOperators(popGraphicsState());
  };
  const hline = (x1: number, x2: number, y: number, w = 0.68) => page.drawLine({ start: { x: x1, y: Y(y) }, end: { x: x2, y: Y(y) }, thickness: w, color: INK });
  const vline = (x: number, y1: number, y2: number, w = 0.59) => page.drawLine({ start: { x, y: Y(y1) }, end: { x, y: Y(y2) }, thickness: w, color: INK });
  /** An entry sitting on a blank line: shrinks to fit the line, and is never allowed to run past it. */
  const entry = (s: string, x1: number, x2: number, lineY: number, o: { size?: number; center?: boolean } = {}) => {
    let t = safe(s).trim(); if (!t) return; const max = x2 - x1 - 4; let size = o.size ?? BODY;
    while (size > 6.5 && font.widthOfTextAtSize(t, size) > max) size -= 0.25;
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
    text(t, o.center ? x1 + (x2 - x1 - font.widthOfTextAtSize(t, size)) / 2 : x1 + 2, lineY - 2.3, font, size, ENTRY);
  };
  const label = (s: string, x: number, lineY: number) => text(s, x, lineY - 1.65, font, BODY);
  const section = (s: string, base: number) => text(s, 57.9, base, bold, 11.5);
  /** One printed row: labels with blank lines after them. `@name` is the applicant's full name; `@sig` and `@sigdate` blanks are filled in by `sign`. */
  const rows = (items: [number, Row[]][]) => {
    for (const [y, cells] of items) for (const [lab, lx, field, x1, x2] of cells) {
      label(lab, lx, y); hline(x1, x2, y);
      if (field && !field.startsWith("@sig")) entry(field === "dob" ? dmy(v(field)) : field === "@name" ? fullName : v(field), x1, x2, y);
    }
  };
  const sign = (role: SignRole, x1: number, x2: number, y: number, dx1: number, dx2: number) => {
    const img = sigImg[role];
    if (img) { const s = Math.min((x2 - x1 - 6) / img.width, 14 / img.height); page.drawImage(img, { x: x1 + 3, y: Y(y) + 1, width: img.width * s, height: img.height * s }); }
    const at = blank ? null : rec?.signatures[role]?.signedAt; if (at) entry(signedOn(at), dx1, dx2, y, { size: 10 });
  };
  const footer = (n: number) => { if (admissionForm.showReference) centered(`${app.ref}   |   page ${n} of 2`, W / 2, 785, font, 7, GREY); };

  // ================================================================== PAGE 1
  page = pdf.addPage([W, H]);
  const lh = admissionForm.letterhead;
  if (logo) {
    page.drawImage(logo, { x: 69.48, y: Y(41.81 + 66.74), width: 61.4, height: 66.74 });
    const cap = admissionForm.logo.caption; if (cap) { fitted(cap[0], 78.4, 59.19, bold, 7.8, 44.3, CAPTION); fitted(cap[1], 83.3, 69.06, bold, 7.8, 34.6, CAPTION); }
  }
  fitted(lh.name, 190.8, 59.34, bold, 20.8, 310.8);
  lh.lines.forEach((ln, i) => centered(ln, 346.2, [78.4, 94.48, 110.55, 126.62][i], font, 12.25));
  fitted(lh.motto, 198.3, 145, timesBI, 14, 215.4);
  fitted(lh.formTitle, 182.3, 168.78, bold, 16.9, 247.7); hline(182.3, 430, 170.5);
  fitted(lh.subtitle, 168.4, 190.34, times, 14.3, 275.5);

  // ---- Section A
  section(admissionForm.A.title, 211.66);
  label("Name:", 57.9, 229.4); hline(88.4, 402.3, 229.4);
  entry(v("surname"), 91, 198, 229.4); entry(v("firstName"), 205, 318, 229.4); entry(v("middleName"), 325, 401, 229.4);
  text("Surname", 123.3, 242.5, ital, 9.36); text("First Name", 260.9, 242.5, ital, 9.36); text("Middle Name", 385.4, 242.5, ital, 9.36);
  rows([
    [261.1, [["Date of Birth:", 57.9, "dob", 118.3, 219.1], ["Place of Birth:", 227.8, "placeOfBirth", 292.2, 416.1]]],
    [276.7, [["Age on Admission:", 57.9, "ageOnAdmission", 144.2, 193.2], ["Sex:", 201.8, "sex", 222.6, 277.3], ["Height:", 285.9, "height", 318.7, 379.2], ["Complexion:", 387.9, "complexion", 445.4, 494.4]]],
    [292.4, [["Home Town:", 57.9, "homeTown", 116.6, 263.5], ["Village:", 272.1, "village", 306.1, 447.2]]],
    [308.1, [["Local Govt.:", 57.9, "localGovt", 113.1, 179.4], ["State of Origin:", 188, "stateOfOrigin", 257.1, 329.1], ["Nationality:", 337.8, "nationality", 389, 449.5]]],
    [323.8, [["Physical Deformation:", 57.9, "physicalDeformation", 158.6, 426.5]]],
    [355.4, [["Residential Address:", 57.9, "residentialAddress", 152.9, 426.5]]],
    [371.1, [["Present Postal Address:", 57.9, "postalAddress", 169, 235.2], ["Contact Numbers:", 243.9, "contactNumbers", 327.3, 376.3], ["Mobile:", 384.9, "mobile", 418.3, 490.4]]],
  ]);
  text("(If yes, specify)", 290.7, 336.9, ital, 9.4);

  // ---- Section B: schools attended
  section(admissionForm.B.title, 408.46);
  const bx = [57.5, 136.6, 307.6, 465.8, 554.8], by = [416.7, 436.5, 453.9, 475.3, 494.4];
  by.forEach((y) => hline(57.2, 555.1, y, 0.59)); bx.forEach((x) => vline(x, by[0], by[4]));
  admissionForm.B.columns.forEach((c, i) => centered(c, (bx[i] + bx[i + 1]) / 2, 429.1, bold, 9));
  admissionForm.B.rows.forEach((r, ri) => r.forEach((fld, ci) => { const t = safe(v(fld.id)); if (!t) return; let size = 10; const max = bx[ci + 1] - bx[ci] - 8; while (size > 6 && font.widthOfTextAtSize(t, size) > max) size -= 0.25; text(t, bx[ci] + 4, (by[ri + 1] + by[ri + 2]) / 2 + 3.3, font, size, ENTRY); }));
  text(admissionForm.B.note, 554.4 - ital.widthOfTextAtSize(admissionForm.B.note, 9.45), 503.5, ital, 9.45);

  // ---- Section C: courses and mode of study
  wrap(`${admissionForm.C.title} ${admissionForm.C.instruction}`, bold, 11.5, 496.5).forEach((ln, i) => section(ln, 536.86 + i * 15.1));
  const cx = [57.9, 85.5, 223.2, 306, 388.8, 471.6, 554.3], cy = [560.1, 582.7, 601.1, 625.7, 646.1, 663.1, 682.9];
  cy.forEach((y) => hline(57.7, 554.6, y, 0.59)); cx.forEach((x) => vline(x, cy[0], cy[6]));
  ["S/N", "COURSES", "FULL TIME", "PART TIME", "WEEKEND", "SPECIAL"].forEach((c, i) => centered(c, (cx[i] + cx[i + 1]) / 2, 573.9, bold, 9));
  admissionForm.C.courses.forEach((c, i) => {
    const mid = (cy[i + 1] + cy[i + 2]) / 2, base = mid + 2.5;
    centered(String(i + 1), (cx[0] + cx[1]) / 2, base, bold, 9);
    const size = Math.min(c.name.length > 20 ? 7.4 : 9, (cx[2] - 90.9 - 6) / bold.widthOfTextAtSize(c.name, 1)); text(c.name, 90.9, base, bold, size);
    const mode = admissionForm.C.modes.findIndex((m) => m === v(c.id)); if (mode >= 0) centered("X", (cx[mode + 2] + cx[mode + 3]) / 2, mid + 4, bold, 12, ENTRY);
  });
  // The school's form has no photograph box. A photograph the applicant uploaded online is placed in the empty space below the table; the printable form stays exactly as the school's.
  if (photo) { const bw = 62, bh = 80, bxp = 554.4 - bw, byp = 700; page.drawRectangle({ x: bxp, y: Y(byp + bh), width: bw, height: bh, borderColor: INK, borderWidth: 0.59 }); const s = Math.min((bw - 4) / photo.width, (bh - 4) / photo.height); page.drawImage(photo, { x: bxp + (bw - photo.width * s) / 2, y: Y(byp + bh) + (bh - photo.height * s) / 2, width: photo.width * s, height: photo.height * s }); }
  footer(1);

  // ================================================================== PAGE 2
  page = pdf.addPage([W, H]);
  // ---- Section D: sponsor
  section(admissionForm.D.title, 39.16); text(admissionForm.D.subtitle, 57.9, 55.8, bold, 9.5);
  text(admissionForm.D.lead, 57.9, 75.6, font, BODY);
  rows([
    [94.4, [[admissionForm.D.leadLine2, 57.9, "@name", 171.3, 324], ["hails from", 326.8, "hailsFrom", 374.6, 455.3]]],
    [111.5, [["Name of Sponsor:", 57.9, "sponsorName", 141.3, 420.8]]],
    [128.7, [["Residential Address:", 57.9, "sponsorResidential", 152.9, 426.5]]],
    [145.8, [["Office Address:", 57.9, "sponsorOffice", 128.7, 246.8], ["Relationship to Applicant:", 255.4, "sponsorRelationship", 372.3, 484.6]]],
    [162.9, [["Phone Numbers:", 57.9, "sponsorPhone", 135.6, 230.6], ["Signature:", 239.3, "@sig", 286.5, 370], ["Date:", 378.7, "@sigdate", 403.4, 463.9]]],
  ]);
  sign("sponsor", 286.5, 370, 162.9, 403.4, 463.9);

  // ---- Section E: recommendation
  section(admissionForm.E.title, 179.16); text(admissionForm.E.subtitle, 57.9, 195.8, bold, 9.5);
  text(admissionForm.E.before, 57.9, 212.6, font, BODY); hline(198.4, 250.2, 214.2); entry(v("knownYears"), 198.4, 250.2, 214.2);
  text(admissionForm.E.after, 253.1, 212.6, font, BODY); text(admissionForm.E.line2, 57.9, 229.7, font, BODY);
  rows([
    [271.7, [["Name:", 57.9, "recName", 88.4, 408.1]]],
    [288.8, [["Profession:", 57.9, "recProfession", 109.7, 296.9], ["Rank:", 305.5, "recRank", 332.6, 427.7]]],
    [306, [["Designation:", 57.9, "recDesignation", 115.4, 250.8], ["Signature:", 259.5, "@sig", 306.7, 396], ["Date:", 404.6, "@sigdate", 429.4, 489.9]]],
  ]);
  sign("recommender", 306.7, 396, 306, 429.4, 489.9);

  // ---- Section F: accommodation
  section(admissionForm.F.title, 322.26); admissionForm.F.lines.forEach((ln, i) => text(ln, 57.9, [339.8, 356.9][i], font, BODY));

  // ---- Section G: applicant's undertaking
  section(admissionForm.G.title, 398.16); text(admissionForm.G.subtitle, 57.9, 415.9, bold, 9.5);
  admissionForm.G.paragraph.forEach((ln, i) => text(ln, 57.9, [456.1, 470.4, 484.7, 499, 513.2, 527.5][i], font, BODY));
  hline(57.9, 170.2, 546.4); entry(fullName, 57.9, 170.2, 546.4);
  admissionForm.G.paragraph2.forEach((ln, i) => text(ln, i === 0 ? 173.1 : 57.9, [544.66, 559, 573.2, 587.5][i], font, BODY));
  rows([
    [606.4, [["Name in full (of the Applicant):", 57.9, "@name", 196.6, 424.2]]],
    [623.5, [["Signature:", 57.9, "@sig", 105.1, 269.3], ["Date:", 277.9, "@sigdate", 302.7, 432.3]]],
    [640.6, [["Witnessed by (Name):", 57.9, "witnessName", 160.3, 434]]],
    [657.7, [["Signature:", 57.9, "@sig", 105.1, 269.3], ["Date:", 277.9, "@sigdate", 302.7, 432.3]]],
  ]);
  sign("applicant", 105.1, 269.3, 623.5, 302.7, 432.3); sign("witness", 105.1, 269.3, 657.7, 302.7, 432.3);

  // ---- For official use only: left empty for the school
  page.drawRectangle({ x: 60.5, y: Y(690.4), width: 491.2, height: 21.5, color: BAR });
  centered(admissionForm.office.title, 306.15, 682.5, bold, 10.46, WHITE);
  [668.9, 690.4, 710.6, 766.1].forEach((y) => hline(60.1, 552.2, y, 0.82)); vline(60.5, 668.9, 766.1, 0.82); vline(551.7, 668.9, 766.1, 0.82); vline(306.1, 690.4, 766.1, 0.82);
  const off = (s: string, x: number, base: number) => text(s, x, base, font, 9.45), ul = (x1: number, x2: number, y: number) => hline(x1, x2, y, 0.5);
  off("Date Received:", 66, 703.1); ul(133, 216.8, 704.4); off("Credentials Checked by:", 311.6, 703.1); ul(416.8, 500.6, 704.4);
  off("Admission Offered:", 66, 723.4); ul(148.6, 242.9, 724.7); off("Date:", 311.6, 723.4); ul(336.7, 493.8, 724.7);
  ul(311.6, 458.2, 749.4); off("Admission Officer", 311.6, 760.5);
  // Staff copy only: what the school typed in the admin for this box.
  const of = withOffice && !blank ? rec?.office : null;
  if (of) {
    entry(of.receivedDate ? dmy(of.receivedDate) : "", 133, 216.8, 704.4); entry(of.checkedBy, 416.8, 500.6, 704.4);
    entry(of.offered, 148.6, 242.9, 724.7); entry(of.offeredDate ? dmy(of.offeredDate) : "", 336.7, 493.8, 724.7);
    entry(of.officerName, 311.6, 458.2, 749.4);
    if (of.stamp) { off("Stamp / remarks:", 66, 745.5); ul(66, 300, 761.5); entry(of.stamp, 66, 300, 761.5); }
  }
  footer(2);
  return pdf.save();
}