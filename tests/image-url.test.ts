import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanImageUrl } from "../src/server/image-url";
import { saveItem } from "../src/server/admin-api";
import { saveGallery } from "../src/server/catering/service";
import { saveSection } from "../src/server/site/settings";
import { saveMedia } from "../src/server/voc/admin";
import { MemoryRepo } from "../src/server/repo";

test("image address rule: uploads, bundled files and https pass; http is upgraded; pages, scripts and junk fail", () => {
  for (const [i, o] of [["/uploads/" + "a".repeat(32) + ".jpg", "/uploads/" + "a".repeat(32) + ".jpg"], ["/media/food/x.jpg", "/media/food/x.jpg"], ["https://cdn.example.com/a.jpg?w=800", "https://cdn.example.com/a.jpg?w=800"], ["  http://example.com/a.png ", "https://example.com/a.png"], ["//example.com/a.webp", "https://example.com/a.webp"], ["HTTP://Example.com/a.jpg", "https://Example.com/a.jpg"]] as const) assert.equal(cleanImageUrl(i), o, i);
  for (const bad of ["", "   ", "not a link", "javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://example.com/a.jpg", "/etc/passwd", "/uploads/../secret", "https://exa mple.com/a.jpg", "https://x.com/a.jpg\"onerror=\"x", 42, null, undefined, "https://" + "a".repeat(400)]) assert.equal(cleanImageUrl(bad as any), null, String(bad));
});
test("every admin form accepts an http:// photo link and stores it as https://", async () => {
  const repo = new MemoryRepo(); const cats = await repo.listCategories();
  const v = await saveMedia(repo, "portfolio", { kind: "project", title: "T", imageUrl: "http://example.com/a.jpg", imageAlt: "a", published: true }); assert.equal(v.status, 201); assert.equal((v.body as any).imageUrl, "https://example.com/a.jpg");
  const g = await saveGallery(repo, { kind: "food", title: "T", imageUrl: "http://example.com/b.jpg", imageAlt: "b", published: true }); assert.equal(g.status, 201); assert.equal((g.body as any).imageUrl, "https://example.com/b.jpg");
  const h = await saveSection(repo, "homepage", { benefits: [], featured: [], heroImages: { food: { url: "http://example.com/h.jpg", alt: "h" }, studies: null, catering: null } }); assert.ok(h.ok); assert.equal((h as any).value.heroImages.food.url, "https://example.com/h.jpg");
  const br = await saveSection(repo, "brand", { logoAlt: "x", logoUrl: "http://example.com/l.png" }); assert.ok(br.ok); assert.equal((br as any).value.logoUrl, "https://example.com/l.png");
  const c = await repo.saveCategory({ id: "c1", name: "Cat", sort: 1, active: true } as any).catch(() => null); void cats; void c;
});
test("an unusable address is refused with advice on what to paste", async () => {
  const repo = new MemoryRepo(); const r = await saveMedia(repo, "portfolio", { kind: "project", title: "T", imageUrl: "https://", imageAlt: "a" }); assert.equal(r.status, 422); assert.match((r.body as any).error, /direct link/);
  const h = await saveSection(repo, "homepage", { benefits: [], featured: [], heroImages: { food: { url: "my cake photo", alt: "h" }, studies: null, catering: null } }); assert.equal(h.ok, false); assert.match((h as any).error, /direct link/);
});
test("a newly added photo goes to the front; editing keeps its place unless a display order is given", async () => {
  const repo = new MemoryRepo(); const mk = (title: string, extra: any = {}) => ({ kind: "project", title, imageUrl: "/media/a.jpg", imageAlt: "a", published: true, ...extra });
  const a = (await saveMedia(repo, "portfolio", mk("A"))).body as any; const b = (await saveMedia(repo, "portfolio", mk("B"))).body as any; const c = (await saveMedia(repo, "portfolio", mk("C"))).body as any;
  assert.ok(c.sort < b.sort && b.sort < a.sort); const order = async () => (await repo.docList<any>("portfolio")).sort((x, y) => x.sort - y.sort).map((x) => x.title);
  assert.deepEqual(await order(), ["C", "B", "A"]);
  await saveMedia(repo, "portfolio", mk("A edited", { imageUrl: "/media/new.jpg" }), a.id); assert.deepEqual(await order(), ["C", "B", "A edited"]); assert.equal(((await repo.docGet("portfolio", a.id)) as any).imageUrl, "/media/new.jpg");
  await saveMedia(repo, "portfolio", mk("A first", { sort: -50 }), a.id); assert.deepEqual(await order(), ["A first", "C", "B"]);
  assert.equal((await repo.docList("portfolio")).length, 3, "editing never adds an item");
  const g1 = (await saveGallery(repo, { kind: "food", title: "G1", imageUrl: "/media/a.jpg", imageAlt: "a", published: true })).body as any; const g2 = (await saveGallery(repo, { kind: "food", title: "G2", imageUrl: "/media/a.jpg", imageAlt: "a", published: true })).body as any;
  assert.ok(g2.sort < g1.sort); const e = (await saveGallery(repo, { kind: "food", title: "G1 edited", imageUrl: "/media/b.jpg", imageAlt: "a", published: true }, g1.id)).body as any; assert.equal(e.sort, g1.sort); assert.equal((await repo.docList("cgallery")).length, 2);
});
void saveItem;
