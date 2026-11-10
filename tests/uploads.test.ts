import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readStoredUpload, saveUpload } from "../src/server/media";
import { MemoryRepo } from "../src/server/repo";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
const blockedRoot = mkdtempSync(join(tmpdir(), "up-blocked-"));
const blockedFile = join(blockedRoot, "not-a-directory");

writeFileSync(blockedFile, "This is a file, not a directory.");

const unwritable = join(blockedFile, "uploads");

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]])); for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try { await fn(); } finally { for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
};
test("upload on a writable disk is stored on disk", async () => {
  await withEnv({ DATABASE_URL: undefined, MEDIA_STORAGE: undefined }, async () => {
    const repo = new MemoryRepo(); const dir = mkdtempSync(join(tmpdir(), "up-")); const r = await saveUpload(repo, png, dir); assert.ok(r.ok);
    assert.deepEqual(await repo.docList("upload"), []); assert.equal((await readStoredUpload(repo, (r as any).url.split("/").pop(), dir))!.type, "image/png");
  });
});
test("upload when the disk is read-only (serverless) is kept in the database and read back", async () => {
  const repo = new MemoryRepo(); const r = await saveUpload(repo, png, unwritable); assert.ok(r.ok); const name = (r as any).url.split("/").pop();
  assert.match((r as any).url, /^\/uploads\/[a-f0-9]{32}\.png$/); assert.equal((await repo.docList("upload")).length, 1);
  const back = await readStoredUpload(repo, name, unwritable); assert.equal(back!.type, "image/png"); assert.deepEqual([...back!.bytes], [...png]);
});
test("bad uploads are refused with a message, never thrown", async () => {
  const repo = new MemoryRepo(); const t = await saveUpload(repo, new TextEncoder().encode("<svg onload=alert(1)></svg>".padEnd(40)), unwritable); assert.equal(t.ok, false); assert.equal((t as any).status, 415);
  assert.equal((await saveUpload(repo, new Uint8Array(0), unwritable)).ok, false); assert.equal((await saveUpload(repo, new Uint8Array(5 * 1024 * 1024 + 1), unwritable)).ok, false);
  assert.equal(await readStoredUpload(repo, "../../etc/passwd", unwritable), null); assert.equal(await readStoredUpload(repo, "a".repeat(32) + ".png", unwritable), null);
});

test("with a database configured, a photo is stored in the database even when the local disk is writable (so the live site can show it)", async () => {
  await withEnv({ DATABASE_URL: "postgresql://example/db", MEDIA_STORAGE: undefined }, async () => {
    const repo = new MemoryRepo(); const dir = mkdtempSync(join(tmpdir(), "up-")); const r = await saveUpload(repo, png, dir); assert.ok(r.ok);
    assert.equal((await repo.docList("upload")).length, 1, "stored in the database"); assert.equal(readdirSync(dir).length, 0, "nothing written to the local disk");
    assert.equal((await readStoredUpload(repo, (r as any).url.split("/").pop(), "/nowhere"))!.type, "image/png");
  });
});
test("with a database configured, bad files are still refused", async () => {
  await withEnv({ DATABASE_URL: "postgresql://example/db", MEDIA_STORAGE: undefined }, async () => {
    const repo = new MemoryRepo(); assert.equal((await saveUpload(repo, new TextEncoder().encode("not an image at all, just text"), unwritable)).ok, false); assert.equal((await saveUpload(repo, new Uint8Array(0))).ok, false); assert.equal((await saveUpload(repo, new Uint8Array(5 * 1024 * 1024 + 1))).ok, false); assert.equal((await repo.docList("upload")).length, 0);
  });
});
test("MEDIA_STORAGE=disk keeps using the disk even with a database (servers with a persistent volume)", async () => {
  await withEnv({ DATABASE_URL: "postgresql://example/db", MEDIA_STORAGE: "disk" }, async () => {
    const repo = new MemoryRepo(); const dir = mkdtempSync(join(tmpdir(), "up-")); assert.ok((await saveUpload(repo, png, dir)).ok); assert.equal(readdirSync(dir).length, 1); assert.equal((await repo.docList("upload")).length, 0);
  });
});
