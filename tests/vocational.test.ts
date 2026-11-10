import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { VARIANTS } from "../src/config/vocational";
import { adminVocApi, applicationsApi } from "../src/server/voc/api";
import {
  createApplication,
  startApplicationPayment,
  startInvoicePayment,
  updateApplication,
  validateDetails,
  ownerView,
  getApp,
  type VocDeps,
} from "../src/server/voc/applications";
import { saveContent, saveMedia, setApplicationStatus, publicVocational } from "../src/server/voc/admin";
import { invoiceTotals, type Application, type Invoice, type Receipt } from "../src/server/voc/model";
import { chromiumPdf, confirmationHtml, invoiceHtml, receiptHtml } from "../src/server/voc/pdf";
import { handleBachsWebhook } from "../src/server/webhook";
import { MemoryRepo } from "../src/server/repo";
import { FakeGateway, NOW, SECRET, evt, signed } from "./helpers";

const T0 = NOW;

async function setup() {
  const repo = new MemoryRepo();
  const gw = new FakeGateway();

  const d: VocDeps = {
    repo,
    gateway: gw,
    siteUrl: "https://shop.test",
    now: () => T0,
  };

  for (const v of VARIANTS) {
    await saveContent(repo, v.id, {
      open: true,
      published: true,
      summary: "TEST summary",
      courses: [
        { name: "Test Course A" },
        { name: "Test Course B", description: "TEST" },
      ],
      curriculum: [{ title: "Module 1", topics: ["Topic"] }],
      requirements: ["TEST requirement"],
      fees: [{ label: "Tuition", kind: "tuition", amountKobo: null }],
    });
  }

  return { repo, gw, d };
}

const details = (o: Record<string, unknown> = {}) => ({
  fullName: "Test Applicant",
  phone: "0803 123 4567",
  email: "applicant@example.com",
  address: "12 Test Street, Test Town",
  ...o,
});

let k = 0;
const key = () => `idem-${String(++k).padStart(4, "0")}-abcdefghijkl`;

const body = (variantId: string, o: Record<string, unknown> = {}) => ({
  idempotencyKey: key(),
  variantId,
  details: details(),
  ...o,
});

const hook = (repo: MemoryRepo, payload: object, o: object = {}) => {
  const s = signed(payload, o);

  return handleBachsWebhook(s.raw, s.headers, {
    repo,
    secrets: [SECRET],
    now: () => T0,
  });
};

const ok = (ref: string, over: object = {}, id = "ch_1") =>
  evt("collection.succeeded", {
    charge_id: id,
    checkout_id: "chk",
    reference: ref,
    status: "SUCCEEDED",
    amount: "5000.00",
    currency: "NGN",
    ...over,
  });

const pdfText = (bytes: Uint8Array) => {
  const f = join(mkdtempSync(join(tmpdir(), "pdf-")), "x.pdf");
  writeFileSync(f, bytes);

  return execFileSync(
    "python3",
    [
      "-c",
      "import pypdf,sys;r=pypdf.PdfReader(sys.argv[1]);print('\\n'.join(p.extract_text() for p in r.pages))",
      f,
    ]
  )
    .toString()
    .normalize("NFKC")
    .replace(/\s+/g, "");
};

const P = (x: string) => x.replace(/\s+/g, "");

test("details validation: required vs optional, dob, emergency contact", () => {
  assert.ok(validateDetails(details(), T0).ok);

  const e = (o: object) => (validateDetails(o, T0) as any).fieldErrors ?? {};

  assert.deepEqual(Object.keys(e({})).sort(), [
    "address",
    "email",
    "fullName",
    "phone",
  ]);

  assert.ok(e(details({ dob: "2999-01-01" })).dob);
  assert.ok(e(details({ dob: "garbage" })).dob);
  assert.ok(!e(details({ dob: "2001-05-04" })).dob);

  assert.ok(e(details({ emergencyName: "Someone" })).emergencyName);
  assert.ok(e(details({ emergencyName: "A B", emergencyPhone: "12" })).emergencyPhone);

  assert.ok(
    validateDetails(
      details({ emergencyName: "A B", emergencyPhone: "08031234567" }),
      T0
    ).ok
  );

  const v: any = validateDetails(
    details({ email: " APPLICANT@Example.COM ", phone: "+2348031234567" }),
    T0
  );

  assert.equal(v.value.email, "applicant@example.com");
  assert.equal(v.value.phone, "+2348031234567");
});

for (const v of VARIANTS) {
  test(`route ${v.id}: select, apply, pay N5,000 (server fixed), verify, receipt, not admitted`, async () => {
    const { repo, gw, d } = await setup();

    const r = await createApplication(
      d,
      body(v.id, {
        course: "Test Course A",
        details: details({ additional: "Hello" }),
      })
    );

    assert.ok(r.ok);

    const view: any = await ownerView(d, r.ref, r.token);

    assert.equal(view.variantId, v.id);
    assert.equal(view.duration, v.durationLabel);
    assert.equal(view.programme, v.label);
    assert.equal(view.course, "Test Course A");
    assert.equal(view.status, "draft");
    assert.equal(view.feeKobo, 500_000);

    assert.ok(!("token" in view) && !("idempotencyKey" in view));

    const p = await startApplicationPayment(d, r.ref, r.token);

    assert.ok(p.ok && p.checkoutUrl);
    assert.equal(gw.calls.length, 1);
    assert.equal(gw.calls[0].amountKobo, 500_000);
    assert.equal(gw.calls[0].reference, r.ref);
    assert.ok(!gw.calls[0].successUrl.includes("?"));
    assert.equal(gw.calls[0].metadata.kind, "application_fee");

    assert.equal(((await ownerView(d, r.ref, r.token)) as any).payment.status, "pending");

    assert.equal((await hook(repo, ok(r.ref))).status, 200);

    const app = (await getApp(repo, r.ref))!;

    assert.equal(app.payment.status, "paid");
    assert.equal(app.status, "submitted");
    assert.ok(app.submittedAt && app.payment.paidAt && app.payment.receiptNumber);
    assert.notEqual(app.status, "admitted");

    const rc = (await repo.docGet<Receipt>("receipt", app.payment.receiptNumber!))!;

    assert.equal(rc.amountKobo, 500_000);
    assert.equal(rc.transactionRef, r.ref);
    assert.equal(rc.kind, "application_fee");
    assert.equal(rc.appRef, r.ref);

    const after: any = await ownerView(d, r.ref, r.token);

    assert.equal(after.payment.transactionRef, r.ref);
    assert.equal(after.receipts.length, 1);
  });
}

test("applications closed / bad variant / bad course are rejected without records", async () => {
  const { repo, d } = await setup();

  await saveContent(repo, "intensive-1m", { open: false });

  const a: any = await createApplication(d, body("intensive-1m"));
  assert.ok(!a.ok && a.code === "APPLICATIONS_CLOSED");

  const b: any = await createApplication(d, body("nope"));
  assert.ok(!b.ok && b.code === "VARIANT_INVALID");

  const c: any = await createApplication(
    d,
    body("regular-3y", { course: "Invented Course" })
  );

  assert.ok(!c.ok && c.code === "COURSE_INVALID");

  const e: any = await createApplication(
    d,
    body("regular-3y", { details: details({ phone: "1" }) })
  );

  assert.ok(!e.ok && e.fieldErrors.phone);
  assert.equal((await repo.docList("app")).length, 0);
});

test("duplicate prevention: key replay, concurrency, same email+programme, reapply after withdrawal", async () => {
  const { repo, d } = await setup();

  const b1 = body("regular-3y");

  const [a, b, c] = await Promise.all([
    createApplication(d, b1),
    createApplication(d, b1),
    createApplication(d, b1),
  ]);

  assert.ok(a.ok && b.ok && c.ok && a.ref === b.ref && b.ref === c.ref);

  const again: any = await createApplication(d, b1);

  assert.ok(again.ok && again.replay && again.ref === a.ref && again.token === a.token);
  assert.equal((await repo.docList("app")).length, 1);

  const dup: any = await createApplication(d, body("regular-3y"));

  assert.ok(
    !dup.ok &&
      dup.status === 409 &&
      dup.code === "DUPLICATE_APPLICATION" &&
      !JSON.stringify(dup).includes(a.token)
  );

  const other: any = await createApplication(d, body("intensive-3m"));
  assert.ok(other.ok);

  const other2: any = await createApplication(
    d,
    body("regular-3y", { details: details({ email: "second@example.com" }) })
  );

  assert.ok(other2.ok);
  assert.equal((await repo.docList("app")).length, 3);

  const app = (await getApp(repo, a.ref))!;
  app.status = "withdrawn";
  await repo.docPut("app", app.ref, app);

  assert.ok((await createApplication(d, body("regular-3y"))).ok);
});

test("duplicate prevention: one payment session, duplicate webhook, second charge flagged", async () => {
  const { repo, gw, d } = await setup();

  const r: any = await createApplication(d, body("intensive-6m"));

  gw.delayMs = 15;

  const [p1, p2, p3] = await Promise.all(
    [1, 2, 3].map(() => startApplicationPayment(d, r.ref, r.token))
  );

  assert.ok(p1.ok && p2.ok && p3.ok);
  assert.equal(gw.calls.length, 1);

  assert.equal(
    ((await startApplicationPayment(d, r.ref, r.token)) as any).checkoutUrl,
    (p1 as any).checkoutUrl
  );

  assert.equal(gw.calls.length, 1);

  const e = ok(r.ref);

  assert.equal((await hook(repo, e)).body, "ok");
  assert.equal((await hook(repo, e)).body, "duplicate");
  assert.equal((await repo.docList("receipt")).length, 1);

  const paid: any = await startApplicationPayment(d, r.ref, r.token);

  assert.ok(paid.ok && paid.checkoutUrl === null && paid.paymentStatus === "paid");
  assert.equal(gw.calls.length, 1);

  await hook(repo, ok(r.ref, {}, "ch_other"));

  const app = (await getApp(repo, r.ref))!;

  assert.equal(app.payment.status, "paid");
  assert.equal((await repo.docList("receipt")).length, 1);
});

test("payment states: failed->retry, expired, mismatch, wrong status, underpaid, refund, unknown, bad signature", async () => {
  const { repo, gw, d } = await setup();

  const mk = async (email: string) => {
    const r: any = await createApplication(
      d,
      body("regular-3y", { details: details({ email }) })
    );

    await startApplicationPayment(d, r.ref, r.token);
    return r;
  };

  const a = await mk("a@example.com");

  await hook(
    repo,
    evt("collection.failed", {
      reference: a.ref,
      charge_id: "ch_f",
      status: "FAILED",
      reason: "Declined",
    })
  );

  let app = (await getApp(repo, a.ref))!;

  assert.equal(app.payment.status, "failed");
  assert.equal(app.status, "awaiting_payment");
  assert.equal(app.payment.receiptNumber, null);

  const retry = await startApplicationPayment(d, a.ref, a.token);

  assert.ok(retry.ok);
  app = (await getApp(repo, a.ref))!;

  assert.equal(app.payment.attempts[1].reference, `${a.ref}-A2`);
  assert.equal(gw.calls[gw.calls.length - 1].amountKobo, 500_000);

  await hook(
    repo,
    evt("collection.failed", {
      reference: a.ref,
      charge_id: "ch_f",
      status: "FAILED",
    })
  );

  assert.equal((await getApp(repo, a.ref))!.payment.status, "pending");

  await hook(repo, ok(`${a.ref}-A2`, {}, "ch_2"));

  app = (await getApp(repo, a.ref))!;

  assert.equal(app.payment.status, "paid");
  assert.equal(app.status, "submitted");

  const b = await mk("b@example.com");

  await hook(repo, evt("checkout.expired", { reference: b.ref }));

  assert.equal((await getApp(repo, b.ref))!.payment.status, "expired");

  for (const [i, over] of [
    { amount: "4999.00" },
    { amount: "5000.01" },
    { currency: "USD" },
    { status: "ACCEPTED" },
    { status: "OVERPAID" },
  ].entries()) {
    const c = await mk(`c${i}@example.com`);

    await hook(repo, ok(c.ref, over, `ch_c${i}`));

    const x = (await getApp(repo, c.ref))!;

    assert.equal(x.payment.status, "needs_review", JSON.stringify(over));
    assert.equal(x.status, "awaiting_payment");
    assert.equal(x.payment.receiptNumber, null);
  }

  const u = await mk("u@example.com");

  await hook(repo, evt("collection.underpaid", { reference: u.ref }));

  assert.equal((await getApp(repo, u.ref))!.payment.status, "needs_review");

  const blocked: any = await startApplicationPayment(d, u.ref, u.token);

  assert.ok(!blocked.ok && blocked.code === "PAYMENT_UNDER_REVIEW");

  assert.equal((await hook(repo, ok("VA-000000-ZZZZ"))).body, "unknown reference");

  await hook(
    repo,
    evt("refund.paid", {
      refund_id: "ref_1",
      charge_id: "ch_2",
      reference: "refund_1",
      status: "paid",
      refunded_amount: "5000.00",
    })
  );

  assert.equal((await getApp(repo, a.ref))!.payment.status, "refunded");

  const s = signed(ok(a.ref), { secret: "wrong_secret_value_xyz" });

  assert.equal(
    (
      await handleBachsWebhook(s.raw, s.headers, {
        repo,
        secrets: [SECRET],
        now: () => T0,
      })
    ).status,
    400
  );
});

test("corrections before payment; locked after; token and email-collision rules", async () => {
  const { repo, d } = await setup();

  const r: any = await createApplication(d, body("intensive-1m"));

  const other: any = await createApplication(
    d,
    body("intensive-3m", { details: details({ email: "x@example.com" }) })
  );

  assert.ok(
    (
      await updateApplication(d, r.ref, r.token, {
        variantId: "intensive-1m",
        course: "Test Course B",
        details: details({ fullName: "Corrected Name" }),
      })
    ).ok
  );

  assert.equal(
    ((await ownerView(d, r.ref, r.token)) as any).details.fullName,
    "Corrected Name"
  );

  assert.ok(
    (
      await updateApplication(d, r.ref, r.token, {
        variantId: "intensive-6m",
        details: details(),
      })
    ).ok
  );

  assert.equal(
    ((await ownerView(d, r.ref, r.token)) as any).duration,
    "6 months"
  );

  const clash: any = await updateApplication(d, r.ref, r.token, {
    variantId: "intensive-3m",
    details: details({ email: "x@example.com" }),
  });

  assert.ok(!clash.ok && clash.code === "DUPLICATE_APPLICATION");

  const bad: any = await updateApplication(d, r.ref, r.token, {
    variantId: "intensive-6m",
    details: details({ phone: "1" }),
  });

  assert.ok(!bad.ok && bad.fieldErrors.phone);

  assert.ok(
    !(await updateApplication(d, r.ref, "wrong-token-value-0123456", {
      details: details(),
    })).ok
  );

  assert.equal(await ownerView(d, r.ref, "nope"), null);

  await startApplicationPayment(d, r.ref, r.token);
  await hook(repo, ok(r.ref));

  const locked: any = await updateApplication(d, r.ref, r.token, {
    details: details({ fullName: "Hacker" }),
  });

  assert.ok(!locked.ok && locked.code === "LOCKED");
  void other;
});

test("staff status rules: cannot admit unpaid; admission triggers the admission workflow", async () => {
  const { repo, d } = await setup();

  const r: any = await createApplication(d, body("regular-3y"));

  const unpaid = await adminVocApi(
    d,
    "PATCH",
    ["applications", r.ref],
    { status: "admitted", note: "Reviewed" },
    new URLSearchParams()
  );

  assert.equal(unpaid.status, 409);

  await startApplicationPayment(d, r.ref, r.token);
  await hook(repo, ok(r.ref));

  assert.equal((await getApp(repo, r.ref))!.status, "submitted");

  const review = await adminVocApi(
    d,
    "PATCH",
    ["applications", r.ref],
    { status: "under_review" },
    new URLSearchParams()
  );

  assert.equal(review.status, 200);

  const admitted = await adminVocApi(
    d,
    "PATCH",
    ["applications", r.ref],
    { status: "admitted", note: "Reviewed" },
    new URLSearchParams()
  );

  assert.equal(admitted.status, 200);
  assert.equal((await getApp(repo, r.ref))!.status, "admitted");

  // This test fixture deliberately has no confirmed programme fee.
  // Admission should still work, but there is no automatic invoice to generate.
  assert.equal((await repo.docList("invoice")).length, 0);

  const invalid = await adminVocApi(
    d,
    "PATCH",
    ["applications", r.ref],
    { status: "draft" },
    new URLSearchParams()
  );

  assert.equal(invalid.status, 409);
});

for (const v of VARIANTS) {
  test(`invoice + balances for ${v.id}: tuition, accommodation, other, discount, partial manual, online remainder`, async () => {
    const { repo, gw, d } = await setup();

    const r: any = await createApplication(d, body(v.id));

    await startApplicationPayment(d, r.ref, r.token);
    await hook(repo, ok(r.ref));

    const mk: any = await adminVocApi(
      d,
      "POST",
      ["applications", r.ref, "invoices"],
      {
        lines: [
          { kind: "tuition", label: "TEST tuition", amountKobo: 1_000_000 },
          { kind: "accommodation", label: "TEST accommodation", amountKobo: 250_000 },
          { kind: "other", label: "TEST materials", amountKobo: 50_000 },
          { kind: "discount", label: "TEST authorised discount", amountKobo: 100_000 },
        ],
        dueDate: "2026-12-01",
      },
      new URLSearchParams()
    );

    assert.equal(mk.status, 201);

    const num = mk.body.number;

    assert.deepEqual(invoiceTotals(mk.body), {
      chargesKobo: 1_300_000,
      discountsKobo: 100_000,
      totalKobo: 1_200_000,
      paidKobo: 0,
      outstandingKobo: 1_200_000,
    });

    const early: any = await startInvoicePayment(d, r.ref, r.token);

    assert.ok(!early.ok && early.code === "NO_PAYABLE_INVOICE");

    assert.equal(
      (
        await adminVocApi(
          d,
          "PUT",
          ["invoices", num],
          { action: "issue" },
          new URLSearchParams()
        )
      ).status,
      200
    );

    assert.equal(
      (
        await adminVocApi(
          d,
          "POST",
          ["invoices", num, "payments"],
          { amountKobo: 200_000, reference: "TEST-TELLER-1" },
          new URLSearchParams()
        )
      ).status,
      201
    );

    assert.equal(
      (
        await adminVocApi(
          d,
          "POST",
          ["invoices", num, "payments"],
          { amountKobo: 200_000, reference: "TEST-TELLER-1" },
          new URLSearchParams()
        )
      ).status,
      409
    );

    assert.equal(
      (
        await adminVocApi(
          d,
          "POST",
          ["invoices", num, "payments"],
          { amountKobo: 5_000_000, reference: "TOO-MUCH" },
          new URLSearchParams()
        )
      ).status,
      409
    );

    let view: any = await ownerView(d, r.ref, r.token);

    assert.equal(view.invoices[0].paidKobo, 200_000);
    assert.equal(view.invoices[0].outstandingKobo, 1_000_000);
    assert.equal(view.invoices[0].state, "part_paid");

    const p: any = await startInvoicePayment(d, r.ref, r.token);

    assert.ok(p.ok);

    const call = gw.calls[gw.calls.length - 1];

    assert.equal(call.amountKobo, 1_000_000);
    assert.match(call.reference, /^VI-\d{6}-[A-Z0-9]{4}-P1$/);

    assert.equal(
      ((await startInvoicePayment(d, r.ref, r.token)) as any).checkoutUrl,
      p.checkoutUrl
    );

    assert.equal(gw.calls.length, 2);

    assert.equal(
      (
        await adminVocApi(
          d,
          "POST",
          ["invoices", num, "payments"],
          { amountKobo: 1_000, reference: "BLOCKED" },
          new URLSearchParams()
        )
      ).status,
      409
    );

    await hook(repo, ok(call.reference, { amount: "9999.00" }, "ch_bad"));

    assert.equal(
      invoiceTotals((await repo.docGet<Invoice>("invoice", num))!).paidKobo,
      200_000
    );

    const inv2 = (await repo.docGet<Invoice>("invoice", num))!;

    inv2.attempts[0].status = "open";
    await repo.docPut("invoice", num, inv2);

    await hook(repo, ok(call.reference, { amount: "10000.00" }, "ch_inv"));

    const final = (await repo.docGet<Invoice>("invoice", num))!;

    assert.deepEqual(invoiceTotals(final), {
      chargesKobo: 1_300_000,
      discountsKobo: 100_000,
      totalKobo: 1_200_000,
      paidKobo: 1_200_000,
      outstandingKobo: 0,
    });

    assert.equal(final.payments.length, 2);
    assert.ok(final.payments.every((x) => x.receiptNumber));

    view = await ownerView(d, r.ref, r.token);

    assert.equal(view.invoices[0].state, "paid");
    assert.equal(view.receipts.length, 3);

    assert.equal(
      (await hook(repo, ok(call.reference, { amount: "10000.00" }, "ch_inv"))).status,
      200
    );

    assert.equal(
      invoiceTotals((await repo.docGet<Invoice>("invoice", num))!).paidKobo,
      1_200_000
    );

    assert.equal(
      ((await startInvoicePayment(d, r.ref, r.token)) as any).code,
      "NO_PAYABLE_INVOICE"
    );

    const appFee = (await repo.docList<Receipt>("receipt")).find(
      (x) => x.kind === "application_fee"
    )!;

    assert.equal(appFee.amountKobo, 500_000);
    assert.ok(!final.lines.some((l) => /application/i.test(l.label)));
  });
}

test("invoice rules: validation, edit/void/issue limits", async () => {
  const { repo, d } = await setup();

  const r: any = await createApplication(d, body("regular-3y"));

  const A = (m: string, p: string[], b?: unknown) =>
    adminVocApi(d, m, p, b, new URLSearchParams());

  for (const lines of [
    [],
    [{ kind: "tuition", label: "x", amountKobo: 0 }],
    [{ kind: "bogus", label: "x", amountKobo: 5 }],
    [{ kind: "discount", label: "x", amountKobo: 5 }],
    [
      { kind: "tuition", label: "x", amountKobo: 100 },
      { kind: "discount", label: "d", amountKobo: 100 },
    ],
    [{ kind: "tuition", label: "x", amountKobo: 1.5 }],
  ]) {
    assert.equal(
      (await A("POST", ["applications", r.ref, "invoices"], { lines })).status,
      422,
      JSON.stringify(lines)
    );
  }

  const mk: any = await A(
    "POST",
    ["applications", r.ref, "invoices"],
    { lines: [{ kind: "tuition", label: "TEST", amountKobo: 100_000 }] }
  );

  const n = mk.body.number;

  assert.equal(
    (
      await A("PUT", ["invoices", n], {
        lines: [{ kind: "tuition", label: "TEST 2", amountKobo: 200_000 }],
      })
    ).status,
    200
  );

  assert.equal(
    (
      await A("POST", ["invoices", n, "payments"], {
        amountKobo: 100,
        reference: "x",
      })
    ).status,
    409
  );

  await A("PUT", ["invoices", n], { action: "issue" });

  assert.equal(
    (
      await A("PUT", ["invoices", n], {
        lines: [{ kind: "tuition", label: "T", amountKobo: 1 }],
      })
    ).status,
    409
  );

  await A("POST", ["invoices", n, "payments"], {
    amountKobo: 100,
    reference: "R1",
  });

  assert.equal((await A("PUT", ["invoices", n], { action: "void" })).status, 409);

  const m2: any = await A(
    "POST",
    ["applications", r.ref, "invoices"],
    { lines: [{ kind: "tuition", label: "T", amountKobo: 5 }] }
  );

  assert.equal(
    (await A("PUT", ["invoices", m2.body.number], { action: "void" })).status,
    200
  );

  assert.equal(
    (await A("POST", ["applications", "VA-NONE", "invoices"], { lines: [] })).status,
    404
  );

  void repo;
});

test("content, media and testimonials: validation and publication rules", async () => {
  const { repo } = await setup();

  const c: any = await saveContent(repo, "regular-3y", {
    open: true,
    published: true,
    fees: [{ label: "Tuition", kind: "tuition", amountKobo: 123.5 }],
  });

  assert.equal(c.status, 422);
  assert.equal((await saveContent(repo, "nope", {})).status, 404);

  const okc: any = await saveContent(repo, "regular-3y", {
    published: true,
    fees: [
      { label: "Tuition", kind: "tuition", amountKobo: null },
      { label: "Kit", kind: "other", amountKobo: 50000 },
    ],
  });

  assert.equal(okc.body.fees[0].amountKobo, null);
  assert.equal(okc.body.open, false);

  assert.equal(
    (
      await saveMedia(repo, "video", {
        title: "V",
        src: "/media/video/a.mp4",
        published: true,
      })
    ).status,
    201
  );

  assert.equal(
    (
      await saveMedia(repo, "video", {
        title: "V",
        src: "/media/video/a.mp4",
        captions: "/media/video/a.vtt",
        published: true,
      })
    ).status,
    201
  );

  assert.equal(
    (
      await saveMedia(repo, "testimonial", {
        quote: "Q",
        name: "N",
        published: true,
      })
    ).status,
    422
  );

  assert.equal(
    (
      await saveMedia(repo, "testimonial", {
        quote: "Q",
        name: "N",
        permission: true,
        published: true,
      })
    ).status,
    201
  );

  await saveMedia(repo, "testimonial", {
    quote: "Hidden",
    name: "H",
    permission: false,
    published: false,
  });

  assert.equal(
    (
      await saveMedia(repo, "portfolio", {
        kind: "project",
        title: "P",
        imageUrl: "javascript:x",
        imageAlt: "a",
      })
    ).status,
    422
  );

  assert.equal(
    (
      await saveMedia(repo, "portfolio", {
        kind: "project",
        title: "P",
        imageUrl: "/media/projects/a.jpg",
      })
    ).status,
    422
  );

  await saveMedia(repo, "portfolio", {
    kind: "student",
    title: "P",
    imageUrl: "/media/projects/a.jpg",
    imageAlt: "Alt",
    published: true,
  });

  await saveMedia(repo, "portfolio", {
    kind: "student",
    title: "Draft",
    imageUrl: "/media/projects/b.jpg",
    imageAlt: "Alt",
    published: false,
  });

  const pub = await publicVocational(repo);

  assert.equal(pub.portfolio.length, 1);
  assert.equal(pub.videos.length, 2);
  assert.equal(pub.testimonials.length, 1);
});

test("PDFs: receipt, confirmation, unpaid and paid invoice render with naira sign and correct distinctions", async () => {
  const { repo, d } = await setup();

  const r: any = await createApplication(
    d,
    body("intensive-3m", {
      course: "Test Course A",
      details: details({ fullName: "á»Œgbá»nna á»¤zá» á»Šfeanyá»‹" }),
    })
  );

  await startApplicationPayment(d, r.ref, r.token);
  await hook(repo, ok(r.ref));

  const app: Application = (await getApp(repo, r.ref))!;

  const rc = (await repo.docGet<Receipt>("receipt", app.payment.receiptNumber!))!;

  const rp = await chromiumPdf(receiptHtml(rc, app));

  assert.equal(Buffer.from(rp.slice(0, 4)).toString(), "%PDF");

  const rt = pdfText(rp);

  for (const s of [
    "PAYMENT RECEIPT",
    rc.number,
    r.ref,
    "á»Œgbá»nna á»¤zá» á»Šfeanyá»‹",
    "Intensive Programme, 3 months",
    "Test Course A",
    "₦5,000",
    "Application-form fee",
    "not an offer of admission",
    "non-refundable",
  ]) {
    assert.ok(rt.includes(P(s)), `receipt missing: ${s}`);
  }

const ct = pdfText(await chromiumPdf(confirmationHtml(app, rc)));

for (const s of [
  "APPLICATION CONFIRMATION",
  "Paid, verified",
  "not an offer of admission",
  "Wait for an email from us confirming your acceptance",
  "₦5,000"
]) {
  assert.ok(ct.includes(P(s)), `confirmation missing: ${s}`);
}

assert.ok(!/congratulations|youareadmitted|hasbeenaccepted|admissiongranted/i.test(ct));

  const mk: any = await adminVocApi(
    d,
    "POST",
    ["applications", r.ref, "invoices"],
    {
      lines: [
        { kind: "tuition", label: "TEST tuition", amountKobo: 1_000_000 },
        { kind: "discount", label: "TEST discount", amountKobo: 100_000 },
      ],
    },
    new URLSearchParams()
  );

  const num = mk.body.number;

  const draft = pdfText(
    await chromiumPdf(invoiceHtml((await repo.docGet<Invoice>("invoice", num))!, app))
  );

  assert.ok(draft.includes("DRAFT"));

  await adminVocApi(
    d,
    "PUT",
    ["invoices", num],
    { action: "issue" },
    new URLSearchParams()
  );

  const inv = (await repo.docGet<Invoice>("invoice", num))!;

  const it = pdfText(await chromiumPdf(invoiceHtml(inv, app)));

  for (const s of [
    "INVOICE",
    num,
    "₦9,000",
    "Outstanding balance",
    "NOT A RECEIPT",
    "₦5,000",
    "[PAYMENT TERMS",
  ]) {
    assert.ok(it.includes(P(s)), `invoice missing: ${s}`);
  }

  assert.ok(!it.includes(P("PAYMENT RECEIPT")));

  await adminVocApi(
    d,
    "POST",
    ["invoices", num, "payments"],
    { amountKobo: 900_000, reference: "TEST-1" },
    new URLSearchParams()
  );

  const paid = pdfText(
    await chromiumPdf(invoiceHtml((await repo.docGet<Invoice>("invoice", num))!, app))
  );

  assert.ok(
    paid.includes(P("Paid in full")) &&
      paid.includes(P("not a receipt")) &&
      !paid.includes(P("NOT A RECEIPT. Payment is due"))
  );

  const dl = await applicationsApi(
    { ...d, renderPdf: chromiumPdf },
    "GET",
    [r.ref, "receipt"],
    null,
    new URLSearchParams({ t: r.token })
  );

  assert.equal(dl.status, 200);
  assert.ok("pdf" in dl && dl.filename.startsWith("receipt-VR-"));

  assert.equal(
    (
      await applicationsApi(
        d,
        "GET",
        [r.ref, "receipt"],
        null,
        new URLSearchParams({ t: "wrong" })
      )
    ).status,
    404
  );

  const un: any = await createApplication(
    d,
    body("regular-3y", {
      details: details({ email: "unpaid@example.com" }),
    })
  );

  assert.equal(
    (
      await applicationsApi(
        d,
        "GET",
        [un.ref, "receipt"],
        null,
        new URLSearchParams({ t: un.token })
      )
    ).status,
    404
  );
});