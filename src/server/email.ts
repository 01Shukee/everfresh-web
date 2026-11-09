
import { randomBytes } from "node:crypto";
import { createTransport } from "nodemailer";
import type { Repo } from "./repo";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  kind: string;
  html?: string;
}

export interface Mailer {
  send(m: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void>;
}

export interface OutboxItem extends Mail {
  id: string;
  status: "queued" | "sent" | "failed" | "not_configured";
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** Gmail SMTP using a Google App Password. */
export class GmailMailer implements Mailer {
  private transporter;

  constructor(private o: { user: string; password: string; from: string }) {
    this.transporter = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: o.user,
        pass: o.password.replace(/\s/g, ""),
      },
    });
  }

  async send(m: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) {
    await this.transporter.sendMail({
      from: this.o.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
    });
  }
}

/** Resend. Requires a verified sending domain. */
export class ResendMailer implements Mailer {
  constructor(private o: {
    apiKey: string;
    from: string;
    fetchImpl?: typeof fetch;
  }) {}

  async send(m: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) {
    const r = await (this.o.fetchImpl ?? fetch)(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.o.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.o.from,
          to: [m.to],
          subject: m.subject,
          text: m.text,
          ...(m.html ? { html: m.html } : {}),
        }),
      },
    );

    if (!r.ok) throw new Error(`Resend responded ${r.status}`);
  }
}

/** Postmark. Requires a verified sender. */
export class PostmarkMailer implements Mailer {
  constructor(private o: {
    apiKey: string;
    from: string;
    fetchImpl?: typeof fetch;
  }) {}

  async send(m: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) {
    const r = await (this.o.fetchImpl ?? fetch)(
      "https://api.postmarkapp.com/email",
      {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": this.o.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          From: this.o.from,
          To: m.to,
          Subject: m.subject,
          TextBody: m.text,
          ...(m.html ? { HtmlBody: m.html } : {}),
          MessageStream: "outbound",
        }),
      },
    );

    if (!r.ok) throw new Error(`Postmark responded ${r.status}`);
  }
}

export function mailerFromEnv(
  e: Record<string, string | undefined> = process.env,
): Mailer | null {
  if (e.EMAIL_PROVIDER === "gmail") {
    const user = e.EMAIL_USER;
    const password = e.EMAIL_APP_PASSWORD;

    if (!user || !password) return null;

    return new GmailMailer({
      user,
      password,
      from: e.EMAIL_FROM || `Everfresh <${user}>`,
    });
  }

  const apiKey = e.EMAIL_API_KEY;
  const from = e.EMAIL_FROM;

  if (!apiKey || !from) return null;

  if (e.EMAIL_PROVIDER === "postmark") {
    return new PostmarkMailer({ apiKey, from });
  }

  if (e.EMAIL_PROVIDER === "resend") {
    return new ResendMailer({ apiKey, from });
  }

  return null;
}

const isEmail = (s: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) &&
  s.length <= 120 &&
  !/[\r\n]/.test(s);

/** Writes the email to the persistent outbox. */
export async function queueMail(
  repo: Repo,
  m: Mail,
): Promise<void> {
  if (!isEmail(m.to)) return;

  const at = new Date().toISOString();
  const id = `${at}-${randomBytes(3).toString("hex")}`;

  await repo.docPut("outbox", id, {
    ...m,
    subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 150),
    id,
    status: "queued",
    attempts: 0,
    error: null,
    createdAt: at,
    sentAt: null,
  } satisfies OutboxItem);
}

/** Tries to deliver queued/failed mail. */
export async function flushOutbox(
  repo: Repo,
  mailer: Mailer | null,
  max = 20,
): Promise<{ sent: number; failed: number; notConfigured: number }> {
  const items = (await repo.docList<OutboxItem>("outbox"))
    .filter((x) => x.status !== "sent" && x.attempts < 8)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, max);

  const r = { sent: 0, failed: 0, notConfigured: 0 };

  for (const it of items) {
    if (!mailer) {
      if (it.status !== "not_configured") {
        it.status = "not_configured";
        await repo.docPut("outbox", it.id, it);
      }
      r.notConfigured++;
      continue;
    }

    it.attempts++;

    try {
      await mailer.send({
        to: it.to,
        subject: it.subject,
        text: it.text,
        ...(it.html ? { html: it.html } : {}),
      });

      it.status = "sent";
      it.sentAt = new Date().toISOString();
      it.error = null;
      r.sent++;

      if (it.kind === "reset" || it.kind === "recovery") {
        it.text = "[removed after sending]";
        delete it.html;
      }
    } catch (e) {
      it.status = "failed";
      it.error = (e as Error).message.slice(0, 200);
      r.failed++;
    }

    await repo.docPut("outbox", it.id, it);
  }

  return r;
}

/** Admin view: never includes the message body. */
export async function listOutbox(repo: Repo) {
  return (await repo.docList<OutboxItem>("outbox"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(({ text, html, ...x }) => x);
}
