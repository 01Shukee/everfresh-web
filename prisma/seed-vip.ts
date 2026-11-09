import type { Repo } from "../src/server/repo";
import { saveVipCategory, saveVipItem, saveVipSettings } from "../src/server/vip/service";

type Log = (msg: string) => void;
const naira = (n: number) => n * 100; // money is stored as integer kobo
const must = (what: string, r: { status: number; body: unknown }) => { if (r.status >= 300) throw new Error(`Seeding ${what} failed: ${JSON.stringify(r.body)}`); return r.body as any; };

/** [name, price in naira, description, illustration file in public/media/food/illustrations (null = no picture yet)]
 *  PRICES: the first, second, fourth and sixth dishes follow the regular menu (rice N2,500 + protein, catfish N6,000); all others are SAMPLE prices. Edit them in Admin > VIP menu. */
type Dish = [string, number, string, string | null];
const MENU: [string, Dish[]][] = [
  ["Executive Rice Meals", [
    ["Everfresh Fried Rice and Turkey", 9_500, "Our signature high-end rice pairing: Everfresh fried rice served with turkey.", "fried-rice"],
    ["Jollof Rice with Grilled Chicken", 6_500, "A premium, flavourful alternative: jollof rice served with grilled chicken.", "jollof-rice"],
    ["Special Rice Dish", 4_500, "Rice served with a specialised side: Golden Yam, Plantain or Pepper Sauce. Tell us your choice in the special instructions.", null],
  ]],
  ["Premium Proteins and Grill", [
    ["Golden Fish Barbecue", 6_000, "Golden fish barbecue, prepared fresh. An upscale evening or dine-in option.", "grilled-catfish"],
    ["Grilled Chicken", 4_000, "Grilled chicken, prepared fresh. An upscale evening or dine-in option.", null],
    ["Peppered Gizzard", 3_000, "Specialty meat: peppered gizzard.", null],
    ["Peppered Snail", 5_000, "Specialty meat: peppered snail.", null],
    ["Seasoned Turkey", 7_000, "Specialty meat: seasoned turkey.", null],
  ]],
  ["Gourmet Snacks and Confectioneries", [
    ["Jippy Burger", 3_500, "Our premier enriched burger.", null],
    ["Milky Doughnuts", 1_000, "Enriched, premium milky doughnuts.", null],
    ["Meat Pies", 1_000, "Enriched, premium meat pies.", null],
    ["Shawarma", 3_500, "Available at the main grill station.", null],
    ["Ice Cream", 1_500, "Available at the main dessert station.", null],
  ]],
];

/** The 8 sample dishes the first seed added. If the VIP menu still holds only these, it is safe to replace them. */
const OLD_SAMPLE = new Set(["Jollof Rice", "Fried Rice", "Native Rice", "Egusi Soup with Garri", "Oha Soup with Fufu", "Grilled Catfish", "Catfish Pepper Soup", "Moi Moi"]);
const MARKER = "seed-vip-executive-v1";

/** Safe to re-run. It adds the executive menu once; it never overwrites VIP dishes you added or edited yourself, unless you run it with FORCE_VIP=1. */
export async function seedVip(repo: Repo, log: Log): Promise<void> {
  const force = process.env.FORCE_VIP === "1";
  if (!force && (await repo.docGet("meta", MARKER))) return log("VIP menu: executive menu already added, skipped");
  const cats = await repo.docList<{ id: string }>("vipcat"); const items = await repo.docList<{ id: string; name: string }>("vipitem");
  if (!force && items.some((i) => !OLD_SAMPLE.has(i.name))) return log("VIP menu: it already has your own dishes, skipped (run with FORCE_VIP=1 to replace them)");

  for (const i of items) await repo.docDelete("vipitem", i.id);
  for (const c of cats) await repo.docDelete("vipcat", c.id);
  // Starts as a static (read-only) menu; switch to WhatsApp ordering in Admin > VIP menu > Ordering and settings.
  if (!(await repo.docGet("settings", "vip"))) must("VIP settings", await saveVipSettings(repo, { enabled: true, mode: "static", title: "VIP Menu", tableLabel: "Table" }));

  let sort = 0, catSort = 0;
  for (const [name, dishes] of MENU) {
    const cat = must("VIP category", await saveVipCategory(repo, { name, sort: catSort++, active: true }));
    for (const [n, price, description, img] of dishes) {
      must("VIP item", await saveVipItem(repo, { name: n, categoryId: cat.id, description, priceKobo: naira(price), imageUrl: img ? `/media/food/illustrations/${img}.jpg` : null, imageAlt: img ? `Illustration of ${n}` : n, available: true, active: true, sort: sort++ }));
    }
  }
  await repo.docPut("meta", MARKER, { at: new Date().toISOString() });
  log(`VIP menu: ${MENU.length} categories, ${MENU.reduce((t, [, d]) => t + d.length, 0)} dishes (sample prices: please check them in the admin)`);
}