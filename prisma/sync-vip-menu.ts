// Builds the VIP menu: the VIP specials first, then the whole regular menu (cakes left out unless INCLUDE_CAKES=1).
// Also puts the three special soups on the REGULAR menu, because they belong on both.
// DRY RUN by default: it prints what it would do and saves nothing. Run with APPLY=1 to save. Nothing is deleted: old VIP dishes are switched off.
import { saveCategory, saveItem } from "../src/server/admin-api";
import { formatNaira } from "../src/lib/money";
import type { MenuItem } from "../src/server/types";
import { listVipCategories, listVipItems, saveVipCategory, saveVipItem, type VipItem } from "../src/server/vip/service";

const naira = (n: number) => n * 100; // money is stored as integer kobo
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
const must = (what: string, r: { status: number; body: unknown }) => { if (r.status >= 300) throw new Error(`${what} failed: ${JSON.stringify(r.body)}`); return r.body as any; };
const byOrder = (a: MenuItem, b: MenuItem) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

type Special = { name: string; price: number; description: string; soup?: boolean; imageFrom?: string };
const SPECIALS: Special[] = [
  { name: "Chicken and chips", price: 12_000, description: "" },
  { name: "Pineapple Rice", price: 5_000, description: "A flavourful rice dish prepared with pineapple." },
  { name: "Fisher soup (4 mini pots)", price: 35_000, description: "Special soup, served in 4 mini pots.", soup: true },
  { name: "Ofe Owerri (4 mini pots)", price: 35_000, description: "Special soup, served in 4 mini pots.", soup: true },
  { name: "Oha soup (4 mini pots)", price: 25_000, description: "Special soup, served in 4 mini pots.", soup: true, imageFrom: "Oha soup" },
  { name: "Barbecue big fish", price: 30_000, description: "" },
  { name: "Pizza (Medium)", price: 20_000, description: "" },
  { name: "Pizza (Big)", price: 30_000, description: "" },
];
/** The placeholder VIP dishes seeded earlier (sample prices). If they are not on the new list they are switched off. */
const OLD_VIP = new Set(["Everfresh Fried Rice and Turkey", "Jollof Rice with Grilled Chicken", "Special Rice Dish", "Golden Fish Barbecue", "Grilled Chicken", "Peppered Gizzard", "Peppered Snail", "Seasoned Turkey", "Jippy Burger", "Milky Doughnuts", "Meat Pies", "Shawarma", "Ice Cream",
  "Jollof Rice", "Fried Rice", "Native Rice", "Egusi Soup with Garri", "Oha Soup with Fufu", "Grilled Catfish", "Catfish Pepper Soup", "Moi Moi"].map(norm));
const CAKE_CATEGORIES = new Set(["wedding cakes", "celebration cakes", "showpiece and custom cakes"]);
const INCLUDE_CAKES = process.env.INCLUDE_CAKES === "1";

/** The VIP menu has one price and a note per dish, no sizes or add-ons, so say how to order those. */
function vipDescription(i: MenuItem): string {
  const groups = i.addOnGroups.map((g) => g.name.toLowerCase());
  if (groups.includes("swallow")) return "Served with fufu, semo or garri. Write your choice in the special instructions. Order extra protein as a separate item.";
  let d = i.description.replace(/\s*Add a protein if you like\.?/i, "").trim();
  if (groups.some((n) => n.includes("protein"))) d = `${d}${d ? " " : ""}Order extra protein as a separate item.`;
  return d.slice(0, 400);
}

type Target = { category: string; name: string; priceKobo: number; description: string; imageUrl: string | null; imageAlt: string; available: boolean };

async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Nothing was changed."); process.exit(1); }
  const apply = process.env.APPLY === "1"; const log = console.log;
  const { PrismaRepo } = await import("../src/server/repo-prisma");
  const repo = new PrismaRepo();
  const cats = [...(await repo.listCategories())].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const items = await repo.listItems();
  if (!cats.length || !items.length) throw new Error("The regular menu looks empty, or DATABASE_URL is not set. Nothing was changed.");
  log(apply ? "APPLYING changes.\n" : "DRY RUN: nothing will be saved. Run again with APPLY=1 to save.\n");

  // ---------------------------------------------------------------- A. the special soups also go on the regular menu
  const soupCat = cats.find((c) => c.name.toLowerCase() === "soups and swallows");
  let soupCatId = soupCat?.id ?? "(new)";
  if (!soupCat) { log("regular menu: new category Soups and Swallows"); if (apply) soupCatId = must("category", await saveCategory(repo, { name: "Soups and Swallows", sort: Math.max(0, ...cats.map((c) => c.sort)) + 1, active: true })).id; }
  else if (!soupCat.active) { log("regular menu: switching Soups and Swallows back on"); if (apply) must("category", await saveCategory(repo, { name: soupCat.name, sort: soupCat.sort, active: true }, soupCat.id)); }
  let nextSort = Math.max(-1, ...items.map((i) => i.sort ?? 0)) + 1;
  const imageFrom = (s: Special) => (s.imageFrom ? items.find((i) => norm(i.name) === norm(s.imageFrom!) && i.imageUrl) : undefined);
  for (const s of SPECIALS.filter((x) => x.soup)) {
    const price = naira(s.price); const old = items.find((i) => norm(i.name) === norm(s.name)); const src = imageFrom(s);
    if (!old) {
      log(`regular menu: + ${s.name}  ${formatNaira(price)}`);
      if (apply) must(s.name, await saveItem(repo, { name: s.name, categoryId: soupCatId, description: s.description, basePriceKobo: price, variants: [], addOnGroups: [], tags: ["soup", "special"], imageUrl: src?.imageUrl ?? null, imageAlt: src?.imageAlt || s.name, active: true, available: true, sort: nextSort++ }));
    } else if (old.basePriceKobo !== price || !old.active) {
      log(`regular menu: ~ ${s.name}  ${formatNaira(old.basePriceKobo)} -> ${formatNaira(price)}${old.active ? "" : " (switched back on)"}`);
      if (apply) must(s.name, await saveItem(repo, { ...old, basePriceKobo: price, active: true }, old.id));
    }
  }

  // ---------------------------------------------------------------- B. what the VIP menu should hold
  const targets: Target[] = [];
  for (const s of SPECIALS) { const src = imageFrom(s); targets.push({ category: "VIP Specials", name: s.name, priceKobo: naira(s.price), description: s.description, imageUrl: src?.imageUrl ?? null, imageAlt: src?.imageAlt || s.name, available: true }); }
  const specialKeys = new Set(SPECIALS.map((s) => norm(s.name)));   // the special soups already come from VIP Specials: never list them twice
  for (const c of cats) {
    if (!c.active || (!INCLUDE_CAKES && CAKE_CATEGORIES.has(c.name.toLowerCase()))) continue;
    for (const i of items.filter((x) => x.categoryId === c.id && x.active).sort(byOrder)) {
      if (specialKeys.has(norm(i.name))) continue;
      const base = { category: c.name, description: vipDescription(i), imageUrl: i.imageUrl, imageAlt: i.imageAlt || i.name, available: i.available };
      if (i.variants.length) for (const v of i.variants) targets.push({ ...base, name: `${i.name} (${v.name})`, priceKobo: v.priceKobo });
      else if (i.basePriceKobo > 0) targets.push({ ...base, name: i.name, priceKobo: i.basePriceKobo });
    }
  }
  const seen = new Set<string>(); const unique: Target[] = [];
  for (const t of targets) { const k = norm(t.name); if (seen.has(k)) { log(`skipped a second dish called "${t.name}"`); continue; } seen.add(k); unique.push(t); }
  const categoryOrder = [...new Set(unique.map((t) => t.category))];

  // ---------------------------------------------------------------- C. apply to the VIP menu
  const vcats = await listVipCategories(repo); const vitems = await listVipItems(repo);
  const vcatId = new Map<string, string>(); const newCats: string[] = [];
  for (const [n, name] of categoryOrder.entries()) {
    const ex = vcats.find((c) => c.name.toLowerCase() === name.toLowerCase()); if (!ex) newCats.push(name);
    vcatId.set(name, ex?.id ?? "(new)");
    if (apply) vcatId.set(name, must(`VIP category ${name}`, await saveVipCategory(repo, { name, sort: n, active: true }, ex?.id)).id);
  }
  const byKey = new Map<string, VipItem>();
  for (const i of vitems) { const k = norm(i.name); const cur = byKey.get(k); if (!cur || (!cur.active && i.active)) byKey.set(k, i); }
  const matched = new Set<string>(); const created: string[] = [], changed: string[] = []; let same = 0, sort = 0;
  for (const t of unique) {
    const ex = byKey.get(norm(t.name)); const n = sort++;
    if (!ex) created.push(`${t.category}: ${t.name}  ${formatNaira(t.priceKobo)}`);
    else {
      matched.add(ex.id);
      const exCat = vcats.find((c) => c.id === ex.categoryId)?.name.toLowerCase();
      if (ex.priceKobo !== t.priceKobo || !ex.active || exCat !== t.category.toLowerCase() || ex.available !== t.available) changed.push(`${ex.name}  ${formatNaira(ex.priceKobo)} -> ${formatNaira(t.priceKobo)}${exCat !== t.category.toLowerCase() ? `  (moved to ${t.category})` : ""}`); else same++;
    }
    if (apply) must(`VIP dish ${t.name}`, await saveVipItem(repo, {
      name: t.name, categoryId: vcatId.get(t.category), description: ex?.description || t.description, priceKobo: t.priceKobo,
      imageUrl: ex?.imageUrl ?? t.imageUrl, imageAlt: ex?.imageUrl ? ex.imageAlt : t.imageAlt, available: t.available, active: true, sort: n,
    }, ex?.id));   // a photo you uploaded for a VIP dish, and any description you wrote, are kept
  }
  const off: string[] = [], kept: string[] = []; const offIds = new Set<string>();
  for (const i of vitems) {
    if (matched.has(i.id) || !i.active) continue;
    if (OLD_VIP.has(norm(i.name))) { off.push(i.name); offIds.add(i.id); if (apply) must(`switch off ${i.name}`, await saveVipItem(repo, { ...i, active: false }, i.id)); } else kept.push(i.name);
  }
  const offCats: string[] = [];
  for (const c of vcats) {
    if (!c.active || categoryOrder.some((n) => n.toLowerCase() === c.name.toLowerCase())) continue;
    if (vitems.some((i) => i.categoryId === c.id && i.active && !offIds.has(i.id))) continue;
    offCats.push(c.name); if (apply) must(`switch off category ${c.name}`, await saveVipCategory(repo, { name: c.name, sort: c.sort, active: false }, c.id));
  }

  log(`\nVIP menu categories, in order: ${categoryOrder.join(", ")}${newCats.length ? `   (new: ${newCats.join(", ")})` : ""}`);
  log(`\nCREATED (${created.length}):`); created.forEach((x) => log(`  + ${x}`));
  log(`\nCHANGED (${changed.length}):`); changed.forEach((x) => log(`  ~ ${x}`));
  log(`\nSWITCHED OFF, old placeholder dishes (${off.length}):`); off.forEach((x) => log(`  - ${x}`));
  if (offCats.length) log(`Categories switched off because they are now empty: ${offCats.join(", ")}`);
  if (kept.length) log(`\nLEFT ALONE, VIP dishes that are not on the list (${kept.length}): ${kept.join(", ")}`);
  log(`\nUNCHANGED: ${same}.${INCLUDE_CAKES ? "" : " Cakes were left out of the VIP menu."}`);
  log(`The VIP menu will hold ${unique.length} dishes in ${categoryOrder.length} categories.`);
  log(apply ? "\nDone." : "\nDRY RUN finished: nothing was saved.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });