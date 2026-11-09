import { variantById, vocConfig } from "../../config/vocational";
import { formatNaira } from "../../lib/money";
import { BRAND, button, checklist, emailShell, esc, heading, kv, money, para, refBadge, steps } from "../emailTemplate";
import { sendRaw } from "../notify";
import type { Repo } from "../repo";
import type { Institute } from "./institute";
import { type Application, type Invoice, type VariantContent, invoiceTotals } from "./model";
import { buildInvoiceLines, netOf, phaseOf } from "./pricing";

const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const link = (a: Pick<Application, "ref" | "token">) => `${siteUrl()}/application/${a.ref}/${a.token}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);
const choiceLabel = (a: Application) => (a.courses?.length ? a.courses.join(", ") : a.course);
const accLabel = (a: Application) => (a.accommodation === "hostel" ? "Hostel student" : a.accommodation === "day" ? "Day student" : null);
const contactBlock = (i: Institute) => [i.address ? `${esc(i.name)}, ${esc(i.address)}` : esc(i.name), ...(i.phones.length ? [`Admissions: ${i.phones.map(esc).join(" &middot; ")}`] : []), ...(i.note ? [esc(i.note)] : [])];
const contactText = (i: Institute) => [i.address ? `${i.name}, ${i.address}` : i.name, i.phones.length ? `Admissions: ${i.phones.join(", ")}` : "", i.note ?? ""].filter(Boolean).join("\n");

/** What the student will pay in the first year, from the programme's own fee lines. */
export function feePreview(c: VariantContent, a: Application) {
  const lines = buildInvoiceLines(c, a); const charges = lines.filter((l) => l.kind !== "discount"); const credit = lines.filter((l) => l.kind === "discount").reduce((s, l) => s + l.amountKobo, 0);
  const total = charges.reduce((s, l) => s + l.amountKobo, 0);
  const later = c.fees.filter((f) => f.amountKobo && (f.appliesTo === undefined || f.appliesTo === "all" || f.appliesTo === a.accommodation));
  const yearly = later.filter((f) => phaseOf(f) === "yearly").reduce((s, f) => s + (f.amountKobo ?? 0), 0); const grad = later.filter((f) => phaseOf(f) === "graduation");
  return { charges, credit, total, balance: Math.max(total - credit, 0), yearly, grad };
}

export function registrationMail(a: Application, c: VariantContent, inst: Institute) {
  const v = variantById(a.variantId)!; const d = a.details; const p = feePreview(c, a); const url = link(a); const fee = formatNaira(a.feeKobo);
  const req = [...c.requirements, ...(a.accommodation === "hostel" && c.accommodation.note ? [`For hostel students: ${c.accommodation.note}`] : [])];
  const credited = vocConfig.applicationFee.creditedToTuition;
  const body =
    para(`Hello ${esc(first(d.fullName))},`) + para(`Thank you for registering with the ${esc(inst.name)}. <b>We have received your registration and saved it.</b> It is not complete until the application-form fee is paid. Your details are below for your records.`) + refBadge(a.ref) +
    heading("Your programme") + kv([["Programme", `${v.label}, ${v.durationLabel}`], ["Course", choiceLabel(a) ?? null], ["Student type", accLabel(a)]]) +
    heading("Details you submitted") + kv([["Full name", d.fullName], ["Phone", d.phone], ["Email", d.email], ["Date of birth", dateOf(d.dob)], ["Address", d.address], ["Education", d.education], ["Emergency contact", d.emergencyName ? `${d.emergencyName} (${d.emergencyPhone})` : null], ["Additional information", d.additional]]) +
    (p.charges.length ? heading("Your fees") + money([...p.charges.map((l) => ({ label: l.label, amount: formatNaira(l.amountKobo) })), { label: "Total fees", amount: formatNaira(p.total), strong: true }, ...(p.credit ? [{ label: "Less: application-form fee (paid first)", amount: `- ${formatNaira(p.credit)}`, credit: true }, { label: "School fees after the application-form fee", amount: formatNaira(p.balance), strong: true }] : [])]) +
      (p.yearly || p.grad.length ? para(`<span style="font-size:14px;color:#555">${[p.yearly ? `Later years are charged at ${formatNaira(p.yearly)} a year.` : "", ...p.grad.map((g) => `${esc(g.label)}: ${formatNaira(g.amountKobo ?? 0)}${g.note ? ` (${esc(g.note)})` : ""}.`)].filter(Boolean).join(" ")}</span>`) : "") : "") +
    heading("What happens next") + steps([`<b>Pay the ${fee} application-form fee</b> to complete your registration. It is non-refundable${credited ? ", and once you are accepted it is deducted from your school fees" : ""}. The programme curriculum appears on your application page once you have paid.`, "<b>Wait for our acceptance email.</b> School fees can be paid only after your application has been accepted. Your programme invoice then appears on your application page.", ...(req.length ? ["<b>Bring your documents</b> (listed below) to the admission desk, both originals and photocopies."] : [])]) +
    button(`Review and pay ${fee}`, url) +
    (req.length ? heading("Documents and items to bring") + checklist(req) : "") +
    para(`<span style="font-size:13px;color:#666">Keep the button's link private: anyone with it can view this application. If you did not register, please ignore this email.</span>`);
  const text = [`Hello ${first(d.fullName)},`, "", `We have received your registration with the ${inst.name} and saved it. It is not complete until the application-form fee is paid. Reference: ${a.ref}`, "", `Programme: ${v.label}, ${v.durationLabel}`, choiceLabel(a) ? `Course: ${choiceLabel(a)}` : "", accLabel(a) ? `Student type: ${accLabel(a)}` : "", "",
    "Details you submitted:", `Name: ${d.fullName}`, `Phone: ${d.phone}`, `Email: ${d.email}`, d.dob ? `Date of birth: ${dateOf(d.dob)}` : "", `Address: ${d.address}`, d.education ? `Education: ${d.education}` : "", d.emergencyName ? `Emergency contact: ${d.emergencyName} (${d.emergencyPhone})` : "", d.additional ? `Additional: ${d.additional}` : "", "",
    ...(p.charges.length ? ["Your fees:", ...p.charges.map((l) => `  ${l.label}: ${formatNaira(l.amountKobo)}`), `  Total: ${formatNaira(p.total)}`, ...(p.credit ? [`  Less application-form fee: -${formatNaira(p.credit)}`, `  School fees after the application-form fee: ${formatNaira(p.balance)}`] : []), ""] : []),
    "Next steps:", `1. Pay the ${fee} application-form fee to complete your registration: ${url}`, "2. Wait for our acceptance email. School fees can be paid only after you are accepted.", ...(req.length ? ["3. Bring these to the admission desk (originals and photocopies):", ...req.map((r) => `   - ${r}`)] : []), "", "Keep the link private: anyone with it can view this application.", "", contactText(inst), "", "Everfresh Creations Ltd"].filter((x, i, arr) => x !== "" || arr[i - 1] !== "").join("\n");
  return { to: d.email, kind: "application", subject: `Registration received: ${a.ref}`, text, html: emailShell({ siteUrl: siteUrl(), preheader: `We have received your registration ${a.ref}. Next step: pay the ${fee} application-form fee.`, title: "We have received your registration", body, footerLines: contactBlock(inst) }) };
}

export function feeReceivedMail(a: Application, c: VariantContent, inst: Institute, inv: Invoice | null) {
  const v = variantById(a.variantId)!; const url = link(a); const t = inv ? invoiceTotals(inv) : null; const credit = inv ? inv.lines.filter((l) => l.kind === "discount").reduce((s, l) => s + l.amountKobo, 0) : 0;
  const body =
    para(`Hello ${esc(first(a.details.fullName))},`) + para(`We have received and verified your <b>${formatNaira(a.feeKobo)} application-form fee</b> for the ${esc(v.label)} (${esc(v.durationLabel)}). Your registration is complete and now awaits review.`) + refBadge(a.ref) +
    kv([["Receipt number", a.payment.receiptNumber], ["Amount paid", formatNaira(a.feeKobo)], ["Paid on", dateOf(a.payment.paidAt)]]) +
    (inv && t ? heading(`Your programme invoice ${inv.number}`) + money([...inv.lines.filter((l) => l.kind !== "discount").map((l) => ({ label: l.label, amount: formatNaira(l.amountKobo) })), ...(credit ? [{ label: "Less: application-form fee already paid", amount: `- ${formatNaira(credit)}`, credit: true }] : []), { label: "Amount due", amount: formatNaira(t.outstandingKobo), strong: true }]) + button("View invoice and pay", url) : button("View your application", url)) +
    para(`<b>Please note:</b> this payment is not an offer of admission. Wait for an email from us confirming your acceptance. Your school fees can be paid only after you are accepted. You can now view the programme curriculum on your application page.`) +
    (c.requirements.length ? heading("Remember to bring") + checklist([...c.requirements, ...(a.accommodation === "hostel" && c.accommodation.note ? [`For hostel students: ${c.accommodation.note}`] : [])]) : "");
  const text = [`Hello ${first(a.details.fullName)},`, "", `We have received and verified your ${formatNaira(a.feeKobo)} application-form fee for ${a.ref} (${v.label}, ${v.durationLabel}). Your registration is complete and awaits review.`, a.payment.receiptNumber ? `Receipt: ${a.payment.receiptNumber}` : "", "",
    ...(inv && t ? [`Programme invoice ${inv.number}:`, ...inv.lines.filter((l) => l.kind !== "discount").map((l) => `  ${l.label}: ${formatNaira(l.amountKobo)}`), ...(credit ? [`  Less application-form fee: -${formatNaira(credit)}`] : []), `  Amount due: ${formatNaira(t.outstandingKobo)}`, ""] : []),
    `View your application${inv ? " and pay" : ""}: ${url}`, "", "This is not an offer of admission. Wait for our acceptance email: school fees can be paid only after you are accepted. You can now view the curriculum on your application page.", "", contactText(inst), "", "Everfresh Creations Ltd"].join("\n");
  return { to: a.details.email, kind: "application", subject: `Application ${a.ref}: fee received`, text, html: emailShell({ siteUrl: siteUrl(), preheader: `Your ${formatNaira(a.feeKobo)} application-form fee for ${a.ref} is confirmed.`, title: "Application fee received", body, footerLines: contactBlock(inst) }) };
}

/** Sent when staff accept the applicant: this is what unlocks school-fee payment. */
export function admittedMail(a: Application, c: VariantContent, inst: Institute, inv: Invoice | null) {
  const v = variantById(a.variantId)!; const url = link(a); const t = inv ? invoiceTotals(inv) : null; const credit = inv ? inv.lines.filter((l) => l.kind === "discount").reduce((s, l) => s + l.amountKobo, 0) : 0;
  const body =
    para(`Hello ${esc(first(a.details.fullName))},`) + para(`<b>Congratulations, your application has been accepted</b> for the ${esc(v.label)} (${esc(v.durationLabel)}).`) + refBadge(a.ref) +
    (inv && t ? heading(`Your programme invoice ${inv.number}`) + money([...inv.lines.filter((l) => l.kind !== "discount").map((l) => ({ label: l.label, amount: formatNaira(l.amountKobo) })), ...(credit ? [{ label: "Less: application-form fee already paid", amount: `- ${formatNaira(credit)}`, credit: true }] : []), { label: "School fees due", amount: formatNaira(t.outstandingKobo), strong: true }]) + button("View invoice and pay school fees", url) : button("View your application", url)) +
    para("Pay your school fees from your application page to secure your place.") +
    (c.requirements.length ? heading("Remember to bring") + checklist([...c.requirements, ...(a.accommodation === "hostel" && c.accommodation.note ? [`For hostel students: ${c.accommodation.note}`] : [])]) : "");
  const text = [`Hello ${first(a.details.fullName)},`, "", `Congratulations, your application ${a.ref} (${v.label}, ${v.durationLabel}) has been accepted.`, "",
    ...(inv && t ? [`Programme invoice ${inv.number}:`, ...inv.lines.filter((l) => l.kind !== "discount").map((l) => `  ${l.label}: ${formatNaira(l.amountKobo)}`), ...(credit ? [`  Less application-form fee: -${formatNaira(credit)}`] : []), `  School fees due: ${formatNaira(t.outstandingKobo)}`, ""] : []),
    `View your application${inv ? " and pay your school fees" : ""}: ${url}`, "", contactText(inst), "", "Everfresh Creations Ltd"].join("\n");
  return { to: a.details.email, kind: "application", subject: `Application ${a.ref}: you have been accepted`, text, html: emailShell({ siteUrl: siteUrl(), preheader: `Your application ${a.ref} has been accepted. You can now pay your school fees.`, title: "You have been accepted", body, footerLines: contactBlock(inst) }) };
}

/** All are fire-and-forget safe: the registration or payment is already saved, and sendRaw never throws. */
export const mailRegistration = (repo: Repo, a: Application, c: VariantContent, i: Institute) => sendRaw(repo, registrationMail(a, c, i));
export const mailFeeReceived = (repo: Repo, a: Application, c: VariantContent, i: Institute, inv: Invoice | null) => sendRaw(repo, feeReceivedMail(a, c, i, inv));
export const mailAdmitted = (repo: Repo, a: Application, c: VariantContent, i: Institute, inv: Invoice | null) => sendRaw(repo, admittedMail(a, c, i, inv));
export { BRAND, netOf };