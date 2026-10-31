// Puts the supplied Everfresh menu (prisma/menu-data.ts) into the database through the SAME validated save functions the admin dashboard uses,
// so prices are stored as integer kobo and every dish stays editable in /admin > Menu items. Nothing is hardcoded in the frontend.
//
// Safety rules (so the menu never shows a dish twice and admin work is never lost):
//  - A supplied dish whose name already exists and has been touched by the owner is left exactly as it is.
//  - A supplied dish that matches an untouched SAMPLE dish from the original seed (e.g. "Party Jollof Rice" for "Jollof Rice") REPLACES that
//    sample in place: same record, new name and real price, sample sizes/add-ons (which carried made-up prices) removed.
//  - Remaining untouched sample dishes that are not on the real menu are switched off (not deleted) unless keepSamples is set.
//  - Runs once (a marker is stored) unless force is set; every step can be re-run after a failure without creating duplicates.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { saveCategory, saveItem } from "../src/server/admin-api";
import type { Repo } from "../src/server/repo";
import type { Category, MenuItem } from "../src/server/types";
import { CATEGORIES, MENU, SAMPLE_CATEGORIES, SAMPLE_DISHES, type MenuSeed } from "./menu-data";

export interface SyncOptions { force?: boolean; keepSamples?: boolean; imagesOnly?: boolean; dryRun?: boolean; publicDir?: string; log?: (m: string) => void }
export interface SyncReport { created: string[]; replaced: string[]; keptAsIs: string[]; retired: string[]; retiredCategories: string[]; imagesSet: string[]; skipped?: string }

const MARKER = "everfresh-menu-v1";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ILLUSTRATIONS = "/media/food/illustrations/";
const PHOTOS = "/media/food/ng/";
/** Still the dish created by the sample seed: right name and still carrying the seed's drawn illustration. */
const isSample = (i: MenuItem) => SAMPLE_DISHES.some((n) => norm(n) === norm(i.name)) && !!i.imageUrl?.startsWith(ILLUSTRATIONS);
const must = async (what: string, r: Promise<{ status: number; body: unknown }>) => { const x = await r; if (x.status >= 300) throw new Error(`${what} failed: ${JSON.stringify(x.body)}`); return x.body as any; };

/** The picture a dish should show right now: its real photo if one has been downloaded, else a drawing of the same dish if we have one, else none. */
export function photoFor(seed: MenuSeed, publicDir: string): { url: string; alt: string } | null {
  for (const ext of ["jpg", "webp", "png"]) if (existsSync(join(publicDir, PHOTOS, `${seed.slug}.${ext}`))) return { url: `${PHOTOS}${seed.slug}.${ext}`, alt: seed.photo.alt };
  if (seed.fallback && existsSync(join(publicDir, "media", `${seed.fallback.img}.jpg`))) return { url: `/media/${seed.fallback.img}.jpg`, alt: seed.fallback.alt };
  return null;
}

export async function syncMenu(repo: Repo, opts: SyncOptions = {}): Promise<SyncReport> {
  const log = opts.log ?? console.log; const publicDir = opts.publicDir ?? join(process.cwd(), "public"); const dry = !!opts.dryRun; const tag = dry ? "[dry run] " : "";
  const rep: SyncReport = { created: [], replaced: [], keptAsIs: [], retired: [], retiredCategories: [], imagesSet: [] };

  if (opts.imagesOnly) return attachImages(repo, publicDir, dry, log, rep);
  if (!opts.force && (await repo.docGet("meta", MARKER))) { rep.skipped = "The Everfresh menu was already imported. Nothing changed. Use --force to run it again (dishes you edited are still protected)."; log(rep.skipped); return rep; }

  // categories: reuse by name, create the rest after the existing ones
  const cats = await repo.listCategories(); const catId = new Map<string, string>(); let catSort = Math.max(0, ...cats.map((c) => c.sort));
  for (const name of CATEGORIES) {
    const have = cats.find((c) => norm(c.name) === norm(name));
    if (have) { catId.set(name, have.id); if (!have.active && !dry) await must(`category ${name}`, saveCategory(repo, { name: have.name, sort: have.sort, active: true }, have.id)); continue; }
    log(`${tag}category: ${name}`); catSort += 1;
    catId.set(name, dry ? `dry:${name}` : (await must(`category ${name}`, saveCategory(repo, { name, sort: catSort, active: true }))).id);
  }

  // dishes
  const items = await repo.listItems(); const used = new Set<string>(); let sort = Math.max(-1, ...items.map((i) => i.sort ?? 0)) + 1;
  for (const seed of MENU) {
    const exact = items.find((i) => !used.has(i.id) && norm(i.name) === norm(seed.name));
    if (exact && !isSample(exact)) { used.add(exact.id); rep.keptAsIs.push(seed.name); log(`${tag}kept as it is (already in your menu, edited by you): ${seed.name}`); continue; }
    const target = exact ?? items.find((i) => !used.has(i.id) && isSample(i) && (seed.replaces ?? []).some((r) => norm(r) === norm(i.name)));
    const pic = photoFor(seed, publicDir);
    const body = { name: seed.name, categoryId: catId.get(seed.category), description: seed.description, basePriceKobo: seed.priceNaira * 100, variants: [], addOnGroups: [], tags: seed.tags, imageUrl: pic?.url ?? null, imageAlt: pic?.alt ?? "", active: true, available: true, sort: sort++ };
    if (target) { used.add(target.id); rep.replaced.push(`${target.name} -> ${seed.name}`); log(`${tag}replaced sample "${target.name}" with ${seed.name} (₦${seed.priceNaira.toLocaleString("en-NG")})`); if (!dry) await must(seed.name, saveItem(repo, body, target.id)); }
    else { rep.created.push(seed.name); log(`${tag}added ${seed.name} (₦${seed.priceNaira.toLocaleString("en-NG")})`); if (!dry) used.add((await must(seed.name, saveItem(repo, body))).id); }
  }

  // untouched sample dishes that are not on the real menu: switch off, never delete
  if (!opts.keepSamples) {
    for (const i of items) if (!used.has(i.id) && i.active && isSample(i)) { rep.retired.push(i.name); log(`${tag}switched off sample dish (not on the supplied menu): ${i.name}`); if (!dry) await must(i.name, saveItem(repo, { ...i, active: false }, i.id)); }
    if (!dry) {
      const after = await repo.listItems(); const all: Category[] = await repo.listCategories();
      for (const c of all) if (c.active && SAMPLE_CATEGORIES.some((n) => norm(n) === norm(c.name)) && !after.some((i) => i.categoryId === c.id && i.active)) { rep.retiredCategories.push(c.name); log(`switched off empty sample category: ${c.name}`); await must(c.name, saveCategory(repo, { name: c.name, sort: c.sort, active: false }, c.id)); }
    }
  }
  if (!dry) await repo.docPut("meta", MARKER, { at: new Date().toISOString(), created: rep.created.length, replaced: rep.replaced.length });
  log(`${tag}done: ${rep.created.length} added, ${rep.replaced.length} replaced, ${rep.keptAsIs.length} kept, ${rep.retired.length} sample dishes switched off.`);
  return rep;
}

/** After real photos are downloaded (scripts/food-images.ts fetch): point each dish at its photo. Never overwrites a photo the owner set in the admin. */
async function attachImages(repo: Repo, publicDir: string, dry: boolean, log: (m: string) => void, rep: SyncReport): Promise<SyncReport> {
  const items = await repo.listItems();
  for (const seed of MENU) {
    const it = items.find((i) => norm(i.name) === norm(seed.name)); if (!it) continue;
    const ours = !it.imageUrl || it.imageUrl.startsWith(ILLUSTRATIONS) || it.imageUrl.startsWith(PHOTOS); if (!ours) continue;
    const pic = photoFor(seed, publicDir); if (!pic || pic.url === it.imageUrl) continue;
    rep.imagesSet.push(seed.name); log(`${dry ? "[dry run] " : ""}photo for ${seed.name}: ${pic.url}`);
    if (!dry) await must(seed.name, saveItem(repo, { ...it, imageUrl: pic.url, imageAlt: pic.alt }, it.id));
  }
  log(`${rep.imagesSet.length} dish photo(s) attached.`); return rep;
}
