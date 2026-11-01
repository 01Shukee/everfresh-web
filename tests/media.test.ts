import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GET } from "../src/app/uploads/[name]/route";
import { MemoryRepo } from "../src/server/repo";
import { MAX_VIDEO_BYTES, isWebVtt, openUpload, saveCaptions, saveImage, saveVideo, sniffVideo } from "../src/server/media";
import { listMedia, saveMedia } from "../src/server/voc/admin";

const box = (brand: string, size = 64) => { const b = new Uint8Array(size); b.set([0, 0, 0, 0x18], 0); b.set(new TextEncoder().encode("ftyp" + brand), 4); return b; };
const webm = () => { const b = new Uint8Array(64); b.set([0x1a, 0x45, 0xdf, 0xa3], 0); return b; };

test("video sniffing: real MP4/MOV/WebM only; images, audio and HTML are refused", () => {
  assert.equal(sniffVideo(box("isom")), "mp4"); assert.equal(sniffVideo(box("mp42")), "mp4"); assert.equal(sniffVideo(box("qt  ")), "mp4"); assert.equal(sniffVideo(webm()), "webm");
  assert.equal(sniffVideo(box("heic")), null); assert.equal(sniffVideo(box("M4A ")), null); assert.equal(sniffVideo(new TextEncoder().encode("<!doctype html><html><body>streamable page</body></html>")), null); assert.equal(sniffVideo(new Uint8Array(8)), null);
});
test("captions must be WebVTT", () => {
  const t = (s: string) => new TextEncoder().encode(s);
  assert.ok(isWebVtt(t("WEBVTT\n\n00:00.000 --> 00:02.000\nHello"))); assert.ok(isWebVtt(t("\uFEFFWEBVTT - title\n"))); assert.ok(!isWebVtt(t("1\n00:00:01,000 --> 00:00:02,000\nSRT, not VTT"))); assert.ok(!isWebVtt(t("WEBVTTX\n"))); assert.ok(!isWebVtt(t("https://instagram-transcript-2026110")));
});
test("video, captions and image uploads are stored with random names and size limits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ef-media-"));
  const v = await saveVideo(box("isom", 5000), dir); assert.ok(v.ok && /^\/uploads\/[a-f0-9]{32}\.mp4$/.test(v.url));
  const w = await saveVideo(webm(), dir); assert.ok(w.ok && /\.webm$/.test(w.url));
  const c = await saveCaptions(new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:01.000\nHi"), dir); assert.ok(c.ok && /\.vtt$/.test(c.url));
  assert.equal((await saveVideo(new TextEncoder().encode("<html>not a video</html>".repeat(5)), dir) as any).status, 415);
  assert.equal((await saveVideo(new Uint8Array(0), dir) as any).status, 422);
  assert.equal((await saveVideo(box("isom", MAX_VIDEO_BYTES + 1), dir) as any).status, 413);
  assert.equal((await saveCaptions(new TextEncoder().encode("not captions"), dir) as any).status, 415);
  assert.equal((await saveImage(box("isom", 5000), dir) as any).status, 415); // a video is not accepted as a photo
  assert.ok(await openUpload((v as any).url.split("/")[2], dir)); assert.equal(await openUpload("../../etc/passwd", dir), null); assert.equal(await openUpload("0".repeat(32) + ".exe", dir), null);
});
test("uploads route answers byte-range requests (required for video in Safari) and serves captions as text/vtt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ef-media-")); process.env.MEDIA_DIR = dir;
  try {
    const bytes = box("isom", 1000); for (let i = 40; i < bytes.length; i++) bytes[i] = i % 251;
    const v = await saveVideo(bytes, dir); assert.ok(v.ok); const name = v.url.split("/")[2]; const ctx = { params: Promise.resolve({ name }) };
    const full = await GET(new Request("http://x/uploads/" + name), ctx); assert.equal(full.status, 200); assert.equal(full.headers.get("accept-ranges"), "bytes"); assert.equal(full.headers.get("content-type"), "video/mp4"); assert.equal(Buffer.from(await full.arrayBuffer()).length, 1000);
    const part = await GET(new Request("http://x/uploads/" + name, { headers: { range: "bytes=100-199" } }), ctx); assert.equal(part.status, 206); assert.equal(part.headers.get("content-range"), "bytes 100-199/1000"); assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.slice(100, 200));
    const open = await GET(new Request("http://x/uploads/" + name, { headers: { range: "bytes=990-" } }), ctx); assert.equal(open.status, 206); assert.equal(open.headers.get("content-range"), "bytes 990-999/1000");
    const tail = await GET(new Request("http://x/uploads/" + name, { headers: { range: "bytes=-10" } }), ctx); assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 10);
    const over = await GET(new Request("http://x/uploads/" + name, { headers: { range: "bytes=5000-6000" } }), ctx); assert.equal(over.status, 416);
    const junk = await GET(new Request("http://x/uploads/" + name, { headers: { range: "bytes=abc" } }), ctx); assert.equal(junk.status, 416);
    assert.equal((await GET(new Request("http://x/uploads/nope.mp4"), { params: Promise.resolve({ name: "nope.mp4" }) })).status, 404);
    const c = await saveCaptions(new TextEncoder().encode("WEBVTT\n"), dir); assert.ok(c.ok); const cr = await GET(new Request("http://x"), { params: Promise.resolve({ name: c.url.split("/")[2] }) }); assert.match(cr.headers.get("content-type") ?? "", /^text\/vtt/);
  } finally { delete process.env.MEDIA_DIR; }
});
test("admin video records: page links are refused, real files and captions are accepted", async () => {
  const repo = new MemoryRepo(); const f = "/uploads/" + "a".repeat(32); const blob = "https://abc123.public.blob.vercel-storage.com/";
  const bad = async (raw: object, id?: string) => { const r = await saveMedia(repo, "video", raw, id); assert.equal(r.status, 422, JSON.stringify(raw)); return (r.body as any).error as string; };
  assert.match(await bad({ title: "Event", src: "https://streamable.com/3eonvw", captions: "https://instagram-transcript-2026110", published: true }), /web page/);
  assert.match(await bad({ title: "Event", src: "https://streamable.com/3eonvw", published: false }), /web page/);
  assert.match(await bad({ title: "E", src: f + ".mp4", captions: "https://example.com/transcript", published: true }), /\.vtt/);
  assert.match(await bad({ title: "E", src: f + ".mp4", published: true }), /captions/i);
  assert.ok((await saveMedia(repo, "video", { title: "Draft", src: f + ".mp4", published: false })).status < 300);
  const ok = await saveMedia(repo, "video", { title: "Event", src: blob + "videos/" + "b".repeat(32) + ".mp4?download=0", captions: blob + "uploads/" + "c".repeat(32) + ".vtt", poster: f + ".jpg", published: true }); assert.ok(ok.status < 300, JSON.stringify(ok.body));
  assert.equal((await listMedia(repo, "video")).length, 2);
  // an older item that already holds a page link can still be switched off
  await repo.docPut("video", "old", { id: "old", title: "Old", description: "", src: "https://streamable.com/x", poster: null, captions: "https://x.test/y", published: true, sort: 0 });
  assert.equal((await saveMedia(repo, "video", { id: "old", title: "Old", src: "https://streamable.com/x", captions: "https://x.test/y", published: false }, "old")).status, 200);
});