import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRepo } from "../src/server/repo";
import { saveContent } from "../src/server/voc/admin";
import { createApplication, type VocDeps } from "../src/server/voc/applications";
import { FakeGateway, NOW } from "./helpers";

test("starting an application that already exists emails the link, never shows it, and leaves the first application alone", async () => {
  const repo = new MemoryRepo(); const d: VocDeps = { repo, gateway: new FakeGateway(), siteUrl: "https://shop.test", now: () => NOW };
  await saveContent(repo, "regular-3y", { open: true, published: true, summary: "TEST", courses: [], requirements: [], fees: [{ label: "Tuition", kind: "tuition", amountKobo: null }] });
  const body = (key: string) => ({ idempotencyKey: key, variantId: "regular-3y", details: { fullName: "Test Applicant", phone: "0803 123 4567", email: "again@example.com" } });
  const a: any = await createApplication(d, body("idem-dup-a-0001-abcdefghijkl")); assert.ok(a.ok);
  const b: any = await createApplication(d, body("idem-dup-b-0002-abcdefghijkl"));
  assert.ok(!b.ok && b.status === 409 && b.code === "DUPLICATE_APPLICATION");
  assert.match(b.message, /emailed/); assert.ok(!JSON.stringify(b).includes(a.token));
  assert.equal((await repo.docList("app")).length, 1);
});