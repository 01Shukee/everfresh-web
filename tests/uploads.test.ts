import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readStoredUpload, saveUpload } from "../src/server/media";
import { MemoryRepo } from "../src/server/repo";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
const unwritable = "/etc/hostname/uploads"; // a path under a file: the disk cannot be written, like a read-only serverless filesystem

test("upload on a writable disk is stored on disk", async () => {
  const repo = new MemoryRepo(); const dir = mkdtempSync(join(tmpdir(), "up-")); const r = await saveUpload(repo, png, dir); assert.ok(r.ok);
  assert.deepEqual(await repo.docList("upload"), []); assert.equal((await readStoredUpload(repo, (r as any).url.split("/").pop(), dir))!.type, "image/png");
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
