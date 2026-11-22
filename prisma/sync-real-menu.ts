// Brings the regular menu in line with the list the business supplied (22 Nov 2026).
// DRY RUN by default: it prints what it would do and saves nothing. Run with APPLY=1 to save.
// Dishes not on the list are switched off, never deleted. Cakes are left alone.
import { saveCategory, saveItem } from "../src/server/admin-api";
import { formatNaira } from "../src/lib/money";
import { getRepo } from "../src/server/runtime";

const naira = (n: number) => n * 100; // money is stored as integer kobo
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
const must = (what: string, r: { status: number; body: unknown }) => { if (r.status >= 300) throw new Error(`${what} failed: ${JSON.stringify(r.body)}`); return r.body as any; };

const protein = { name: "Add a protein", min: 0, max: 2, options: [["Chicken", 4_000], ["Chicken laps", 6_000], ["Chicken necks", 1_000], ["Beef", 2_000], ["Turkey", 7_000], ["Fried fish", 3_000]].map(([name, p]) => ({ name, priceKobo: naira(p as number) })) };
const swallow = { name: "Swallow", min: 1, max: 1, options: ["Fufu", "Semo", "Garri"].map((name) => ({ name, priceKobo: 0 })) };

type Kind = "protein" | "soup";
type Row = { name: string; price?: number; sizes?: [string, number][]; kind?: Kind };
const r = (name: string, price: number, kind?: Kind): Row => ({ name, price, kind });
const s = (name: string, sizes: [string, number][]): Row => ({ name, sizes });

const SECTIONS: { category: string; rows: Row[] }[] = [
  { category: "Rice and Pasta", rows: [r("Jollof rice", 2_500, "protein"), r("Fried rice", 2_500, "protein"), r("Goat meat rice", 6_500), r("Turkey rice", 7_500), r("Ghana rice", 3_500, "protein"), r("Coconut rice", 4_000, "protein"), r("Chisco rice", 3_000, "protein"), r("White rice", 2_500, "protein"), r("Ofada rice", 3_000, "protein"), r("Spaghetti", 2_500, "protein")] },
  { category: "Local Dishes", rows: [r("Beans and potatoes", 2_500, "protein"), r("Plantain porridge", 2_500, "protein"), r("Golden yam", 2_500, "protein"), r("Roasted yam", 3_000, "protein"), r("Plantain and Ukpaka", 3_000, "protein"), r("Moi moi", 1_000), r("Ukwa", 2_500, "protein"), r("Abacha", 2_500, "protein"), r("Fried plantain", 1_000)] },
  { category: "Stews and Sauces", rows: [r("Pepper stew", 2_500), r("Normal stew", 2_500), r("Tomato sauce", 2_500), r("Curry sauce", 4_500)] },
  { category: "Soups and Swallows", rows: [r("Egusi soup", 4_500, "soup"), r("Onugbo", 4_500, "soup"), r("Nsala soup", 4_500, "soup"), r("Oha soup", 4_500, "soup"), r("Okro soup", 4_500, "soup")] },
  { category: "Fish", rows: [r("Catfish pepper soup", 6_000), r("Grilled catfish", 6_000), r("Fried fish", 3_000)] },
  { category: "Chicken and Meat", rows: [r("Turkey", 7_000), r("Beef", 2_000), r("Chicken", 4_000), r("Chicken laps", 6_000), r("Chicken necks", 1_000)] },
  { category: "Snacks and Pastries", rows: [r("Meat pie", 1_800), r("Chicken pie", 1_800), r("Fish envelope", 1_500), r("Fish carrot pie", 1_500), r("Spanish roll", 1_200), r("Jumbo roll", 2_500), r("Jam pie", 3_000), r("Doughnut", 1_200), r("Burger", 3_500), r("Chop more", 1_500), r("Egg roll", 1_000), r("Puff puff", 100), r("Angel slice", 1_500), r("Popcorn", 1_000), r("Peanut", 3_500), r("Bottle chin chin", 3_500), s("Bucket chin chin", [["Small", 12_500], ["Big", 20_000]]), r("Foil cake", 2_500), r("Mini pizza", 5_000), r("Sausage roll", 1_500), r("Beef roll", 1_800), r("Coconut roll", 1_500), r("Cup cake", 300), r("Fruit bread", 2_000), r("Coconut bread", 2_000), r("Fish made", 1_300), r("Onion hot dog", 1_500), r("Sardine bread", 2_200), r("Milk bread", 2_000)] },
  { category: "Drinks", rows: [r("Soya milk", 1_500), r("Tiger nut", 3_000), r("Yoghurt", 3_000), r("Parfait", 5_000), s("Ice cream", [["Small", 500], ["Big", 4_000]]), s("Coke", [["Plastic", 500], ["Can", 700]]), s("Fanta", [["Plastic", 500], ["Can", 700]]), s("Sprite", [["Plastic", 600], ["Can", 1_500]]), r("Malt (can)", 700), s("Pocari Sweat", [["Plastic", 700], ["Can", 1_200]]), r("Fayrouz", 700), r("Schweppes", 3_000), r("Vitamilk", 3_000), r("Activa", 3_000), r("V-Smart", 3_000), r("V-Joy", 1_000), s("5-Alive Pulpy", [["Small", 2_500], ["Big", 3_000]]), r("Exotic", 3_500), r("Chivita Red Grape juice", 3_500), s("Chef-dee pineapple drink", [["Small", 2_000], ["Big", 4_000]]), s("Chef-dee watermelon drink", [["Small", 2_000], ["Big", 4_000]]), s("Chef-dee cucumber drink", [["Small", 2_000], ["Big", 4_000]]), r("Plastic watermelon drink", 1_500), r("Plastic pineapple drink", 1_500)] },
  { category: "Wines", rows: [r("Valets", 6_000), r("Chamdor", 10_000), r("Abganzla", 12_000), r("St. Lauren White", 12_000), r("Yellow tail", 12_000), r("Silk Spice", 15_000), r("Bellepere", 12_000), r("Martinellis", 12_000)] },
];

/** Existing dish names (normalised) that are the same dish as one on the list, under an older name. They are renamed in place, so their pictures stay. */
const ALIAS: Record<string, string> = { [norm("Egusi Soup with Garri")]: "Egusi soup", [norm("Oha Soup with Fufu")]: "Oha soup", [norm("Nsala Soup with Fufu")]: "Nsala soup", [norm("Bitter Leaf Soup with Semo")]: "Onugbo" };
const CAKE_CATEGORIES = new Set(["wedding cakes", "celebration cakes", "showpiece and custom cakes"]);
const priceText = (row: Row) => (row.sizes ? row.sizes.map(([n, p]) => `${n} ${formatNaira(naira(p))}`).join(" / ") : formatNaira(naira(row.price!)));
const describe = (row: Row) => (row.kind === "soup" ? "Served with your choice of fufu, semo or garri. Add a protein if you like." : row.kind === "protein" ? "Add a protein if you like." : "");

async function main() {
  const apply = process.env.APPLY === "1"; const log = console.log;
  const repo = await getRepo();
  const cats: any[] = await repo.listCategories(); const items: any[] = await repo.listItems();
  if (!cats.length && !items.length) throw new Error("The database looks empty, or DATABASE_URL is not set. Nothing was changed.");
  log(apply ? "APPLYING changes.\n" : "DRY RUN: nothing will be saved. Run again with APPLY=1 to save.\n");

  const catName = new Map(cats.map((c) => [c.id, String(c.name)]));
  const isCake = (i: any) => CAKE_CATEGORIES.has((catName.get(i.categoryId) ?? "").toLowerCase());
  const pool = items.filter((i) => !isCake(i));
  const keyOf = (n: string) => norm(ALIAS[norm(n)] ?? n);
  const byKey = new Map<string, any>();
  for (const i of pool) { const k = keyOf(i.name); const cur = byKey.get(k); if (!cur || (!cur.active && i.active)) byKey.set(k, i); }

  let catSort = Math.max(0, ...cats.map((c) => c.sort ?? 0)); const catId = new Map<string, string>();
  for (const sec of SECTIONS) {
    const found = cats.find((c) => String(c.name).toLowerCase() === sec.category.toLowerCase());
    if (found) { catId.set(sec.category, found.id); continue; }
    log(`new category: ${sec.category}`);
    catId.set(sec.category, apply ? must("category", await saveCategory(repo, { name: sec.category, sort: ++catSort, active: true })).id : "(new)");
  }

  const used = new Set<string>(); const created: string[] = [], changed: string[] = [], off: string[] = []; let same = 0, sort = 0;
  for (const sec of SECTIONS) for (const row of sec.rows) {
    const old = byKey.get(norm(row.name)); const base = row.sizes ? 0 : naira(row.price!);
    const groups = row.kind === "soup" ? [swallow, protein] : row.kind === "protein" ? [protein] : [];
    const payload = { ...(old ?? {}), name: row.name, categoryId: catId.get(sec.category), description: old && old.name === row.name && old.description ? old.description : describe(row),
      basePriceKobo: base, variants: (row.sizes ?? []).map(([name, p]) => ({ name, priceKobo: naira(p) })), addOnGroups: groups, tags: old?.tags ?? [], imageUrl: old?.imageUrl ?? null, imageAlt: old?.imageAlt || row.name, active: true, available: true, sort: sort++ };
    if (!old) created.push(`${row.name}  ${priceText(row)}`);
    else {
      used.add(old.id);
      if (old.name !== row.name || old.basePriceKobo !== base || old.categoryId !== payload.categoryId || !old.active) changed.push(`${old.name}${old.name !== row.name ? ` -> ${row.name}` : ""}  ${formatNaira(old.basePriceKobo)} -> ${priceText(row)}`); else same++;
    }
    if (apply) must(`dish ${row.name}`, await saveItem(repo, payload, old?.id));
  }
  for (const i of pool) if (i.active && !used.has(i.id)) { off.push(i.name); if (apply) must(`switch off ${i.name}`, await saveItem(repo, { ...i, active: false }, i.id)); }

  log(`\nCREATED (${created.length}):`); created.forEach((x) => log(`  + ${x}`));
  log(`\nCHANGED (${changed.length}):`); changed.forEach((x) => log(`  ~ ${x}`));
  log(`\nSWITCHED OFF, not on your list (${off.length}):`); off.forEach((x) => log(`  - ${x}`));
  log(`\nUNCHANGED: ${same}. Cakes were left alone.`);
  log(apply ? "\nDone." : "\nDRY RUN finished: nothing was saved.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });