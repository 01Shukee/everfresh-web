
import { rateLimit } from "./ratelimit";
import type { Repo } from "./repo";
import { sendRaw } from "./notify";
import type { Application } from "./voc/model";
import type { Enquiry } from "./catering/model";
import {
  button,
  emailShell,
  esc,
  heading,
  para,
  refBadge,
} from "./emailTemplate";

const site = () =>
  (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** "Find my order/application/enquiry": always answers the same way (never reveals whether an email has records), and emails the private links only to the address on the records. Phone-only records cannot be recovered without SMS. */
export async function recoverRecords(
  repo: Repo,
  rawEmail: unknown,
  now = Date.now(),
): Promise<{
  status: number;
  body: { ok: boolean; message: string };
}> {
  const generic = {
    status: 200,
    body: {
      ok: true,
      message:
        "If we hold records for that email address, we have sent the links to it. Check your inbox and spam folder.",
    },
  };

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    email.length > 120
  ) {
    return {
      status: 422,
      body: {
        ok: false,
        message: "Enter the email address you used.",
      },
    };
  }

  if (!rateLimit(`recover:${email}`, 3, 3600_000, now)) {
    return generic;
  }

  const cutoff = new Date(now - 365 * 86400_000).toISOString();

  const records: { label: string; url: string }[] = [];

  for (
    const o of (await repo.listOrders({ limit: 1000 }))
      .filter(
        (x) => x.customer.email === email && x.createdAt > cutoff,
      )
      .slice(0, 10)
  ) {
    records.push({
      label: `Order ${o.orderNumber}`,
      url: `${site()}/order/${o.orderNumber}/${o.publicToken}`,
    });
  }

  for (
    const a of (await repo.docList<Application>("app"))
      .filter(
        (x) =>
          x.details.email === email &&
          x.status !== "withdrawn" &&
          x.createdAt > cutoff,
      )
      .slice(0, 10)
  ) {
    records.push({
      label: `Application ${a.ref}`,
      url: `${site()}/application/${a.ref}/${a.token}`,
    });
  }

  for (
    const e of (await repo.docList<Enquiry>("enquiry"))
      .filter(
        (x) => x.email === email && x.createdAt > cutoff,
      )
      .slice(0, 10)
  ) {
    records.push({
      label: `Catering request ${e.ref}`,
      url: `${site()}/event-catering/enquiry/${e.ref}/${e.token}`,
    });
  }

  if (records.length) {
    const lines = records.map(
      (record) => `${record.label}: ${record.url}`,
    );

    const recordButtons = records
      .map(
        (record) =>
          [
            heading(record.label),
            button("Open record", record.url),
          ].join(""),
      )
      .join("");

    await sendRaw(repo, {
      to: email,
      kind: "recovery",
      subject: "Your Everfresh links",

      text: `Hello,

You asked for the links to your Everfresh records:

${lines.join("\n")}

Keep these links private: anyone with a link can see that record. If you did not ask for this, you can ignore this email.

Everfresh Creations Ltd`,

      html: emailShell({
        siteUrl: site(),
        preheader: "Your requested Everfresh order, application and catering links.",
        title: "Your Everfresh links",
        body: [
          para("Hello,"),
          para(
            "You asked us to send you the links to your Everfresh records. You can open each record using the buttons below.",
          ),
          recordButtons,
          refBadge(`${records.length} record${records.length === 1 ? "" : "s"}`),
          para(
            "<strong>Keep these links private.</strong> Anyone with a link can view that record.",
          ),
          para(
            "If you did not request this email, you can safely ignore it.",
          ),
        ].join(""),
        footerLines: [
          "Your private record links are included above.",
        ],
      }),
    });
  }

  return generic;
}
