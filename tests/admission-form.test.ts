
import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";

import { admissionForm, allFormFields } from "../src/config/admissionForm";
import { MemoryRepo } from "../src/server/repo";
import { saveContent } from "../src/server/voc/admin";
import {
  createApplication,
  getApp,
  startApplicationPayment,
  type VocDeps,
} from "../src/server/voc/applications";
import {
  addFile,
  getForm,
  getFormView,
  saveForm,
  staffFormAction,
  submitPrint,
} from "../src/server/voc/form";
import { admissionFormPdf } from "../src/server/voc/formpdf";
import { confirmFeeByStaff } from "../src/server/voc/staffpay";
import { FakeGateway, NOW } from "./helpers";

async function setup() {
  const repo = new MemoryRepo();

  const d: VocDeps = {
    repo,
    gateway: new FakeGateway(),
    siteUrl: "https://shop.test",
    now: () => NOW,
  };

  await saveContent(repo, "regular-3y", {
    open: true,
    published: true,
    summary: "TEST",
    courses: [],
    requirements: [],
    fees: [
      {
        label: "Tuition",
        kind: "tuition",
        amountKobo: null,
      },
    ],
  });

  const r: any = await createApplication(d, {
    idempotencyKey: "idem-form-0001-abcdefghijkl",
    variantId: "regular-3y",
    details: {
      fullName: "Test Applicant",
      phone: "0803 123 4567",
      email: "form@example.com",
    },
  });

  assert.ok(r.ok);

  return {
    repo,
    d,
    ref: r.ref as string,
    token: r.token as string,
  };
}

const markPaid = async (repo: MemoryRepo, ref: string) => {
  const a = (await getApp(repo, ref))!;

  a.payment.status = "paid";
  a.payment.paidAt = NOW.toISOString();
  a.status = "submitted";

  await repo.docPut("app", ref, a);
};

const jpeg = () =>
  "data:image/jpeg;base64," +
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...new Array(40).fill(1),
  ]).toString("base64");

const png = () =>
  "data:image/png;base64," +
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...new Array(40).fill(2),
  ]).toString("base64");

const fullData = () =>
  Object.fromEntries(
    allFormFields.map((f) => [
      f.id,
      f.kind === "tel"
        ? "08031234567"
        : f.kind === "date"
          ? "2001-05-04"
          : f.kind === "select"
            ? f.options?.[0] ?? "x"
            : "Test value",
    ]),
  );

test("the form opens only after the fee is paid, and only with the private token", async () => {
  const { repo, d, ref, token } = await setup();

  const early: any = await getFormView(d, ref, token);
  assert.ok(!early.ok && early.status === 409);

  await markPaid(repo, ref);

  assert.ok((await getFormView(d, ref, token)).ok);

  const wrong: any = await saveForm(
    d,
    ref,
    "wrong-token-xyz-0123456789",
    { data: {} },
    false,
  );

  assert.ok(!wrong.ok && wrong.status === 404);
});

test("online form: validation, passport, signatures, submit, then locked; staff can send it back; files can be deleted", async () => {
  const { repo, d, ref, token } = await setup();
  await markPaid(repo, ref);

  const bad: any = await saveForm(
    d,
    ref,
    token,
    { data: { mobile: "12" } },
    false,
  );

  assert.ok(!bad.ok && bad.fieldErrors.mobile);

  const incomplete: any = await saveForm(
    d,
    ref,
    token,
    { data: {}, confirmed: false },
    true,
  );

  assert.ok(
    !incomplete.ok &&
      incomplete.status === 422 &&
      incomplete.fieldErrors.surname &&
      incomplete.fieldErrors.courses &&
      incomplete.fieldErrors.passport &&
      incomplete.fieldErrors.sig_recommender &&
      incomplete.fieldErrors.sig_witness &&
      incomplete.fieldErrors.confirmed,
  );

  const notImage: any = await addFile(d, ref, token, "passport", {
    data: Buffer.from("not an image at all").toString("base64"),
  });

  assert.ok(!notImage.ok);

  assert.ok(
    (
      await addFile(d, ref, token, "passport", {
        name: "p.jpg",
        data: jpeg(),
      })
    ).ok,
  );

  const sent: any = await saveForm(
    d,
    ref,
    token,
    {
      data: fullData(),
      signatures: {
        applicant: png(),
        sponsor: png(),
        recommender: png(),
        witness: png(),
      },
      confirmed: true,
    },
    true,
  );

  assert.ok(
    sent.ok &&
      sent.view.status === "submitted" &&
      sent.view.signed.recommender &&
      sent.view.signed.sponsor &&
      sent.view.signed.witness &&
      sent.view.passport,
  );

  const locked: any = await saveForm(
    d,
    ref,
    token,
    { data: fullData() },
    false,
  );

  assert.ok(!locked.ok && locked.status === 409);

  assert.equal(
    (await staffFormAction(d, ref, { action: "return" })).status,
    422,
  );

  assert.equal(
    (
      await staffFormAction(d, ref, {
        action: "return",
        note: "Photo too dark",
      })
    ).status,
    200,
  );

  const again: any = await getFormView(d, ref, token);

  assert.ok(
    again.ok &&
      again.view.status === "draft" &&
      again.view.staffNote === "Photo too dark",
  );

  assert.ok(
    (
      await saveForm(
        d,
        ref,
        token,
        { data: fullData(), confirmed: true },
        true,
      )
    ).ok,
  );

  assert.equal(
    (await staffFormAction(d, ref, { action: "school_signed" })).status,
    200,
  );

  assert.equal(
    (await staffFormAction(d, ref, { action: "purge" })).status,
    200,
  );

  assert.equal((await getForm(repo, ref))!.files.length, 0);
});

test("print route: needs at least one upload; photos and PDFs are accepted, other files and a fourth file are not", async () => {
  const { repo, d, ref, token } = await setup();
  await markPaid(repo, ref);

  const none: any = await submitPrint(d, ref, token);

  assert.ok(!none.ok && none.status === 422);

  const pdf = Buffer.from("%PDF-1.4 test").toString("base64");

  assert.ok(
    (
      await addFile(d, ref, token, "scan", {
        name: "a.jpg",
        data: jpeg(),
      })
    ).ok,
  );

  assert.ok(
    (
      await addFile(d, ref, token, "scan", {
        name: "b.pdf",
        data: pdf,
      })
    ).ok,
  );

  assert.ok(
    (
      await addFile(d, ref, token, "scan", {
        name: "c.jpg",
        data: jpeg(),
      })
    ).ok,
  );

  assert.ok(
    !(
      await addFile(d, ref, token, "scan", {
        name: "d.jpg",
        data: jpeg(),
      })
    ).ok,
  );

  assert.ok(
    !(
      await addFile(d, ref, token, "scan", {
        name: "x.exe",
        data: Buffer.from("MZ not allowed").toString("base64"),
      })
    ).ok,
  );

  const done: any = await submitPrint(d, ref, token);

  assert.ok(
    done.ok &&
      done.view.mode === "print" &&
      done.view.status === "submitted",
  );
});

test("staff can confirm a fee that Bachs took but never reported, through the normal paid path", async () => {
  const { repo, d, ref, token } = await setup();

  assert.equal(
    (await confirmFeeByStaff(d, ref, { note: "x" })).status,
    409,
  ); // no payment was ever started

  await startApplicationPayment(d, ref, token);

  assert.equal(
    (await confirmFeeByStaff(d, ref, {})).status,
    422,
  ); // a note is required

  const r = await confirmFeeByStaff(d, ref, {
    note: "Bachs charge ch_test_123",
  });

  assert.equal(r.status, 200);

  const app = (await getApp(repo, ref))!;

  assert.equal(app.payment.status, "paid");
  assert.equal(app.status, "submitted");
  assert.ok(app.payment.receiptNumber);

  assert.equal(
    (await confirmFeeByStaff(d, ref, { note: "again" })).status,
    409,
  );
});

test("the PDF is the school's two-page Letter form: printable blank and filled copy", async () => {
  const { repo, d, ref, token } = await setup();
  await markPaid(repo, ref);

  const app = (await getApp(repo, ref))!;

  const blank = await PDFDocument.load(
    await admissionFormPdf(
      app,
      null,
      { passport: null, signatures: {} },
      true,
    ),
  );

  assert.equal(blank.getPageCount(), 2);

  assert.deepEqual(
    [
      blank.getPage(0).getWidth(),
      blank.getPage(0).getHeight(),
    ],
    [612, 792],
  );

  assert.ok(
    (
      await addFile(d, ref, token, "passport", {
        name: "p.jpg",
        data: jpeg(),
      })
    ).ok,
  );

  const sent: any = await saveForm(
    d,
    ref,
    token,
    {
      data: fullData(),
      signatures: {
        applicant: png(),
        sponsor: png(),
        recommender: png(),
        witness: png(),
      },
      confirmed: true,
    },
    true,
  );

  assert.ok(sent.ok);

  const filled = await PDFDocument.load(
    await admissionFormPdf(
      app,
      await getForm(repo, ref),
      {
        passport: null,
        signatures: {
          applicant: new Uint8Array(
            Buffer.from(png().split(",")[1], "base64"),
          ),
        },
      },
      false,
    ),
  );

  assert.equal(filled.getPageCount(), 2);
});

test("every part of the form is compulsory; a started school row must be completed, an empty one is fine", async () => {
  const { repo, d, ref, token } = await setup(); await markPaid(repo, ref);
  const noMiddle = { ...fullData(), middleName: "", hailsFrom: "", recRank: "" };
  const r1: any = await saveForm(d, ref, token, { data: noMiddle, confirmed: true }, true);
  assert.ok(!r1.ok && r1.fieldErrors.middleName && r1.fieldErrors.hailsFrom && r1.fieldErrors.recRank);
  const partial = { ...fullData(), sch2Name: "", sch3From: "", sch3Name: "", sch3Exam: "", sch3ExamDate: "" };   // row 2 half done, row 3 empty
  const r2: any = await saveForm(d, ref, token, { data: partial, confirmed: true }, true);
  assert.ok(!r2.ok && r2.fieldErrors.sch2Name && !r2.fieldErrors.sch3Name);
});