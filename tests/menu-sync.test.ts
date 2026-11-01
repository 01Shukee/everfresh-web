import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { seedAll } from "../prisma/seed-data";
import { MENU } from "../prisma/menu-data";
import { syncMenu } from "../prisma/menu-sync";
import { MemoryRepo } from "../src/server/repo";

const quiet = () => {};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sampleRepo = async () => { const r = new MemoryRepo(); await seedAll(r, quiet); return r; };
const publicDir = join(process.cwd(), "public");

test("supplied menu: every dish exists once, with the supplied price in kobo", async () => {
  const repo = await sampleRepo(); await syncMenu(repo, { log: quiet, publicDir });
  const items = (await repo.listItems()).filter((i) => i.active);
  for (const m of MENU) { const hits = items.filter((i) => norm(i.name) === norm(m.name)); assert.equal(hits.length, 1, `${m.name} appears ${hits.length} times`); assert.equal(hits[0].basePriceKobo, m.priceNaira * 100, m.name); assert.equal(hits[0].variants.length, 0); assert.equal(hits[0].addOnGroups.length, 0); }
  assert.equal(MENU.length, 21);
  const prices = Object.fromEntries(items.map((i) => [i.name, i.basePriceKobo / 100]));
  assert.equal(prices["Native Rice"], 3000); assert.equal(prices["Moi Moi"], 1000); assert.equal(prices["Catfish Pepper Soup"], 6000); assert.equal(prices["Turkey"], 7000); assert.equal(prices["Bitter Leaf Soup with Semo and 1 Beef"], 4500);
});
test("no duplicate dish names among visible items, and sample versions of supplied dishes are replaced in place", async () => {
  const repo = await sampleRepo(); const before = await repo.listItems(); const partyId = before.find((i) => i.name === "Party Jollof Rice")!.id;
  const rep = await syncMenu(repo, { log: quiet, publicDir });
  const active = (await repo.listItems()).filter((i) => i.active); const names = active.map((i) => norm(i.name));
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes(norm("Party Jollof Rice")) && !names.includes(norm("Nigerian Fried Rice")) && !names.includes(norm("White Rice and Stew")));
  assert.equal((await repo.getItem(partyId))!.name, "Jollof Rice");
  assert.ok(rep.replaced.includes("Party Jollof Rice -> Jollof Rice")); assert.equal(rep.created.length + rep.replaced.length + rep.keptAsIs.length, MENU.length);
});
test("untouched sample dishes not on the menu are switched off, not deleted; cakes are untouched; empty sample categories are hidden", async () => {
  const repo = await sampleRepo(); const total = (await repo.listItems()).length; await syncMenu(repo, { log: quiet, publicDir });
  const items = await repo.listItems(); const by = (n: string) => items.find((i) => i.name === n)!;
  assert.equal(by("Ofada Rice and Ayamase Sauce").active, false); assert.equal(by("Beef Suya").active, false); assert.equal(by("Classic White Wedding Cake").active, true);
  assert.equal(items.length, total + MENU.length - 5, "nothing deleted; 5 samples were replaced in place, the rest added");
  const cats = await repo.listCategories(); assert.equal(cats.find((c) => c.name === "Drinks")!.active, false); assert.equal(cats.find((c) => c.name === "Wedding Cakes")!.active, true);
  const live = cats.filter((c) => c.active).map((c) => c.name); for (const n of ["Main Meals", "Soups and Special Dishes", "Protein and Extras"]) assert.ok(live.includes(n), n);
});
test("keepSamples leaves the other sample dishes on", async () => {
  const repo = await sampleRepo(); await syncMenu(repo, { log: quiet, publicDir, keepSamples: true });
  assert.equal((await repo.listItems()).find((i) => i.name === "Beef Suya")!.active, true);
});
test("runs once, is safe to force again, and never duplicates", async () => {
  const repo = await sampleRepo(); await syncMenu(repo, { log: quiet, publicDir }); const n = (await repo.listItems()).length;
  const again = await syncMenu(repo, { log: quiet, publicDir }); assert.ok(again.skipped); assert.equal((await repo.listItems()).length, n);
  await syncMenu(repo, { log: quiet, publicDir, force: true }); assert.equal((await repo.listItems()).length, n);
  const names = (await repo.listItems()).filter((i) => i.active).map((i) => norm(i.name)); assert.equal(new Set(names).size, names.length);
});
test("a dish the owner already changed is left exactly as it is", async () => {
  const repo = await sampleRepo(); const moi = (await repo.listItems()).find((i) => i.name === "Moi Moi")!;
  await repo.saveItem({ ...moi, imageUrl: "/uploads/" + "a".repeat(32) + ".jpg", imageAlt: "Our own photo", basePriceKobo: 150_000 });
  const rep = await syncMenu(repo, { log: quiet, publicDir }); const after = (await repo.listItems()).filter((i) => norm(i.name) === "moi moi");
  assert.equal(after.length, 1); assert.equal(after[0].basePriceKobo, 150_000); assert.equal(after[0].imageAlt, "Our own photo"); assert.ok(rep.keptAsIs.includes("Moi Moi"));
});
test("empty database: all dishes and three categories are created", async () => {
  const repo = new MemoryRepo(); const rep = await syncMenu(repo, { log: quiet, publicDir });
  assert.equal(rep.created.length, MENU.length); assert.deepEqual((await repo.listCategories()).map((c) => c.name), ["Main Meals", "Soups and Special Dishes", "Protein and Extras"]);
});
test("dry run writes nothing", async () => {
  const repo = await sampleRepo(); const before = JSON.stringify(await repo.listItems()); const bc = JSON.stringify(await repo.listCategories());
  await syncMenu(repo, { log: quiet, publicDir, dryRun: true }); assert.equal(JSON.stringify(await repo.listItems()), before); assert.equal(JSON.stringify(await repo.listCategories()), bc);
  assert.equal(await repo.docGet("meta", "everfresh-menu-v1"), null);
});
test("images: a real photo wins over the drawing, a drawing is used only for the same dish, otherwise no image; owner photos are never replaced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ef-")); mkdirSync(join(dir, "media/food/ng"), { recursive: true }); writeFileSync(join(dir, "media/food/ng/jollof-rice.jpg"), "x");
  mkdirSync(join(dir, "media/food/illustrations"), { recursive: true }); writeFileSync(join(dir, "media/food/illustrations/fried-rice.jpg"), "x");
  const repo = new MemoryRepo(); await syncMenu(repo, { log: quiet, publicDir: dir }); const get = async (n: string) => (await repo.listItems()).find((i) => i.name === n)!;
  assert.equal((await get("Jollof Rice")).imageUrl, "/media/food/ng/jollof-rice.jpg"); assert.equal((await get("Fried Rice")).imageUrl, "/media/food/illustrations/fried-rice.jpg"); assert.equal((await get("Turkey")).imageUrl, null);
  const spag = await get("Spaghetti"); await repo.saveItem({ ...spag, imageUrl: "/uploads/" + "b".repeat(32) + ".png", imageAlt: "Ours" });
  writeFileSync(join(dir, "media/food/ng/spaghetti.jpg"), "x"); writeFileSync(join(dir, "media/food/ng/fried-rice.jpg"), "x");
  const rep = await syncMenu(repo, { log: quiet, publicDir: dir, imagesOnly: true });
  assert.deepEqual(rep.imagesSet, ["Fried Rice"]); assert.equal((await get("Spaghetti")).imageAlt, "Ours"); assert.equal((await get("Fried Rice")).imageUrl, "/media/food/ng/fried-rice.jpg");
});

test("the supplied menu comes first: its categories and dishes lead, other order is preserved, and it is safe to repeat", async () => {
  const repo = await sampleRepo(); const beforeOthers = (await repo.listCategories()).filter((c) => !["Main Meals", "Soups and Special Dishes", "Protein and Extras"].includes(c.name)).map((c) => c.name);
  await syncMenu(repo, { log: quiet, publicDir }); const cats = await repo.listCategories();
  assert.deepEqual(cats.slice(0, 3).map((c) => c.name), ["Main Meals", "Soups and Special Dishes", "Protein and Extras"]);
  assert.deepEqual(cats.slice(3).map((c) => c.name).filter((n) => beforeOthers.includes(n)), beforeOthers, "other categories keep their relative order");
  const items = (await repo.listItems()).filter((i) => i.active); assert.deepEqual(items.slice(0, 3).map((i) => i.name), ["Jollof Rice", "White Rice and Sauce", "Fried Rice"]);
  assert.deepEqual(items.slice(0, 21).map((i) => i.name), MENU.map((m) => m.name));
  const again = await syncMenu(repo, { log: quiet, publicDir, reorderOnly: true }); assert.equal(again.reordered, 0);
});
test("reorderOnly fixes an already-imported database whose categories were appended after the cakes", async () => {
  const repo = await sampleRepo(); await syncMenu(repo, { log: quiet, publicDir });
  for (const c of await repo.listCategories()) await repo.saveCategory({ ...c, sort: c.name === "Main Meals" ? 50 : c.name.startsWith("Soups and Special") ? 51 : c.name === "Protein and Extras" ? 52 : c.sort });
  assert.equal((await repo.listCategories())[0].name !== "Main Meals", true);
  const r = await syncMenu(repo, { log: quiet, publicDir, reorderOnly: true }); assert.ok(r.reordered! > 0); assert.equal((await repo.listCategories())[0].name, "Main Meals");
});
