
import { formatNaira } from "../lib/money";
import { flushOutbox, mailerFromEnv, queueMail } from "./email";
import type { Repo } from "./repo";
import { getSettings } from "./site/settings";
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

const SIGN = "\n\nEverfresh Creations Ltd";

const footer = ["Thank you for choosing Everfresh."];

 /** Saves the email to the outbox, then tries delivery.
  * Never throws: email problems must not break orders, payments or applications.
  */
async function send(
  repo: Repo,
  m: {
    to: string | null | undefined;
    subject: string;
    text: string;
    kind: string;
    html?: string;
  },
) {
  if (!m.to) return;

  try {
    await queueMail(repo, {
      to: m.to,
      subject: m.subject,
      text: m.text,
      kind: m.kind,
      ...(m.html ? { html: m.html } : {}),
    });

    await Promise.race([
      flushOutbox(repo, mailerFromEnv()).catch(() => {}),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* The outbox keeps it for a retry. */
  }
}

export async function notifyStaff(
  repo: Repo,
  subject: string,
  text: string,
) {
  try {
    const s = await getSettings(repo);

    await send(repo, {
      to: s.business.notifyEmail,
      subject: `[Everfresh] ${subject}`,
      text,
      kind: "staff",
    });
  } catch {
    /* Ignore staff notification errors. */
  }
}

/** Customer order payment confirmation. */
export const orderPaidMail = (o: {
  orderNumber: string;
  publicToken: string;
  customer: { name: string; email: string };
  totalKobo: number;
}) => {
  const url = `${site()}/order/${o.orderNumber}/${o.publicToken}`;

  return {
    to: o.customer.email,
    kind: "order",
    subject: `Your Everfresh order ${o.orderNumber}`,

    text: `Hello ${o.customer.name},

We have received your payment of ${formatNaira(o.totalKobo)} for order ${o.orderNumber}.
View your order any time: ${url}

Keep this link private: anyone with it can see your order.${SIGN}`,

    html: emailShell({
      siteUrl: site(),
      preheader: `Payment received for order ${o.orderNumber}.`,
      title: "Payment received!",
      body: [
        para(`Hello ${esc(o.customer.name)},`),
        para(
          "Thank you for shopping with Everfresh. We have successfully received your payment.",
        ),
        refBadge(o.orderNumber),
        heading("Payment confirmation"),
        para(
          `Your payment of <strong>${esc(formatNaira(o.totalKobo))}</strong> has been received.`,
        ),
        button("View your order", url),
        para(
          "<strong>Keep your order link private.</strong> Anyone with this link can view your order.",
        ),
      ].join(""),
      footerLines: footer,
    }),
  };
};

/** Customer application started email. */
export const applicationLinkMail = (a: {
  ref: string;
  token: string;
  details: { fullName: string; email: string };
}) => {
  const url = `${site()}/application/${a.ref}/${a.token}`;

  return {
    to: a.details.email,
    kind: "application",
    subject: `Your Everfresh application ${a.ref}`,

    text: `Hello ${a.details.fullName},

Your application ${a.ref} has been started. Use this private link to review it, pay the application-form fee and download your documents:
${url}

Your application is not complete until the application-form fee is paid. Keep this link private.${SIGN}`,

    html: emailShell({
      siteUrl: site(),
      preheader: `Your Everfresh application ${a.ref} has been started.`,
      title: "Application started",
      body: [
        para(`Hello ${esc(a.details.fullName)},`),
        para(
          "Your application has been successfully started. You can continue from where you stopped using the private link below.",
        ),
        refBadge(a.ref),
        heading("Continue your application"),
        para(
          "Use your application page to review your details, pay the application-form fee and download your documents.",
        ),
        button("Continue application", url),
        para(
          "<strong>Important:</strong> Your application is not complete until the application-form fee has been paid.",
        ),
        para(
          "<strong>Keep this link private.</strong> Anyone with it can access your application.",
        ),
      ].join(""),
      footerLines: footer,
    }),
  };
};

/** Customer application fee confirmation. */
export const applicationPaidMail = (a: {
  ref: string;
  token: string;
  details: { fullName: string; email: string };
}) => {
  const url = `${site()}/application/${a.ref}/${a.token}`;

  return {
    to: a.details.email,
    kind: "application",
    subject: `Application ${a.ref}: fee received`,

    text: `Hello ${a.details.fullName},

We have received and verified the application-form fee for ${a.ref}. Your application is now awaiting review. This is not an offer of admission.
Your confirmation and receipt: ${url}

Keep this link private.${SIGN}`,

    html: emailShell({
      siteUrl: site(),
      preheader: `Your application-form fee for ${a.ref} has been received.`,
      title: "Application fee received",
      body: [
        para(`Hello ${esc(a.details.fullName)},`),
        para(
          "We have received and verified your application-form fee. Thank you.",
        ),
        refBadge(a.ref),
        heading("What happens next?"),
        para(
          "Your application is now awaiting review by the admissions team.",
        ),
        para(
          "<strong>Please note:</strong> Payment confirmation is not an offer of admission.",
        ),
        button("View confirmation and receipt", url),
        para(
          "Keep your application link private. Anyone with it can access your application.",
        ),
      ].join(""),
      footerLines: footer,
    }),
  };
};

/** Customer catering enquiry confirmation. */
export const enquiryMail = (e: {
  ref: string;
  token: string;
  name: string;
  email: string | null;
}) => {
  const url = `${site()}/event-catering/enquiry/${e.ref}/${e.token}`;

  return {
    to: e.email,
    kind: "enquiry",
    subject: `Your catering request ${e.ref}`,

    text: `Hello ${e.name},

Your catering request ${e.ref} is saved. To send it to us on WhatsApp, open this page and press Send in WhatsApp:
${url}

The request reaches us on WhatsApp only after you press Send. Keep this link private.${SIGN}`,

    html: emailShell({
      siteUrl: site(),
      preheader: `Your catering request ${e.ref} has been saved.`,
      title: "Catering request saved",
      body: [
        para(`Hello ${esc(e.name)},`),
        para(
          "Your catering request has been successfully saved.",
        ),
        refBadge(e.ref),
        heading("One more step"),
        para(
          "To send your request to the Everfresh team on WhatsApp, open your private request page and press the Send in WhatsApp button.",
        ),
        button("Open catering request", url),
        para(
          "<strong>Important:</strong> Your request reaches us on WhatsApp only after you press Send in WhatsApp.",
        ),
        para(
          "Keep your request link private. Anyone with it can view your request.",
        ),
      ].join(""),
      footerLines: footer,
    }),
  };
};

export const mailOrderPaid = (
  repo: Repo,
  o: Parameters<typeof orderPaidMail>[0],
) =>
  send(repo, orderPaidMail(o)).then(() =>
    notifyStaff(
      repo,
      `Order ${o.orderNumber} paid`,
      `Order ${o.orderNumber} was paid (${formatNaira(o.totalKobo)}). Open the admin to process it: ${site()}/admin`,
    ),
  );

export const mailApplicationLink = (
  repo: Repo,
  a: Parameters<typeof applicationLinkMail>[0],
) => send(repo, applicationLinkMail(a));

export const mailApplicationPaid = (
  repo: Repo,
  a: Parameters<typeof applicationPaidMail>[0],
) =>
  send(repo, applicationPaidMail(a)).then(() =>
    notifyStaff(
      repo,
      `Application ${a.ref}: fee paid`,
      `Application ${a.ref} has a verified application-form fee payment and is awaiting review: ${site()}/admin`,
    ),
  );

export const mailEnquiry = (
  repo: Repo,
  e: Parameters<typeof enquiryMail>[0],
) =>
  send(repo, enquiryMail(e)).then(() =>
    notifyStaff(
      repo,
      `New catering enquiry ${e.ref}`,
      `A catering enquiry ${e.ref} was saved. It may also arrive on WhatsApp if the customer presses Send. Open the admin: ${site()}/admin`,
    ),
  );

export const notifyContact = (repo: Repo, id: string) =>
  notifyStaff(
    repo,
    `New contact message ${id}`,
    `A message ${id} was left on the contact form. Open the admin (Messages): ${site()}/admin`,
  );

export const sendRaw = send;
