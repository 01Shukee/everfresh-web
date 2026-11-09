import assert from "node:assert/strict";
import { test } from "node:test";
import { seedAll } from "../prisma/seed-data";
import {
  createApplication,
  getApp,
  invoicesFor,
  startApplicationPayment,
  type VocDeps,
} from "../src/server/voc/applications";
import { flushOutbox, listOutbox, type Mailer } from "../src/server/email";
import { invoiceTotals } from "../src/server/voc/model";
import { buildInvoiceLines, checkChoices, netOf } from "../src/server/voc/pricing";
import { getContent } from "../src/server/voc/applications";
import { publicVocational } from "../src/server/voc/admin";
import { adminVocApi } from "../src/server/voc/api";
import { VARIANTS } from "../src/config/vocational";
import { handleBachsWebhook } from "../src/server/webhook";
import { MemoryRepo } from "../src/server/repo";
import { FakeGateway, NOW, SECRET, evt, signed } from "./helpers";

async function setup() {
  const repo = new MemoryRepo();
  await seedAll(repo, () => {});
  return {
    repo,
    d: {
      repo,
      gateway: new FakeGateway(),
      siteUrl: "https://shop.test",
      now: () => NOW,
    } as VocDeps,
  };
}

let k = 0;

const apply = (
  d: VocDeps,
  variantId: string,
  o: object = {},
  name = "Ada Obi"
) =>
  createApplication(d, {
    idempotencyKey: `inst-${String(++k).padStart(6, "0")}-abcdefghij`,
    variantId,
    details: {
      fullName: name,
      phone: "08031234567",
      email: `u${k}@example.com`,
      address: "12 Test Street, Nnewi",
    },
    ...o,
  }) as Promise<any>;

const pay = async (
  d: VocDeps,
  ref: string,
  token: string,
  id = "chg_1"
) => {
  await startApplicationPayment(d, ref, token);

  const s = signed(
    evt("collection.succeeded", {
      charge_id: id,
      checkout_id: "chk",
      reference: ref,
      status: "SUCCEEDED",
      amount: "5000.00",
      currency: "NGN",
    })
  );

  return handleBachsWebhook(s.raw, s.headers, {
    repo: d.repo as MemoryRepo,
    secrets: [SECRET],
    now: () => NOW,
  });
};

const net = async (d: VocDeps, ref: string) => {
  const inv = await invoicesFor(d.repo, ref);
  assert.equal(inv.length, 1, "exactly one invoice");
  return invoiceTotals(inv[0]).outstandingKobo / 100;
};

const admit = (d: VocDeps, ref: string) =>
  adminVocApi(
    d,
    "PATCH",
    ["applications", ref],
    { status: "admitted", note: "Reviewed" },
    new URLSearchParams()
  );

test("programme invoice is generated after admission, for every programme", async () => {
  const { d } = await setup();

  const cases: [string, Record<string, unknown>, number][] = [
    ["regular-3y", { accommodation: "day" }, 95_500],
    ["regular-3y", { accommodation: "hostel" }, 115_500],
    ["intensive-1m", { courses: ["Pastries"] }, 150_000],
    ["intensive-1m", { courses: ["Cosmetology"] }, 70_000],
    ["intensive-3m", {}, 350_000],
    ["intensive-6m", {}, 500_000],
    ["intensive-1y", { courses: ["Craft", "Bead making"] }, 750_000],
    ["intensive-special", { courses: ["Yogurt"] }, 350_000],
    ["intensive-special", { courses: ["Fashion (male and female)"] }, 200_000],
  ];

  for (const [variantId, extra, expected] of cases) {
    const a = await apply(d, variantId, extra);
    assert.ok(a.ok, `${variantId}: ${JSON.stringify(a)}`);

    await pay(d, a.ref, a.token);

    assert.equal(
      (await invoicesFor(d.repo, a.ref)).length,
      0,
      "payment verification alone must not create a school-fee invoice"
    );

    const admitted = await admit(d, a.ref);
    assert.equal(admitted.status, 200, `${variantId} should be admitted`);

    assert.equal(
      await net(d, a.ref),
      expected,
      `${variantId} ${JSON.stringify(extra)}`
    );
  }
});

test("invoice lines are itemised after admission, the application fee is credited, and graduation is not billed yet", async () => {
  const { d, repo } = await setup();

  const a = await apply(d, "regular-3y", { accommodation: "day" });
  await pay(d, a.ref, a.token);

  assert.equal((await invoicesFor(repo, a.ref)).length, 0);

  assert.equal((await admit(d, a.ref)).status, 200);

  const inv = (await invoicesFor(repo, a.ref))[0];
  assert.ok(inv);

  const labels = inv.lines.map((l: any) => l.label);

  assert.ok(
    labels.includes("Tuition and registration") &&
      labels.includes("Matriculation fees") &&
      !labels.some((l: string) => /hostel/i.test(l)),
    "day students are not charged hostel"
  );

  assert.ok(
    inv.lines.some(
      (l: any) =>
        l.kind === "discount" &&
        l.amountKobo === 500_000 &&
        /Application-form fee already paid/.test(l.label)
    )
  );

  assert.ok(inv.auto === true && inv.status === "issued");

  const b = await apply(d, "intensive-3m");
  await pay(d, b.ref, b.token, "chg_2");

  assert.equal((await invoicesFor(repo, b.ref)).length, 0);

  assert.equal((await admit(d, b.ref)).status, 200);

  const i3 = (await invoicesFor(repo, b.ref))[0];

  assert.ok(
    !i3.lines.some((l: any) => /Graduation/.test(l.label)),
    "the graduation fee is due later"
  );
});

test("paying twice or replaying the webhook never creates a second invoice", async () => {
  const { d } = await setup();

  const a = await apply(d, "intensive-3m");

  await pay(d, a.ref, a.token);
  await pay(d, a.ref, a.token);
  await pay(d, a.ref, a.token, "chg_other");

  assert.equal(
    (await invoicesFor(d.repo, a.ref)).length,
    0,
    "there should be no school-fee invoice before admission"
  );

  assert.equal((await admit(d, a.ref)).status, 200);

  assert.equal((await invoicesFor(d.repo, a.ref)).length, 1);

  assert.equal(
    await net(d, a.ref),
    350_000,
    "the invoice should be generated once with the application-fee credit"
  );
});

test("choices are validated against the programme", async () => {
  const { d } = await setup();
  const code = async (v: string, o: object) => (await apply(d, v, o)).code;

  assert.equal(await code("regular-3y", {}), "ACCOMMODATION_INVALID");
  assert.equal(await code("regular-3y", { accommodation: "castle" }), "ACCOMMODATION_INVALID");

  assert.equal(await code("intensive-1m", {}), "COURSE_INVALID");
  assert.equal(await code("intensive-1m", { courses: ["Pastries", "Craft"] }), "COURSE_INVALID");
  assert.equal(await code("intensive-1m", { courses: ["Invented"] }), "COURSE_INVALID");

  assert.equal(await code("intensive-1y", { courses: ["Craft"] }), "COURSE_INVALID");
  assert.equal(await code("intensive-1y", { courses: ["Craft", "Craft"] }), "COURSE_INVALID");
  assert.equal(await code("intensive-1y", { courses: ["Craft", "Pastries"] }), "COURSE_INVALID");

  assert.ok(
    (await apply(d, "intensive-3m", { accommodation: "hostel" })).ok,
    "a hostel choice is ignored where the programme has none"
  );

  const a = await apply(d, "intensive-3m", { accommodation: "hostel" });
  assert.equal((await getApp(d.repo, a.ref))!.accommodation, null);

  assert.equal((await d.repo.docList("app")).length, 2, "rejected applications leave no records");
});

test("registration email: branded HTML with the saved details, safe against injected markup", async () => {
  const { d, repo } = await setup();

  const a = await apply(d, "regular-3y", {
    accommodation: "hostel",
    details: {
      fullName: "<script>alert(1)</script> Eve",
      phone: "08031234567",
      email: "eve@example.com",
      address: "1 <b>Bold</b> Rd, Nnewi",
      additional: "Note & \"quotes\"",
    },
  });

  assert.ok(a.ok);

  const m = (await listOutbox(repo)).find(
    (x: any) => x.to === "eve@example.com"
  ) as any;

  assert.ok(m, "queued");

  const full = (await repo.docGet<any>("outbox", m.id))!;

  assert.ok(
    full.html &&
      full.html.includes("#1B6B28") &&
      full.html.includes("#FDB10F") &&
      full.html.includes(a.ref) &&
      full.html.includes("Hostel student")
  );

  assert.ok(
    !full.html.includes("<script>") &&
      !full.html.includes("<b>Bold</b>") &&
      full.html.includes("&lt;script&gt;"),
    "student-typed text is escaped"
  );

  assert.ok(
    full.html.includes("Matriculation fees") &&
      full.html.includes("120,500") &&
      full.html.includes("115,500"),
    "fee breakdown shown"
  );

  assert.ok(
    full.html.includes("Documents and items to bring") &&
      full.html.includes("hostel students"),
    "requirements and hostel list"
  );

  assert.ok(
    full.text.includes(a.ref) &&
      full.text.includes("not complete until") &&
      full.text.includes("/application/"),
    "plain-text version"
  );

  assert.equal(full.subject, `Registration received: ${a.ref}`);
});

test("fee-received email has no school invoice; admission email carries the invoice and pay link", async () => {
  const { d, repo } = await setup();

  const a = await apply(d, "intensive-1m", {
    courses: ["Pastries"],
    details: {
      fullName: "Eve",
      phone: "08031234567",
      email: "eve2@example.com",
      address: "Nnewi Town",
    },
  });

  await pay(d, a.ref, a.token);

  let mails = (await repo.docList<any>("outbox")).filter(
    (x) => x.to === "eve2@example.com"
  );

  assert.equal(mails.length, 2, "registration and payment confirmation emails");

  const paid = mails.find((x) => x.subject.includes("fee received"));
  assert.ok(paid, "payment confirmation email should exist");

  assert.ok(
    paid!.text.includes("not an offer of admission"),
    "payment confirmation must explain that payment is not admission"
  );

  assert.equal(
    (await invoicesFor(repo, a.ref)).length,
    0,
    "no school-fee invoice before admission"
  );

  assert.equal((await admit(d, a.ref)).status, 200);

  const inv = (await invoicesFor(repo, a.ref))[0];
  assert.ok(inv, "admission should generate the school-fee invoice");

  mails = (await repo.docList<any>("outbox")).filter(
    (x) => x.to === "eve2@example.com"
  );

  assert.equal(mails.length, 3, "admission should add one email");

  const admission = mails.find((x) => x.html?.includes(inv.number));

  assert.ok(admission, "admission email should contain the invoice number");

  assert.ok(
    admission!.html.includes("150,000") &&
      admission!.html.includes(`/application/${a.ref}/${a.token}`),
    "admission email should show the invoice amount and application link"
  );
});

test("an email failure never affects a saved registration, and the email is retried, not duplicated", async () => {
  const { d, repo } = await setup();

  const det = {
    fullName: "Fay Test",
    phone: "08031234567",
    email: "fay@example.com",
    address: "12 Test Street, Nnewi",
  };

  const a = await apply(d, "intensive-6m", {
    idempotencyKey: "fay-key-0123456789",
    details: det,
  });

  assert.ok(a.ok);
  assert.ok(await getApp(repo, a.ref), "registration saved");

  let tries = 0;

  const boom: Mailer = {
    send: async () => {
      tries++;
      throw new Error("provider down");
    },
  };

  await flushOutbox(repo, boom);
  await flushOutbox(repo, boom);

  const mine = () =>
    repo.docList<any>("outbox").then((l) => l.filter((x) => x.to === "fay@example.com"));

  const queued = await mine();

  assert.equal(queued.length, 1, "still exactly one email");
  assert.ok(tries >= 1 && queued[0].status !== "sent");

  const ok: Mailer = { send: async () => {} };

  await flushOutbox(repo, ok);

  assert.equal((await mine())[0].status, "sent", "delivered once the provider recovers");

  const dup = await apply(d, "intensive-6m", {
    idempotencyKey: "fay-key-0123456789",
    details: det,
  });

  assert.ok(dup.ok && dup.replay, "a double submit returns the same registration");
  assert.equal((await repo.docList("app")).length, 1);
  assert.equal((await mine()).length, 1, "and no second email");
});

test("the calculator itself: hostel vs day, credit, and choices", async () => {
  const { repo } = await setup();

  const c = await getContent(repo, "regular-3y");
  const base = { courses: [], course: null, feeKobo: 500_000 };

  assert.equal(
    netOf(buildInvoiceLines(c, { ...base, accommodation: "day" })),
    9_550_000
  );

  assert.equal(
    netOf(buildInvoiceLines(c, { ...base, accommodation: "hostel" })),
    11_550_000
  );

  const r: any = checkChoices(c, { accommodation: "day" });

  assert.ok(r.ok && r.accommodation === "day");
  assert.ok(!(checkChoices(c, {}) as any).ok);
});

test("the public programme data covers every programme and tier (so no page can be missing one)", async () => {
  const { repo } = await setup();

  const pub = await publicVocational(repo);

  assert.deepEqual(
    Object.keys(pub.content).sort(),
    VARIANTS.map((v) => v.id as string).sort()
  );

  for (const v of VARIANTS) {
    assert.ok(pub.content[v.id].published && pub.content[v.id].open, v.id);
  }
});