import { rateLimit } from "./ratelimit";
import type { Repo } from "./repo";
import { sendRaw } from "./notify";
import type { Application } from "./voc/model";
import type { Enquiry } from "./catering/model";

const site = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** "Find my order/application/enquiry": always answers the same way (never reveals whether an email has records), and emails the private links only to the address on the records. Phone-only records cannot be recovered without SMS. */
export async function recoverRecords(repo: Repo, rawEmail: unknown, now = Date.now()): Promise<{ status: number; body: { ok: boolean; message: string } }> {
  const generic = { status: 200, body: { ok: true, message: "If we hold records for that email address, we have sent the links to it. Check your inbox and spam folder." } };
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : ""; if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return { status: 422, body: { ok: false, message: "Enter the email address you used." } };
  if (!rateLimit(`recover:${email}`, 3, 3600_000, now)) return generic; // silently stop email-bombing a mailbox
  const cutoff = new Date(now - 365 * 86400_000).toISOString(); const lines: string[] = [];
  for (const o of (await repo.listOrders({ limit: 1000 })).filter((x) => x.customer.email === email && x.createdAt > cutoff).slice(0, 10)) lines.push(`Order ${o.orderNumber}: ${site()}/order/${o.orderNumber}/${o.publicToken}`);
  for (const a of (await repo.docList<Application>("app")).filter((x) => x.details.email === email && x.status !== "withdrawn" && x.createdAt > cutoff).slice(0, 10)) lines.push(`Application ${a.ref}: ${site()}/application/${a.ref}/${a.token}`);
  for (const e of (await repo.docList<Enquiry>("enquiry")).filter((x) => x.email === email && x.createdAt > cutoff).slice(0, 10)) lines.push(`Catering request ${e.ref}: ${site()}/event-catering/enquiry/${e.ref}/${e.token}`);
  if (lines.length) await sendRaw(repo, { to: email, kind: "recovery", subject: "Your Everfresh links", text: `Hello,\n\nYou asked for the links to your Everfresh records:\n\n${lines.join("\n")}\n\nKeep these links private: anyone with a link can see that record. If you did not ask for this, you can ignore this email.\n\nEverfresh Creations Ltd` });
  return generic;
}
