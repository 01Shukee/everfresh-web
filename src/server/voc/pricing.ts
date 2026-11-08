import { vocConfig } from "../../config/vocational";
import type { Accommodation, Application, InvoiceLine, VariantContent } from "./model";

/** Everything about what a programme costs lives here, so the website, the invoice, the email and the PDFs can never disagree. All pure functions. */
export type Fee = VariantContent["fees"][number];
export type Course = VariantContent["courses"][number];
export const phaseOf = (f: Fee) => f.phase ?? "intake";
export const choiceCourses = (c: VariantContent): Course[] => c.courses.filter((x) => x.role === "choice");
export const choiceCount = (c: VariantContent) => (choiceCourses(c).length ? Math.max(0, Math.min(c.choose ?? 0, choiceCourses(c).length)) : 0);
/** Hostel/day is asked only when the programme says accommodation is available. */
export const asksAccommodation = (c: VariantContent) => c.accommodation.available === true && c.fees.some((f) => f.appliesTo === "hostel" || f.appliesTo === "day");
const applies = (f: Fee, acc: Accommodation | null) => !f.appliesTo || f.appliesTo === "all" || f.appliesTo === acc;

/** Lines of the programme invoice raised when the application fee is verified: first-year charges for the chosen accommodation, the chosen priced courses, then a credit for the fee already paid. */
export function buildInvoiceLines(c: VariantContent, app: Pick<Application, "courses" | "course" | "accommodation" | "feeKobo">, receipt?: string | null): InvoiceLine[] {
  const acc = app.accommodation ?? null; const lines: InvoiceLine[] = []; let n = 0; const id = () => `auto-${++n}`;
  for (const f of c.fees) if (phaseOf(f) === "intake" && applies(f, acc) && f.amountKobo !== null && f.amountKobo > 0) lines.push({ id: id(), kind: f.kind, label: f.label, amountKobo: f.amountKobo });
  const picked = app.courses?.length ? app.courses : app.course ? [app.course] : [];
  for (const name of picked) { const x = choiceCourses(c).find((k) => k.name === name); if (x && typeof x.priceKobo === "number" && x.priceKobo > 0) lines.push({ id: id(), kind: "tuition", label: `Course: ${x.name}`, amountKobo: x.priceKobo }); }
  const charges = lines.reduce((s, l) => s + l.amountKobo, 0);
  if (vocConfig.applicationFee.creditedToTuition && charges > 0) lines.push({ id: id(), kind: "discount", label: `Application-form fee already paid${receipt ? ` (receipt ${receipt})` : ""}`, amountKobo: Math.min(app.feeKobo, charges) });
  return lines;
}
export const netOf = (lines: InvoiceLine[]) => lines.reduce((s, l) => s + (l.kind === "discount" ? -l.amountKobo : l.amountKobo), 0);

/** Totals for display: first-year total for a given accommodation choice, before the application fee is credited. */
export function intakeTotal(c: VariantContent, acc: Accommodation | null, picked: string[] = []): number {
  const fees = c.fees.filter((f) => phaseOf(f) === "intake" && applies(f, acc) && f.amountKobo).reduce((s, f) => s + (f.amountKobo ?? 0), 0);
  const courses = picked.reduce((s, name) => s + (choiceCourses(c).find((x) => x.name === name)?.priceKobo ?? 0), 0);
  return fees + courses;
}
/** Headline price on cards. Hostel/day programmes: the cheapest first-year total (so a day student's price is not hidden behind a hostel price). Others: the package tuition, or the cheapest priced course when the price depends on the course chosen. */
export function startingPrice(c: VariantContent): { kobo: number; from: boolean } | null {
  const asks = asksAccommodation(c);
  const base = asks ? Math.min(intakeTotal(c, "day"), intakeTotal(c, "hostel")) : c.fees.filter((f) => phaseOf(f) === "intake" && f.kind === "tuition").reduce((t, f) => t + (f.amountKobo ?? 0), 0);
  const priced = choiceCourses(c).map((x) => x.priceKobo).filter((p): p is number => typeof p === "number" && p > 0);
  const extra = choiceCount(c) > 0 && priced.length ? Math.min(...priced) : 0; const total = base + extra; if (total <= 0) return null;
  return { kobo: total, from: asks || (priced.length > 1 && new Set(priced).size > 1) };
}
/** Checks the applicant's choices against the programme. Returns clean values or a message per field. */
export function checkChoices(c: VariantContent, raw: { accommodation?: unknown; courses?: unknown; course?: unknown }): { ok: true; accommodation: Accommodation | null; courses: string[]; course: string | null } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}; let accommodation: Accommodation | null = null;
  if (asksAccommodation(c)) { if (raw.accommodation === "hostel" || raw.accommodation === "day") accommodation = raw.accommodation; else errors.accommodation = "Choose hostel or day student."; }
  const need = choiceCount(c); const list = Array.isArray(raw.courses) ? raw.courses.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : typeof raw.course === "string" && raw.course.trim() ? [raw.course.trim()] : [];
  let courses: string[] = [];
  if (need > 0) {
    const valid = new Set(choiceCourses(c).map((x) => x.name)); courses = [...new Set(list)];
    if (courses.length !== need || courses.some((x) => !valid.has(x))) errors.courses = need === 1 ? "Choose one course from the list." : `Choose exactly ${need} different courses from the list.`;
  } else if (list[0]) { if (!c.courses.some((x) => x.name === list[0])) errors.courses = "That course is not offered on this programme."; else courses = [list[0]]; }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, accommodation, courses, course: courses[0] ?? null };
}
