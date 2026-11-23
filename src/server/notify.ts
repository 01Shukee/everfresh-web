import { site as siteConfig } from "../config/site";
import { formatNaira } from "../lib/money";
import { button, emailShell, esc, heading, kv, money, para, refBadge } from "./emailTemplate";
import { flushOutbox, mailerFromEnv, queueMail } from "./email";
import type { Repo } from "./repo";
import { getSettings } from "./site/settings";

const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SIGN = "\n\nEverfresh Creations Ltd";
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";
const footer = () => [esc(siteConfig.legalName), ...[siteConfig.contact.address, siteConfig.contact.phone, siteConfig.contact.email].filter(Boolean).map((x) => esc(String(x)))];
const privateNote = (what: string) => para(`<span style="font-size:13px;color:#666">Keep this link private: anyone with it can ${what}.</span>`);

/** Wraps a body in the Everfresh email design (the same one as the registration email). Exported so other emails can reuse it. */
export const brandedShell = (a: { preheader: string; title: string; body: string }) => emailShell({ siteUrl: siteUrl(), preheader: a.preheader, title: a.title, body: a.body, footerLines: footer() });

/** Saves the email to the outbox, then tries to deliver it, waiting up to 4 seconds. Waiting matters on serverless hosts (Vercel), which can freeze a function right after it responds and never run a background timer. Never throws: email problems must not break orders, payments or applications; anything undelivered stays in the outbox and is retried. */
async function send(repo: Repo, m: { to: string | null | undefined; subject: string; text: string; kind: string; html?: string }) {
  if (!m.to) return;
  try {
    await queueMail(repo, { to: m.to, subject: m.subject, text: m.text, kind: m.kind, ...(m.html ? { html: m.html } : {}) });
    await Promise.race([flushOutbox(repo, mailerFromEnv()).catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* the outbox keeps it for a retry */ }
}

/** Alerts for the business. Same design, plus an optional button (for example "Open the admin"). */
const staffHtml = (subject: string, text: string, link?: { label: string; url: string }) =>
  brandedShell({ preheader: subject, title: subject, body: text.split(/\n{2,}/).map((p) => para(esc(p).replace(/\n/g, "<br>"))).join("") + (link ? button(link.label, link.url) : "") });
export async function notifyStaff(repo: Repo, subject: string, text: string, link?: { label: string; url: string }) {
  try { const s = await getSettings(repo); await send(repo, { to: s.business.notifyEmail, subject: `[Everfresh] ${subject}`, text, kind: "staff", html: staffHtml(subject, text, link) }); } catch { /* ignore */ }
}
const adminLink = () => ({ label: "Open the admin", url: `${siteUrl()}/admin` });

// ---------------------------------------------------------------- customer emails
type PaidOrder = { orderNumber: string; publicToken: string; customer: { name: string; email: string }; totalKobo: number; subtotalKobo?: number; deliveryFeeKobo?: number; discountKobo?: number };
export const orderPaidMail = (o: PaidOrder) => {
  const url = `${siteUrl()}/order/${o.orderNumber}/${o.publicToken}`;
  const rows: { label: string; amount: string; strong?: boolean; credit?: boolean }[] = typeof o.subtotalKobo === "number"
    ? [{ label: "Subtotal", amount: formatNaira(o.subtotalKobo) }, ...((o.deliveryFeeKobo ?? 0) > 0 ? [{ label: "Delivery", amount: formatNaira(o.deliveryFeeKobo!) }] : []), ...((o.discountKobo ?? 0) > 0 ? [{ label: "Discount", amount: `- ${formatNaira(o.discountKobo!)}`, credit: true }] : []), { label: "Total paid", amount: formatNaira(o.totalKobo), strong: true }]
    : [];
  const body =
    para(`Hello ${esc(first(o.customer.name))},`) + para(`Thank you. We have received your payment of <b>${formatNaira(o.totalKobo)}</b> for order ${esc(o.orderNumber)}.`) + refBadge(o.orderNumber) +
    (rows.length ? heading("Payment summary") + money(rows) : kv([["Amount paid", formatNaira(o.totalKobo)]])) +
    para("You can check the status of your order at any time.") + button("View your order", url) + privateNote("see your order");
  return { to: o.customer.email, kind: "order", subject: `Your Everfresh order ${o.orderNumber}`, text: `Hello ${o.customer.name},\n\nWe have received your payment of ${formatNaira(o.totalKobo)} for order ${o.orderNumber}.\nView your order any time: ${url}\n\nKeep this link private: anyone with it can see your order.${SIGN}`, html: brandedShell({ preheader: `We have received your payment for order ${o.orderNumber}.`, title: "Payment received", body }) };
};

type AppMailInput = { ref: string; token: string; details: { fullName: string; email: string } };
export const applicationLinkMail = (a: AppMailInput) => {
  const url = `${siteUrl()}/application/${a.ref}/${a.token}`;
  const body =
    para(`Hello ${esc(first(a.details.fullName))},`) + para(`Your application <b>${esc(a.ref)}</b> has been started. Use the button below to review it, pay the application-form fee and download your documents.`) + refBadge(a.ref) +
    para("Your application is not complete until the application-form fee is paid.") + button("Open your application", url) + privateNote("view this application");
  return { to: a.details.email, kind: "application", subject: `Your Everfresh application ${a.ref}`, text: `Hello ${a.details.fullName},\n\nYour application ${a.ref} has been started. Use this private link to review it, pay the application-form fee and download your documents:\n${url}\n\nYour application is not complete until the application-form fee is paid. Keep this link private.${SIGN}`, html: brandedShell({ preheader: `Your application ${a.ref} has been started.`, title: "Your application has been started", body }) };
};
export const applicationPaidMail = (a: AppMailInput) => {
  const url = `${siteUrl()}/application/${a.ref}/${a.token}`;
  const body =
    para(`Hello ${esc(first(a.details.fullName))},`) + para(`We have received and verified the application-form fee for <b>${esc(a.ref)}</b>. Your application is now awaiting review. <b>This is not an offer of admission.</b>`) + refBadge(a.ref) +
    button("View your confirmation and receipt", url) + privateNote("view this application");
  return { to: a.details.email, kind: "application", subject: `Application ${a.ref}: fee received`, text: `Hello ${a.details.fullName},\n\nWe have received and verified the application-form fee for ${a.ref}. Your application is now awaiting review. This is not an offer of admission.\nYour confirmation and receipt: ${url}\n\nKeep this link private.${SIGN}`, html: brandedShell({ preheader: `The application-form fee for ${a.ref} is confirmed.`, title: "Application fee received", body }) };
};
export const enquiryMail = (e: { ref: string; token: string; name: string; email: string | null }) => {
  const url = `${siteUrl()}/event-catering/enquiry/${e.ref}/${e.token}`;
  const body =
    para(`Hello ${esc(first(e.name))},`) + para(`Your catering request <b>${esc(e.ref)}</b> is saved. To send it to us on WhatsApp, open it with the button below and press <b>Send in WhatsApp</b>.`) + refBadge(e.ref) +
    button("Open your request", url) + para("The request reaches us on WhatsApp only after you press Send.") + privateNote("view this request");
  return { to: e.email, kind: "enquiry", subject: `Your catering request ${e.ref}`, text: `Hello ${e.name},\n\nYour catering request ${e.ref} is saved. To send it to us on WhatsApp, open this page and press Send in WhatsApp:\n${url}\n\nThe request reaches us on WhatsApp only after you press Send. Keep this link private.${SIGN}`, html: brandedShell({ preheader: `Your catering request ${e.ref} is saved. Press Send in WhatsApp to reach us.`, title: "Your catering request is saved", body }) };
};

/** Sent when Bachs reports that a refund has been paid. Used for food orders, the application-form fee and school-fee invoices. */
export type RefundInput = { kind: "order" | "application"; to: string | null | undefined; name: string; ref: string; what: string; amountKobo: number | null; refundId?: string | null; totalKobo?: number | null; path?: string | null };
export const refundMail = (r: RefundInput) => {
  const amount = r.amountKobo !== null && r.amountKobo > 0 ? formatNaira(r.amountKobo) : null;
  const partial = !!amount && typeof r.totalKobo === "number" && r.totalKobo > 0 && r.amountKobo! < r.totalKobo;
  const url = r.path ? `${siteUrl()}${r.path}` : null;
  const lead = amount ? `We have refunded <b>${amount}</b> for your ${esc(r.what)}, reference <b>${esc(r.ref)}</b>.` : `We have processed a refund for your ${esc(r.what)}, reference <b>${esc(r.ref)}</b>.`;
  const body =
    para(`Hello ${esc(first(r.name))},`) + para(lead) + refBadge(r.ref) +
    kv([["Refund amount", amount], ["Refund reference", r.refundId ?? null], ["Original total", partial ? formatNaira(r.totalKobo!) : null]]) +
    (partial ? para("This was a partial refund. The rest of your payment has not been refunded.") : "") +
    para("How long the money takes to show in your account depends on your bank or card provider. If you have any question about this refund, contact us and quote the reference above.") +
    (url ? button("View details", url) + privateNote("see these details") : "");
  const text = `Hello ${r.name},\n\n${amount ? `We have refunded ${amount}` : "We have processed a refund"} for your ${r.what}, reference ${r.ref}.\n${r.refundId ? `Refund reference: ${r.refundId}\n` : ""}${partial ? "This was a partial refund. The rest of your payment has not been refunded.\n" : ""}\nHow long the money takes to show in your account depends on your bank or card provider. If you have any question about this refund, contact us and quote the reference above.${url ? `\n\nDetails: ${url}\nKeep this link private.` : ""}${SIGN}`;
  return { to: r.to, kind: r.kind, subject: amount ? `Refund of ${amount} for ${r.ref}` : `Refund for ${r.ref}`, text, html: brandedShell({ preheader: amount ? `Your refund of ${amount} for ${r.ref} has been processed.` : `Your refund for ${r.ref} has been processed.`, title: "Your refund has been processed", body }) };
};

export const mailOrderPaid = (repo: Repo, o: Parameters<typeof orderPaidMail>[0]) => send(repo, orderPaidMail(o)).then(() => notifyStaff(repo, `Order ${o.orderNumber} paid`, `Order ${o.orderNumber} was paid (${formatNaira(o.totalKobo)}). Open the admin to process it: ${siteUrl()}/admin`, adminLink()));
export const mailApplicationLink = (repo: Repo, a: Parameters<typeof applicationLinkMail>[0]) => send(repo, applicationLinkMail(a));
export const mailApplicationPaid = (repo: Repo, a: Parameters<typeof applicationPaidMail>[0]) => send(repo, applicationPaidMail(a)).then(() => notifyStaff(repo, `Application ${a.ref}: fee paid`, `Application ${a.ref} has a verified application-form fee payment and is awaiting review: ${siteUrl()}/admin`, adminLink()));
export const mailEnquiry = (repo: Repo, e: Parameters<typeof enquiryMail>[0]) => send(repo, enquiryMail(e)).then(() => notifyStaff(repo, `New catering enquiry ${e.ref}`, `A catering enquiry ${e.ref} was saved. It may also arrive on WhatsApp if the customer presses Send. Open the admin: ${siteUrl()}/admin`, adminLink()));
export const mailRefund = (repo: Repo, r: RefundInput) => send(repo, refundMail(r)).then(() => notifyStaff(repo, `Refund processed: ${r.ref}`, `Refund${r.amountKobo ? ` of ${formatNaira(r.amountKobo)}` : ""} processed for ${r.what} ${r.ref}. The customer has been emailed. Open the admin: ${siteUrl()}/admin`, adminLink()));
export const notifyContact = (repo: Repo, id: string) => notifyStaff(repo, `New contact message ${id}`, `A message ${id} was left on the contact form. Open the admin (Messages): ${siteUrl()}/admin`, adminLink());
/** A payment arrived that could not be confirmed automatically (wrong amount or currency, odd status): tell the customer it is being checked, and alert staff with the reason. */
export type ReviewInput = { to: string | null | undefined; name: string; ref: string; what: string; detail: string; path?: string | null };
export const reviewMail = (r: ReviewInput) => {
  const url = r.path ? `${siteUrl()}${r.path}` : null;
  const body = para(`Hello ${esc(first(r.name))},`) + para(`We received a payment for your ${esc(r.what)} (<b>${esc(r.ref)}</b>), but we need to check it before we can confirm it. <b>You do not need to pay again.</b>`) + refBadge(r.ref) + para("If you were charged and this has not been sorted out within a day, contact us and quote the reference above.") + (url ? button("View details", url) : "");
  return { to: r.to, kind: r.what === "order" ? "order" : "application", subject: `We are checking your payment: ${r.ref}`, text: `Hello ${r.name},\n\nWe received a payment for your ${r.what} (${r.ref}), but we need to check it before we can confirm it. You do not need to pay again.\n\nIf you were charged and this has not been sorted out within a day, contact us and quote the reference above.${url ? `\n\nDetails: ${url}` : ""}${SIGN}`, html: brandedShell({ preheader: `We are checking your payment for ${r.ref}.`, title: "We are checking your payment", body }) };
};
export const mailPaymentReview = (repo: Repo, r: ReviewInput) => send(repo, reviewMail(r)).then(() => notifyStaff(repo, `Payment needs checking: ${r.ref}`, `${r.what} ${r.ref} has a payment that could not be confirmed automatically.\n\n${r.detail}\n\nCheck it in the Bachs dashboard. If the money arrived, confirm it in the admin.`, adminLink()));
export const sendRaw = send;