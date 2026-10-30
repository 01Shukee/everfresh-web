import { formatNaira } from "../lib/money";
import { flushOutbox, mailerFromEnv, queueMail } from "./email";
import type { Repo } from "./repo";
import { getSettings } from "./site/settings";

const site = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SIGN = "\n\nEverfresh Creations Ltd";
/** Queue + attempt delivery in the background. Never throws: email problems must not break orders, payments or applications. */
function send(repo: Repo, m: { to: string | null | undefined; subject: string; text: string; kind: string }) {
  if (!m.to) return Promise.resolve();
  return queueMail(repo, { to: m.to, subject: m.subject, text: m.text, kind: m.kind }).then(() => { setTimeout(() => { void flushOutbox(repo, mailerFromEnv()).catch(() => {}); }, 0); }).catch(() => {});
}
export async function notifyStaff(repo: Repo, subject: string, text: string) { try { const s = await getSettings(repo); await send(repo, { to: s.business.notifyEmail, subject: `[Everfresh] ${subject}`, text, kind: "staff" }); } catch { /* ignore */ } }

export const orderPaidMail = (o: { orderNumber: string; publicToken: string; customer: { name: string; email: string }; totalKobo: number }) => ({ to: o.customer.email, kind: "order", subject: `Your Everfresh order ${o.orderNumber}`, text: `Hello ${o.customer.name},\n\nWe have received your payment of ${formatNaira(o.totalKobo)} for order ${o.orderNumber}.\nView your order any time: ${site()}/order/${o.orderNumber}/${o.publicToken}\n\nKeep this link private: anyone with it can see your order.${SIGN}` });
export const applicationLinkMail = (a: { ref: string; token: string; details: { fullName: string; email: string } }) => ({ to: a.details.email, kind: "application", subject: `Your Everfresh application ${a.ref}`, text: `Hello ${a.details.fullName},\n\nYour application ${a.ref} has been started. Use this private link to review it, pay the application-form fee and download your documents:\n${site()}/application/${a.ref}/${a.token}\n\nYour application is not complete until the application-form fee is paid. Keep this link private.${SIGN}` });
export const applicationPaidMail = (a: { ref: string; token: string; details: { fullName: string; email: string } }) => ({ to: a.details.email, kind: "application", subject: `Application ${a.ref}: fee received`, text: `Hello ${a.details.fullName},\n\nWe have received and verified the application-form fee for ${a.ref}. Your application is now awaiting review. This is not an offer of admission.\nYour confirmation and receipt: ${site()}/application/${a.ref}/${a.token}\n\nKeep this link private.${SIGN}` });
export const enquiryMail = (e: { ref: string; token: string; name: string; email: string | null }) => ({ to: e.email, kind: "enquiry", subject: `Your catering request ${e.ref}`, text: `Hello ${e.name},\n\nYour catering request ${e.ref} is saved. To send it to us on WhatsApp, open this page and press Send in WhatsApp:\n${site()}/event-catering/enquiry/${e.ref}/${e.token}\n\nThe request reaches us on WhatsApp only after you press Send. Keep this link private.${SIGN}` });
export const mailOrderPaid = (repo: Repo, o: Parameters<typeof orderPaidMail>[0]) => send(repo, orderPaidMail(o)).then(() => notifyStaff(repo, `Order ${o.orderNumber} paid`, `Order ${o.orderNumber} was paid (${formatNaira(o.totalKobo)}). Open the admin to process it: ${site()}/admin`));
export const mailApplicationLink = (repo: Repo, a: Parameters<typeof applicationLinkMail>[0]) => send(repo, applicationLinkMail(a));
export const mailApplicationPaid = (repo: Repo, a: Parameters<typeof applicationPaidMail>[0]) => send(repo, applicationPaidMail(a)).then(() => notifyStaff(repo, `Application ${a.ref}: fee paid`, `Application ${a.ref} has a verified application-form fee payment and is awaiting review: ${site()}/admin`));
export const mailEnquiry = (repo: Repo, e: Parameters<typeof enquiryMail>[0]) => send(repo, enquiryMail(e)).then(() => notifyStaff(repo, `New catering enquiry ${e.ref}`, `A catering enquiry ${e.ref} was saved. It may also arrive on WhatsApp if the customer presses Send. Open the admin: ${site()}/admin`));
export const notifyContact = (repo: Repo, id: string) => notifyStaff(repo, `New contact message ${id}`, `A message ${id} was left on the contact form. Open the admin (Messages): ${site()}/admin`);
export const sendRaw = send;
