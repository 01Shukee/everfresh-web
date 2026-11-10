import { randomUUID } from "node:crypto";
import { VARIANTS, variantById, vocConfig } from "../../config/vocational";
import { newRef } from "../../lib/ids";
import type { ApiResult } from "../admin-api";
import { cleanImageUrl } from "../image-url";
import { UniqueViolation, type Repo } from "../repo";
import { getApp, getContent, invoicesFor } from "./applications";
import {
  invoiceState,
  invoiceTotals,
  type AppStatus,
  type Application,
  type Invoice,
  type InvoiceLine,
  type LineKind,
  type PortfolioItem,
  type Receipt,
  type Testimonial,
  type VariantContent,
  type VideoItem,
} from "./model";
import { issueReceipt } from "./payments";

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const bad = (m: string): ApiResult => ({
  status: 422,
  body: { error: m },
});

const s = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const kobo = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;

export async function listApplications(repo: Repo, status?: string) {
  const all = (await repo.docList<Application>("app"))
    .filter((a) => !status || a.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return all.map((a) => ({
    ref: a.ref,
    name: a.details.fullName,
    email: a.details.email,
    phone: a.details.phone,
    variantId: a.variantId,
    programme: variantById(a.variantId)!.label,
    duration: variantById(a.variantId)!.durationLabel,
    course: a.course,
    courses: a.courses ?? (a.course ? [a.course] : []),
    accommodation: a.accommodation ?? null,
    status: a.status,
    paymentStatus: a.payment.status,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
  }));
}

export async function adminApplication(repo: Repo, ref: string) {
  const a = await getApp(repo, ref);
  if (!a) return null;

  const { token, idempotencyKey, ...rest } = a;
  const invoices = await invoicesFor(repo, ref);
  const receipts = (await repo.docList<Receipt>("receipt")).filter(
    (r) => r.appRef === ref
  );

  return {
    ...rest,
    programme: variantById(a.variantId)!.label,
    duration: variantById(a.variantId)!.durationLabel,
    invoices: invoices.map((i) => ({
      ...i,
      state: invoiceState(i),
      totals: invoiceTotals(i),
    })),
    receipts,
  };
}

const ALLOWED: Record<AppStatus, AppStatus[]> = {
  draft: ["withdrawn"],
  awaiting_payment: ["withdrawn"],
  submitted: [
    "under_review",
    "admitted",
    "not_admitted",
    "waitlisted",
    "withdrawn",
  ],
  under_review: [
    "admitted",
    "not_admitted",
    "waitlisted",
    "withdrawn",
  ],
  waitlisted: [
    "under_review",
    "admitted",
    "not_admitted",
    "withdrawn",
  ],
  admitted: ["withdrawn"],
  not_admitted: ["under_review"],
  withdrawn: [],
};

export function setApplicationStatus(
  repo: Repo,
  ref: string,
  to: AppStatus,
  note: string | undefined
): Promise<ApiResult> {
  return repo.withLock(`app:${ref}`, () =>
    setApplicationStatusImpl(repo, ref, to, note)
  );
}

async function setApplicationStatusImpl(
  repo: Repo,
  ref: string,
  to: AppStatus,
  note: string | undefined
): Promise<ApiResult> {
  const a = await getApp(repo, ref);

  if (!a) {
    return { status: 404, body: { error: "Application not found." } };
  }

  if (!ALLOWED[a.status].includes(to)) {
    return {
      status: 409,
      body: {
        error: `Cannot move an application from ${a.status} to ${to}.`,
      },
    };
  }

  if (to !== "withdrawn" && a.payment.status !== "paid") {
    return {
      status: 409,
      body: {
        error: "The application-form fee must be verified as paid first.",
      },
    };
  }

  a.status = to;
  a.updatedAt = new Date().toISOString();
  a.notes.push(
    `${a.updatedAt} Status set to ${to}.${note ? " Note: " + note.slice(0, 300) : ""}`
  );

  await repo.docPut("app", a.ref, a);

  return { status: 200, body: { ref: a.ref, status: a.status } };
}

function validLines(
  raw: unknown
): { ok: true; value: InvoiceLine[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) {
    return { ok: false, error: "Add between 1 and 20 invoice lines." };
  }

  const kinds: LineKind[] = [
    "tuition",
    "accommodation",
    "other",
    "discount",
  ];

  const out: InvoiceLine[] = [];

  for (const l of raw) {
    const k = isRec(l) ? l.kind : null;
    const a = isRec(l) ? kobo(l.amountKobo) : null;
    const label = isRec(l) ? s(l.label, 80) : "";

    if (!kinds.includes(k as LineKind) || !label || a === null || a <= 0) {
      return {
        ok: false,
        error: "Each line needs a type, a label and an amount above zero.",
      };
    }

    out.push({
      id: randomUUID(),
      kind: k as LineKind,
      label,
      amountKobo: a,
    });
  }

  const t = invoiceTotals({ lines: out, payments: [] });

  if (out.every((l) => l.kind === "discount") || t.totalKobo <= 0) {
    return {
      ok: false,
      error: "The invoice total must be above zero, and discounts cannot exceed charges.",
    };
  }

  return { ok: true, value: out };
}

export async function createInvoice(
  repo: Repo,
  ref: string,
  raw: unknown,
  now: Date
): Promise<ApiResult> {
  const app = await getApp(repo, ref);

  if (!app) {
    return { status: 404, body: { error: "Application not found." } };
  }

  if (!isRec(raw)) return bad("Invalid invoice.");

  const lines = validLines(raw.lines);
  if (!lines.ok) return bad(lines.error);

  const due = s(raw.dueDate, 10);

  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return bad("Due date must be YYYY-MM-DD.");
  }

  for (let i = 0; ; i++) {
    const inv: Invoice = {
      number: newRef("VI", now),
      appRef: ref,
      status: "draft",
      createdAt: now.toISOString(),
      issuedAt: null,
      dueDate: due || null,
      paymentTerms: s(raw.paymentTerms, 500) || null,
      lines: lines.value,
      payments: [],
      attempts: [],
      notes: [],
    };

    try {
      await repo.docCreate("invoice", inv.number, inv);
      return { status: 201, body: inv };
    } catch (e) {
      if (!(e instanceof UniqueViolation) || i > 5) throw e;
    }
  }
}

export function updateInvoice(
  repo: Repo,
  number: string,
  raw: unknown,
  now: Date
): Promise<ApiResult> {
  return repo.withLock(`inv:${number}`, () =>
    updateInvoiceImpl(repo, number, raw, now)
  );
}

async function updateInvoiceImpl(
  repo: Repo,
  number: string,
  raw: unknown,
  now: Date
): Promise<ApiResult> {
  const inv = await repo.docGet<Invoice>("invoice", number);

  if (!inv) {
    return { status: 404, body: { error: "Invoice not found." } };
  }

  if (!isRec(raw)) return bad("Invalid request.");

  if (raw.action === "issue") {
    if (inv.status !== "draft") {
      return { status: 409, body: { error: "Only a draft can be issued." } };
    }

    inv.status = "issued";
    inv.issuedAt = now.toISOString();
    inv.paymentTerms = inv.paymentTerms ?? vocConfig.paymentTerms;
  } else if (raw.action === "void") {
    if (
      inv.payments.length ||
      inv.attempts.some(
        (a) => a.status === "open" || a.status === "succeeded"
      )
    ) {
      return {
        status: 409,
        body: {
          error: "An invoice with payments or an open payment cannot be voided.",
        },
      };
    }

    inv.status = "void";
  } else {
    if (inv.status !== "draft") {
      return {
        status: 409,
        body: { error: "Only a draft invoice can be edited." },
      };
    }

    const l = validLines(raw.lines);
    if (!l.ok) return bad(l.error);

    inv.lines = l.value;
    inv.dueDate = s(raw.dueDate, 10) || null;
    inv.paymentTerms = s(raw.paymentTerms, 500) || null;
  }

  await repo.docPut("invoice", inv.number, inv);

  return {
    status: 200,
    body: {
      ...inv,
      state: invoiceState(inv),
      totals: invoiceTotals(inv),
    },
  };
}

export function recordManualPayment(
  repo: Repo,
  number: string,
  raw: unknown,
  now: Date
): Promise<ApiResult> {
  return repo.withLock(`inv:${number}`, () =>
    recordManualPaymentImpl(repo, number, raw, now)
  );
}

async function recordManualPaymentImpl(
  repo: Repo,
  number: string,
  raw: unknown,
  now: Date
): Promise<ApiResult> {
  const inv = await repo.docGet<Invoice>("invoice", number);

  if (!inv) {
    return { status: 404, body: { error: "Invoice not found." } };
  }

  if (inv.status !== "issued") {
    return {
      status: 409,
      body: { error: "Payments can only be recorded on an issued invoice." },
    };
  }

  if (!isRec(raw)) return bad("Invalid request.");

  const amt = kobo(raw.amountKobo);
  const reference = s(raw.reference, 80);

  if (amt === null || amt <= 0) {
    return bad("Enter an amount above zero.");
  }

  if (!reference) {
    return bad("Enter the bank or teller reference.");
  }

  const owed = invoiceTotals(inv).outstandingKobo;

  if (amt > owed) {
    return {
      status: 409,
      body: { error: "That is more than the outstanding balance." },
    };
  }

  if (
    inv.payments.some(
      (p) => p.method === "manual" && p.reference === reference
    )
  ) {
    return {
      status: 409,
      body: { error: "A payment with that reference is already recorded." },
    };
  }

  if (inv.attempts.some((a) => a.status === "open")) {
    return {
      status: 409,
      body: {
        error: "An online payment is in progress for this invoice. Wait for it to finish or expire.",
      },
    };
  }

  const r = await issueReceipt(repo, now, {
    kind: "invoice_payment",
    appRef: inv.appRef,
    invoiceNumber: inv.number,
    amountKobo: amt,
    transactionRef: reference,
    chargeId: null,
    paidAt: now.toISOString(),
    method: "manual",
    note: s(raw.note, 200) || null,
  });

  inv.payments.push({
    id: randomUUID(),
    amountKobo: amt,
    method: "manual",
    reference,
    chargeId: null,
    paidAt: r.paidAt,
    receiptNumber: r.number,
    note: r.note,
  });

  inv.notes.push(
    `${now.toISOString()} Manual payment recorded: ${reference}`
  );

  await repo.docPut("invoice", inv.number, inv);

  return {
    status: 201,
    body: {
      receipt: r,
      state: invoiceState(inv),
      totals: invoiceTotals(inv),
    },
  };
}

export async function saveContent(
  repo: Repo,
  variantId: string,
  raw: unknown
): Promise<ApiResult> {
  if (!variantById(variantId)) {
    return { status: 404, body: { error: "Unknown programme option." } };
  }

  if (!isRec(raw)) return bad("Invalid content.");

  const old = await getContent(repo, variantId);

  const list = (v: unknown, n: number, m: number) =>
    (Array.isArray(v) ? v.map((x) => s(x, m)).filter(Boolean).slice(0, n) : []);

  const courses = (Array.isArray(raw.courses) ? raw.courses : [])
    .slice(0, 30)
    .map((c: any) => ({
      id: s(c?.id, 40) || randomUUID(),
      name: s(c?.name, 80),
      description: s(c?.description, 1000) || null,
      role: (c?.role === "choice" ? "choice" : "included") as
        | "choice"
        | "included",
      priceKobo:
        c?.priceKobo === null || c?.priceKobo === undefined
          ? null
          : kobo(c.priceKobo),
    }));

  const curriculum = (Array.isArray(raw.curriculum) ? raw.curriculum : [])
    .slice(0, 30)
    .map((c: any) => ({
      title: s(c?.title, 120),
      topics: list(c?.topics, 30, 200),
    }));

  const fees = (Array.isArray(raw.fees) ? raw.fees : [])
    .slice(0, 20)
    .map((f: any) => ({
      id: s(f?.id, 40) || randomUUID(),
      label: s(f?.label, 80),
      kind: f?.kind,
      amountKobo:
        f?.amountKobo === null || f?.amountKobo === undefined
          ? null
          : kobo(f.amountKobo),
      note: s(f?.note, 200) || null,
      appliesTo:
        f?.appliesTo === "hostel" || f?.appliesTo === "day"
          ? f.appliesTo
          : "all",
      phase:
        f?.phase === "yearly" || f?.phase === "graduation"
          ? f.phase
          : "intake",
    }));

  if (
    courses.some((c) => !c.name) ||
    curriculum.some((c) => !c.title) ||
    fees.some(
      (f) =>
        !f.label ||
        !["tuition", "accommodation", "other"].includes(f.kind)
    )
  ) {
    return bad("Check course names, module titles and fee lines.");
  }

  if (
    (Array.isArray(raw.fees) ? raw.fees : []).some(
      (f: any) =>
        f?.amountKobo !== null &&
        f?.amountKobo !== undefined &&
        kobo(f.amountKobo) === null
    )
  ) {
    return bad("Fee amounts must be whole kobo or left empty (to be confirmed).");
  }

  if (
    (Array.isArray(raw.courses) ? raw.courses : []).some(
      (c: any) =>
        c?.priceKobo !== null &&
        c?.priceKobo !== undefined &&
        kobo(c.priceKobo) === null
    )
  ) {
    return bad("Course prices must be whole kobo or left empty.");
  }

  const nChoice = courses.filter((c) => c.role === "choice").length;
  const choose =
    Number.isInteger(raw.choose) && (raw.choose as number) > 0
      ? (raw.choose as number)
      : 0;

  if (choose > nChoice) {
    return bad(
      `Applicants are asked to choose ${choose} course(s) but only ${nChoice} are marked as a choice. Mark more courses as [choice] or lower the number.`
    );
  }

  const a = isRec(raw.accommodation) ? raw.accommodation : {};

  const c: VariantContent = {
    variantId: variantId as VariantContent["variantId"],
    open: raw.open === true,
    published: raw.published === true,
    summary: s(raw.summary, 1500) || null,
    courses,
    choose,
    curriculum,
    requirements: list(raw.requirements, 30, 300),
    benefits: list(raw.benefits, 20, 200),
    fees: fees as VariantContent["fees"],
    accommodation: {
      available: typeof a.available === "boolean" ? a.available : null,
      note: s(a.note, 300) || null,
    },
    intakeNote: s(raw.intakeNote, 300) || null,
  };

  void old;
  await repo.docPut("content", variantId, c);

  return { status: 200, body: c };
}

type MediaKind = "portfolio" | "video" | "testimonial";

export async function listMedia(repo: Repo, kind: MediaKind) {
  return (await repo.docList<{ sort?: number }>(kind)).sort(
    (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
  );
}

export async function saveMedia(
  repo: Repo,
  kind: MediaKind,
  raw: unknown,
  id?: string
): Promise<ApiResult> {
  if (!isRec(raw)) return bad("Invalid request.");

  const rid = id ?? randomUUID();
  const existing = id ? await repo.docGet<any>(kind, id) : null;

  if (id && !existing) {
    return { status: 404, body: { error: "Not found." } };
  }

  const requestedSort = Number.isInteger(raw.sort)
    ? (raw.sort as number)
    : undefined;

  const existingItems = await repo.docList<{ sort?: number }>(kind);

  const lowestSort = existingItems.reduce(
    (lowest, item) =>
      Math.min(lowest, Number.isFinite(item.sort) ? item.sort! : 0),
    0
  );

  const sort =
    requestedSort ??
    (existing
      ? existing.sort ?? 0
      : kind === "portfolio" || kind === "video"
        ? lowestSort - 1
        : 0);

  const published = raw.published === true;

  const url = (v: unknown) => {
    const x = s(v, 400);
    return /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s]+)$/.test(x)
      ? x
      : null;
  };

  let item: PortfolioItem | VideoItem | Testimonial;

  if (kind === "portfolio") {
    const img = cleanImageUrl(raw.imageUrl);
    const kinds = ["project", "student", "instructor", "facility"];

    if (
      !img ||
      !kinds.includes(raw.kind as string) ||
      !s(raw.title, 100) ||
      !s(raw.imageAlt, 140)
    ) {
      return bad(
        "A photo needs a type, title, direct image link or image path, and alt text. Paste a direct link to the image, not a webpage."
      );
    }

    const vid = raw.variantId ? variantById(raw.variantId) : null;

    if (raw.variantId && !vid) {
      return bad("Unknown programme option.");
    }

    item = {
      id: rid,
      kind: raw.kind as PortfolioItem["kind"],
      title: s(raw.title, 100),
      caption: s(raw.caption, 300),
      imageUrl: img,
      imageAlt: s(raw.imageAlt, 140),
      variantId: (vid?.id ?? null) as PortfolioItem["variantId"],
      published,
      sort,
    };

  } else if (kind === "video") {
    const directFile = (value: unknown, extensions: string[]) => {
      const x = s(value, 400);
      if (!x) return null;

      if (x.startsWith("/")) {
        const pattern = new RegExp(
          `^/(?:media|uploads)/[\\w./-]+\\.(?:${extensions.join("|")})$`,
          "i"
        );
        return pattern.test(x) ? x : null;
      }

      try {
        const parsed = new URL(x);

        if (
          parsed.protocol !== "https:" ||
          !extensions.some((ext) =>
            parsed.pathname.toLowerCase().endsWith(`.${ext}`)
          )
        ) {
          return null;
        }

        return x;
      } catch {
        return null;
      }
    };

    const src = directFile(raw.src, ["mp4", "webm"]);

    const legacyUnpublish =
      !!existing && existing.published === true && !published;

    if ((!src && !legacyUnpublish) || !s(raw.title, 100)) {
      return bad(
        "A video needs a title and a direct MP4 or WebM file link, not a web page."
      );
    }

    const cap = raw.captions
      ? directFile(raw.captions, ["vtt"])
      : null;

    if (raw.captions && !cap && !legacyUnpublish) {
      return bad(
        "Captions must be a direct WebVTT (.vtt) file link, not a web page."
      );
    }

    item = {
      id: rid,
      title: s(raw.title, 100),
      description: s(raw.description, 400),
      src: src ?? s(raw.src, 400),
      poster: raw.poster ? url(raw.poster) : null,
      captions: cap ?? (legacyUnpublish ? url(raw.captions) : null),
      published,
      sort,
    };
  } else {
    if (!s(raw.quote, 600) || !s(raw.name, 80)) {
      return bad("A testimonial needs a quote and a name.");
    }

    if (published && raw.permission !== true) {
      return bad(
        "Written permission must be confirmed before a testimonial is published."
      );
    }

    item = {
      id: rid,
      quote: s(raw.quote, 600),
      name: s(raw.name, 80),
      relation: s(raw.relation, 80),
      permission: raw.permission === true,
      published,
    };
  }

  await repo.docPut(kind, rid, item);

  return { status: id ? 200 : 201, body: item };
}

/** Public, display-ready vocational content: only published items. */
export async function publicVocational(repo: Repo) {
  const contents = await Promise.all(
    VARIANTS.map((v) => getContent(repo, v.id))
  );

  const pub = <T extends { published: boolean; sort?: number }>(l: T[]) =>
    l
      .filter((x) => x.published)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  return {
    content: Object.fromEntries(
      contents.map((c) => [c.variantId, c])
    ) as Record<string, VariantContent>,
    portfolio: pub(await repo.docList<PortfolioItem>("portfolio")),
    videos: pub(await repo.docList<VideoItem>("video")),
    testimonials: (await repo.docList<Testimonial>("testimonial")).filter(
      (t) => t.published && t.permission
    ),
  };
}

export async function firstSort(
  repo: Repo,
  collection: string
): Promise<number> {
  const items = await repo.docList<{ sort?: number }>(collection);

  return (
    items.reduce(
      (highest, item) =>
        Math.max(highest, Number.isFinite(item.sort) ? item.sort! : -1),
      -1
    ) + 1
  );
}