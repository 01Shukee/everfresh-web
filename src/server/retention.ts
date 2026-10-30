import type { Application } from "./voc/model";
import type { Repo } from "./repo";
import type { OutboxItem } from "./email";

const DAY = 86_400_000;
export const RETENTION = { abandonedOrderDays: 30, unpaidApplicationDays: 90, sentEmailDays: 30, handledMessageDays: 365, auditDays: 400 };
/** Removes personal data that has no business purpose. Paid orders, paid applications, invoices, receipts and enquiries are financial/business records and are NEVER removed here. */
export async function runRetention(repo: Repo, now = Date.now()) {
  const cut = (d: number) => new Date(now - d * DAY).toISOString(); const out = { abandonedOrders: 0, unpaidApplications: 0, sentEmails: 0, handledMessages: 0, auditEntries: 0 };
  for (const o of await repo.listOrders({ limit: 5000 })) if (o.status === "pending_payment" && !o.paidAt && o.paymentStatus !== "needs_review" && o.createdAt < cut(RETENTION.abandonedOrderDays)) { await repo.deleteOrder(o.id); out.abandonedOrders++; }
  for (const a of await repo.docList<Application>("app")) if (["draft", "awaiting_payment"].includes(a.status) && a.payment.status !== "paid" && a.payment.status !== "needs_review" && a.updatedAt < cut(RETENTION.unpaidApplicationDays)) {
    await repo.docDelete("app", a.ref); await repo.docDelete("idx", `appkey:${a.idempotencyKey}`); await repo.docDelete("idx", `active:${a.details.email}:${a.variantId}`); out.unpaidApplications++; }
  for (const m of await repo.docList<OutboxItem>("outbox")) if (m.status === "sent" && m.createdAt < cut(RETENTION.sentEmailDays)) { await repo.docDelete("outbox", m.id); out.sentEmails++; }
  for (const m of await repo.docList<{ id: string; status: string; createdAt: string; idempotencyKey: string }>("contact")) if (m.status === "handled" && m.createdAt < cut(RETENTION.handledMessageDays)) { await repo.docDelete("contact", m.id); await repo.docDelete("idx", `cmkey:${m.idempotencyKey}`); out.handledMessages++; }
  for (const a of await repo.docList<{ at: string; id?: string }>("audit")) if (a.at < cut(RETENTION.auditDays) && a.id) { await repo.docDelete("audit", a.id); out.auditEntries++; }
  return out;
}
