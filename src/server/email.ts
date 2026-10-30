import { randomBytes } from "node:crypto";
import type { Repo } from "./repo";

export interface Mail { to: string; subject: string; text: string; kind: string }
export interface Mailer { send(m: { to: string; subject: string; text: string }): Promise<void> }
export interface OutboxItem extends Mail { id: string; status: "queued" | "sent" | "failed" | "not_configured"; attempts: number; error: string | null; createdAt: string; sentAt: string | null }

/** Resend (https://resend.com). Needs EMAIL_API_KEY and EMAIL_FROM on a verified sending domain. */
export class ResendMailer implements Mailer {
  constructor(private o: { apiKey: string; from: string; fetchImpl?: typeof fetch }) {}
  async send(m: { to: string; subject: string; text: string }) {
    const r = await (this.o.fetchImpl ?? fetch)("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.o.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: this.o.from, to: [m.to], subject: m.subject, text: m.text }) });
    if (!r.ok) throw new Error(`Resend responded ${r.status}`);
  }
}
/** Postmark (https://postmarkapp.com). Needs EMAIL_API_KEY (server token) and EMAIL_FROM (a verified sender). */
export class PostmarkMailer implements Mailer {
  constructor(private o: { apiKey: string; from: string; fetchImpl?: typeof fetch }) {}
  async send(m: { to: string; subject: string; text: string }) {
    const r = await (this.o.fetchImpl ?? fetch)("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": this.o.apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ From: this.o.from, To: m.to, Subject: m.subject, TextBody: m.text, MessageStream: "outbound" }) });
    if (!r.ok) throw new Error(`Postmark responded ${r.status}`);
  }
}
export function mailerFromEnv(e: Record<string, string | undefined> = process.env): Mailer | null {
  const apiKey = e.EMAIL_API_KEY, from = e.EMAIL_FROM; if (!apiKey || !from) return null;
  return e.EMAIL_PROVIDER === "postmark" ? new PostmarkMailer({ apiKey, from }) : e.EMAIL_PROVIDER === "resend" ? new ResendMailer({ apiKey, from }) : null;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120 && !/[\r\n]/.test(s);
/** Writes the email to the persistent outbox. Nothing is lost if the provider is down or not yet configured. */
export async function queueMail(repo: Repo, m: Mail): Promise<void> {
  if (!isEmail(m.to)) return; const at = new Date().toISOString(); const id = `${at}-${randomBytes(3).toString("hex")}`;
  await repo.docPut("outbox", id, { ...m, subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 150), id, status: "queued", attempts: 0, error: null, createdAt: at, sentAt: null } satisfies OutboxItem);
}
/** Tries to deliver queued/failed mail. Without a configured provider items stay marked not_configured (never reported as sent). */
export async function flushOutbox(repo: Repo, mailer: Mailer | null, max = 20): Promise<{ sent: number; failed: number; notConfigured: number }> {
  const items = (await repo.docList<OutboxItem>("outbox")).filter((x) => x.status !== "sent" && x.attempts < 8).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, max); const r = { sent: 0, failed: 0, notConfigured: 0 };
  for (const it of items) {
    if (!mailer) { if (it.status !== "not_configured") { it.status = "not_configured"; await repo.docPut("outbox", it.id, it); } r.notConfigured++; continue; }
    it.attempts++; try { await mailer.send({ to: it.to, subject: it.subject, text: it.text }); it.status = "sent"; it.sentAt = new Date().toISOString(); it.error = null; r.sent++; if (it.kind === "reset" || it.kind === "recovery") it.text = "[removed after sending]"; }
    catch (e) { it.status = "failed"; it.error = (e as Error).message.slice(0, 200); r.failed++; }
    await repo.docPut("outbox", it.id, it);
  }
  return r;
}
/** Admin view: never includes the message body (it may contain private links or reset tokens). */
export async function listOutbox(repo: Repo) { return (await repo.docList<OutboxItem>("outbox")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(({ text, ...x }) => x); }
