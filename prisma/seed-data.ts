// SAMPLE DATA for a fresh Everfresh database.
// Everything here is stored through the SAME validated save functions the admin dashboard uses, so every record
// can be edited, replaced or deleted in /admin. Nothing is hardcoded into the frontend.
// Photos are the supplied Everfresh photos in public/media/* (referenced by /media/... path; replace them with
// the admin's "Upload photo" button or by pasting a new path/URL).
// Prices, fees, delivery areas, hours and programme details are SAMPLE values for review: change them in the admin.
// Safe to re-run: each area is seeded only while it is still empty, so admin edits are never overwritten or duplicated.
import { saveCategory, saveItem } from "../src/server/admin-api";
import { saveOrderingSettings } from "../src/server/ordering-settings";
import type { Repo } from "../src/server/repo";
import { saveCateringContent, saveGallery } from "../src/server/catering/service";
import { defaultSettings, saveSection, type Section } from "../src/server/site/settings";
import { saveVipCategory, saveVipItem, saveVipSettings } from "../src/server/vip/service";
import { saveContent, saveMedia } from "../src/server/voc/admin";
import { saveInstitute } from "../src/server/voc/institute";

type Log = (msg: string) => void;
const m = (p: string) => `/media/${p}.jpg`;
const naira = (n: number) => n * 100; // money is stored as integer kobo
const must = (what: string, r: { status: number; body: unknown }) => { if (r.status >= 300) throw new Error(`Seeding ${what} failed: ${JSON.stringify(r.body)}`); return r.body as any; };
const mustOk = (what: string, r: { ok: boolean } & Record<string, any>) => { if (!r.ok) throw new Error(`Seeding ${what} failed: ${r.error}`); };

// ---------------------------------------------------------------- food menu (cakes use the supplied photos; Nigerian dishes use illustrations)
const flavour = { name: "Flavour", min: 1, max: 1, options: [{ name: "Vanilla", priceKobo: 0 }, { name: "Chocolate", priceKobo: 0 }, { name: "Orange", priceKobo: 0 }, { name: "Red velvet", priceKobo: naira(10_000) }] };
const extras = { name: "Extras", min: 0, max: 2, options: [{ name: "Cake topper", priceKobo: naira(5_000) }, { name: "Sugar flowers", priceKobo: naira(15_000) }] };
const CATEGORIES = [{ key: "wedding", name: "Wedding Cakes" }, { key: "celebration", name: "Celebration Cakes" }, { key: "showpiece", name: "Showpiece and Custom Cakes" }];
type Sz = [string, number];
type MenuSeed = { cat: string; name: string; description: string; sizes?: Sz[]; price?: number; groups: any[]; tags: string[]; img: string; alt: string };
const ITEMS: MenuSeed[] = [
  { cat: "wedding", name: "Classic White Wedding Cake", description: "Pearl-detailed white tiers finished with white roses and a Mr and Mrs topper. Baked to order in the flavour you choose.", sizes: [["Two-tier (serves about 40)", 120_000], ["Three-tier (serves about 80)", 210_000]], groups: [flavour, extras], tags: ["wedding", "tiered"], img: "food/classic-white-wedding-cake", alt: "Two-tier white wedding cake with pearl detail, white roses and a Mr and Mrs topper" },
  { cat: "wedding", name: "Gold-Accent Wedding Cake", description: "Smooth white tiers with hand-placed gold accents, white roses and a Mr and Mrs topper.", sizes: [["Two-tier (serves about 40)", 130_000], ["Three-tier (serves about 80)", 225_000]], groups: [flavour, extras], tags: ["wedding", "tiered"], img: "food/gold-accent-wedding-cake", alt: "Two-tier white cake with gold accents, white roses and a Mr and Mrs topper" },
  { cat: "wedding", name: "Rustic White Rose Cake", description: "A softly textured white cake dressed with white roses and greenery for an understated, elegant table.", sizes: [["Two-tier (serves about 40)", 110_000], ["Three-tier (serves about 80)", 190_000]], groups: [flavour, extras], tags: ["wedding", "tiered"], img: "food/rustic-white-rose-cake", alt: "Two-tier textured white cake decorated with white roses and a Mrs topper" },
  { cat: "wedding", name: "Monogram Wedding Cake", description: "White tiers with a gold monogram of the couple's initials and white roses.", sizes: [["Two-tier (serves about 40)", 125_000], ["Three-tier (serves about 80)", 215_000]], groups: [flavour, extras], tags: ["wedding", "tiered"], img: "food/monogram-wedding-cake", alt: "Two-tier white cake with a gold monogram and white roses" },
  { cat: "celebration", name: "Yellow Floral Celebration Cake", description: "A fresh, bright two-tier cake with yellow flowers and greenery. Ideal for birthdays and anniversaries.", sizes: [["6-inch", 25_000], ["8-inch", 35_000], ["10-inch", 48_000]], groups: [flavour, extras], tags: ["celebration", "birthday"], img: "food/yellow-floral-celebration-cake", alt: "Two-tier white celebration cake decorated with yellow flowers and greenery" },
  { cat: "celebration", name: "Textured Gold-Leaf Cake", description: "Three textured white tiers with hand-applied gold leaf and deep red roses.", sizes: [["Three-tier (serves about 70)", 160_000], ["Four-tier (serves about 110)", 240_000]], groups: [flavour], tags: ["celebration", "tiered"], img: "food/textured-gold-leaf-cake", alt: "Three-tier textured white cake with gold leaf and red roses" },
  { cat: "celebration", name: "Chocolate and Vanilla Bead-Trim Cake", description: "A white vanilla cake on a rich chocolate base, trimmed with red beads.", sizes: [["8-inch", 40_000], ["10-inch", 55_000]], groups: [extras], tags: ["celebration", "chocolate"], img: "food/chocolate-vanilla-bead-trim-cake", alt: "White round cake with red bead trim on a square chocolate cake base" },
  { cat: "showpiece", name: "Gold Four-Tier Showpiece Cake", description: "A statement cake in gold with metallic detailing and bead trim. Made to order: please order well ahead.", price: 350_000, groups: [], tags: ["showpiece", "custom"], img: "food/gold-four-tier-showpiece-cake", alt: "Gold four-tier showpiece cake with silver detailing and red bead trim" },
  { cat: "showpiece", name: "Emerald Green Tiered Cake", description: "Four square emerald tiers with ornate gold detail. Made to order: please order well ahead.", price: 300_000, groups: [], tags: ["showpiece", "custom"], img: "food/emerald-green-tiered-cake", alt: "Four-tier emerald green cake with ornate gold detail" },
  { cat: "showpiece", name: "Gravity Snack Cake", description: "A tiered gravity cake with a snack pouring down the front. Colours and theme can be customised.", sizes: [["Standard", 85_000], ["Large", 130_000]], groups: [], tags: ["showpiece", "custom"], img: "food/gravity-snack-cake", alt: "Tiered blue and orange gravity cake with snacks pouring down the front" },
];
// Everfresh's real menu, with the prices the business supplied. No photos of these dishes were supplied, so they use drawn
// illustrations (public/media/food/illustrations/): replace each with a real photo from Admin > Menu items when you have one.
// Flyer items that have no price yet are NOT seeded (the admin refuses a price of zero): add them in Admin > Menu items.
const protein = { name: "Add a protein", min: 0, max: 2, options: [{ name: "Chicken", priceKobo: naira(4_000) }, { name: "Ice fish", priceKobo: naira(3_000) }, { name: "Beef", priceKobo: naira(2_000) }, { name: "Turkey", priceKobo: naira(7_000) }] };
const NG_CATEGORIES = [{ key: "rice", name: "Rice and Pasta" }, { key: "local", name: "Local Dishes" }, { key: "soups", name: "Soups and Swallows" }, { key: "fish", name: "Fish" }];
const ill = (n: string) => `food/illustrations/${n}`;
const dish = (cat: string, name: string, price: number, description: string, img: string, alt: string, tags: string[], groups: any[] = [protein]): MenuSeed => ({ cat, name, price, description, groups, tags, img: ill(img), alt: `Illustration of ${alt}` });
const NG_ITEMS: MenuSeed[] = [
  dish("rice", "Jollof Rice", 2_500, "Freshly cooked jollof rice. Add a protein if you like.", "jollof-rice", "jollof rice with fried plantain and tomato slices", ["rice"]),
  dish("rice", "White Rice and Sauce", 2_500, "White rice served with sauce. Add a protein if you like.", "rice-and-stew", "white rice with red sauce", ["rice"]),
  dish("rice", "Fried Rice", 2_500, "Freshly cooked fried rice. Add a protein if you like.", "fried-rice", "fried rice with vegetables and fried plantain", ["rice"]),
  dish("rice", "Native Rice", 3_000, "Native rice served with sauce. Add a protein if you like.", "ofada-rice", "native rice beside a bowl of green sauce", ["rice", "local"]),
  dish("rice", "Spaghetti", 2_500, "Spaghetti in tomato sauce. Add a protein if you like.", "spaghetti", "spaghetti in tomato sauce", ["pasta"]),
  dish("local", "Abacha", 2_500, "Abacha (African salad). Add a protein if you like.", "abacha", "abacha, the African salad", ["local"]),
  dish("local", "Ukwa", 2_500, "Ukwa (African breadfruit seed). Add a protein if you like.", "ukwa", "a bowl of ukwa", ["local"]),
  dish("local", "Plantain Porridge", 2_500, "Plantain porridge. Add a protein if you like.", "plantain-porridge", "a bowl of plantain porridge", ["local"]),
  dish("local", "Beans and Yam Porridge", 2_500, "Beans and yam porridge. Add a protein if you like.", "beans-yam-porridge", "a bowl of beans and yam porridge", ["local"]),
  dish("local", "Golden Yam", 2_500, "Fried golden yam. Add a protein if you like.", "golden-yam", "golden fried yam with a pepper sauce", ["local"]),
  dish("local", "Moi Moi", 1_000, "Moi moi (bean pudding).", "moi-moi", "moi moi wrapped in leaf with a boiled egg slice", ["local"], []),
  dish("soups", "Bitter Leaf Soup with Semo", 4_500, "Bitter leaf soup served with semo and 1 beef. Add a protein if you like.", "bitter-leaf-soup", "bitter leaf soup with a ball of semo", ["soup", "swallow"]),
  dish("soups", "Egusi Soup with Garri", 4_500, "Egusi soup served with garri and 1 beef. Add a protein if you like.", "egusi-garri", "egusi soup with a ball of garri", ["soup", "swallow"]),
  dish("soups", "Oha Soup with Fufu", 4_500, "Oha soup served with fufu and 1 beef. Add a protein if you like.", "oha-soup", "oha soup with a ball of fufu", ["soup", "swallow"]),
  dish("soups", "Nsala Soup with Fufu", 4_500, "Nsala soup served with fufu and 1 beef. Add a protein if you like.", "nsala-soup", "nsala soup with a ball of fufu", ["soup", "swallow"]),
  dish("fish", "Catfish Pepper Soup", 6_000, "Hot, aromatic catfish pepper soup.", "catfish-pepper-soup", "a steaming bowl of catfish pepper soup", ["fish", "soup", "spicy"], []),
  dish("fish", "Grilled Catfish", 6_000, "Whole grilled catfish.", "grilled-catfish", "a grilled catfish with onion rings and tomato", ["fish", "grill"], []),
];
/** The earlier SAMPLE Nigerian dishes (invented prices) that some databases already hold. They are hidden, not deleted, when the real menu is added. */
const SAMPLE_NAMES = new Set(["Party Jollof Rice", "Nigerian Fried Rice", "Ofada Rice and Ayamase Sauce", "White Rice and Stew", "Egusi Soup", "Efo Riro", "Ogbono Soup", "Goat Meat Pepper Soup", "Beef Suya", "Peppered Chicken", "Small Chops Platter", "Moi Moi", "Puff Puff", "Chin Chin", "Meat Pie", "Akara", "Zobo Drink", "Chapman", "Kunu"]);
async function retireSampleDishes(repo: Repo) {
  for (const i of await repo.listItems()) if (i.tags.includes("nigerian") && i.imageUrl?.startsWith("/media/food/illustrations/") && SAMPLE_NAMES.has(i.name) && i.active) must("hide sample dish", await saveItem(repo, { ...i, active: false }, i.id));
}

/** Adds categories (reusing any with the same name) and items after whatever the menu already holds. */
async function addMenuGroup(repo: Repo, cats: { key: string; name: string }[], items: MenuSeed[]) {
  const existing = await repo.listCategories(); const ids = new Map<string, string>();
  let catSort = Math.max(0, ...existing.map((c) => c.sort)); let sort = Math.max(-1, ...(await repo.listItems()).map((i) => i.sort ?? 0)) + 1;
  for (const c of cats) { const same = existing.find((e) => e.name.toLowerCase() === c.name.toLowerCase()); ids.set(c.key, same ? same.id : must("category", await saveCategory(repo, { name: c.name, sort: ++catSort, active: true })).id); }
  for (const i of items) must("menu item", await saveItem(repo, {
    name: i.name, categoryId: ids.get(i.cat), description: i.description, basePriceKobo: i.sizes ? 0 : naira(i.price!), variants: (i.sizes ?? []).map(([name, p]) => ({ name, priceKobo: naira(p) })),
    addOnGroups: i.groups, tags: i.tags, imageUrl: m(i.img), imageAlt: i.alt, active: true, available: true, sort: sort++,
  }));
}
async function seedMenu(repo: Repo, log: Log) {
  const cats = await repo.listCategories(); const empty = !cats.length && !(await repo.listItems()).length;
  const hadSample = !!(await repo.docGet("meta", "seed-nigerian-menu"));
  // The real menu goes in on an empty menu, on a menu that only holds the sample cakes, or on one that has the earlier sample dishes (which are then hidden).
  if (await repo.docGet("meta", "seed-everfresh-menu")) log("Everfresh menu: already added, skipped");
  else if (empty || hadSample || cats.some((c) => c.name === CATEGORIES[0].name)) {
    if (hadSample) await retireSampleDishes(repo);
    await addMenuGroup(repo, NG_CATEGORIES, NG_ITEMS); await repo.docPut("meta", "seed-everfresh-menu", { at: new Date().toISOString() });
    log(`Everfresh menu: ${NG_ITEMS.length} dishes with your prices${hadSample ? " (the earlier sample dishes were hidden)" : ""}`);
  } else log("Everfresh menu: menu already has your own content, skipped");
  if (!empty) return log("cake menu: menu already has content, skipped");
  await addMenuGroup(repo, CATEGORIES, ITEMS); log(`cake menu: ${CATEGORIES.length} categories, ${ITEMS.length} cakes with photos`);
}

// ---------------------------------------------------------------- delivery, pickup, scheduling, promos
async function seedOrdering(repo: Repo, log: Log) {
  if (await repo.docGet("settings", "ordering")) return log("delivery and pickup: already configured, skipped");
  const r = await saveOrderingSettings(repo, {
    zones: [{ name: "Zone A: near the kitchen (up to 5 km)", feeKobo: naira(1_000), minOrderKobo: naira(5_000) }, { name: "Zone B: mid-range (5 to 12 km)", feeKobo: naira(2_000), minOrderKobo: naira(8_000) }, { name: "Zone C: far (over 12 km)", feeKobo: naira(3_500), minOrderKobo: naira(12_000) }],
    pickupLocations: [{ name: "Everfresh Kitchen", address: "Main kitchen pickup counter (see the Contact page for the address)" }],
    scheduling: { enabled: true, leadMinutes: 1_440, maxDaysAhead: 30, hours: { open: "08:00", close: "19:00" } },
    // Created switched OFF so no discount is live until the owner decides to turn it on.
    promos: [{ code: "WELCOME10", type: "percent", value: 10, minOrderKobo: naira(5_000), maxDiscountKobo: naira(2_000), active: false }],
  });
  mustOk("delivery and pickup settings", r as any); log("delivery and pickup: 3 delivery areas, 1 pickup point, scheduling rules, 1 promo code (switched off)");
}

// ---------------------------------------------------------------- website content (about, homepage, contact, FAQs)
const SITE = {
  business: { description: "Everfresh brings three services together: freshly made cakes and food to order, hands-on vocational training in baking and catering, and event catering for celebrations of every size." },
  contact: { hours: ["Monday to Saturday, 8:00am to 7:00pm", "Sunday: closed"], address: "No 1 Regent Street, Nnewi", city: "Nnewi" },
  about: {
    intro: "Everfresh is a food and training business. We bake to order, teach practical baking and catering skills, and cater events from small family celebrations to large gatherings.",
    mission: "To serve fresh, well-made food, and to help people turn passion into a practical skill they can build a living on.",
    values: ["Freshness in every order", "Skill learned by doing", "Clear prices and honest quotations", "Respect for every customer and student", "Care in how we present and serve"],
    history: "Everfresh Creations Ltd serves customers through three connected services: a cake and food ordering kitchen, a vocational school for baking and catering, and an event catering team.\n\nOur trainees learn by making real cakes and food, and present their work at showcase events. Photos from those events are in the galleries on this site.",
    foodInfo: "Order cakes online for delivery or pickup, now or scheduled for the date you need. Every cake is made to order.",
    vocationalInfo: "The Vocational Institute in Nnewi offers a 3-year Regular Programme and Intensive programmes from 1 month to 1 year, taught through hands-on practice.",
    cateringInfo: "Tell us the date, place and number of guests, and we will prepare a quotation for your event.",
    credentials: [] as string[],
    photos: [
      { url: m("training/trainees-chef-whites-red-carpet"), alt: "Group of trainees in white chef jackets on a red carpet", caption: "Our trainees at a showcase event." },
      { url: m("training/training-kitchen-classroom-wide"), alt: "Training hall full of students wearing green caps, seated at long tables", caption: "A full training session." },
      { url: m("projects/three-tier-brown-cake-gold-gourd"), alt: "Three-tier brown cake with coral bead trim and a gold gourd topper", caption: "Student work: a sculpted showpiece cake." },
      { url: m("catering/venue-entrance-gold-red-drapes-b"), alt: "Guests and staff gathered under gold and red drapes at a decorated venue entrance", caption: "A decorated venue for one of our events." },
      { url: m("projects/student-smiling-tiered-brown-cake"), alt: "Smiling trainee in a chef jacket standing behind a tiered brown cake", caption: "A trainee with her finished cake." },
      { url: m("catering/team-with-cake-display-table"), alt: "Team in lime-green tops beside a table of white and showpiece cakes", caption: "Cakes on display at a showcase." },
      { url: m("food/classic-white-wedding-cake"), alt: "Two-tier white wedding cake with white roses", caption: "From our kitchen: a wedding cake." },
      { url: m("training/instructor-leading-class-green-caps"), alt: "Instructor leading a class of students in green caps", caption: "Practical classroom teaching." },
    ],
  },
  homepage: {
    benefits: ["Made fresh to order", "Delivery or pickup, now or scheduled", "Secure online payment", "Hands-on training, learned by doing", "Clear quotations for every event"],
    heroImages: {
      food: { url: m("food/classic-white-wedding-cake"), alt: "Two-tier white wedding cake with white roses and a Mr and Mrs topper" },
      studies: { url: m("projects/student-smiling-tiered-brown-cake"), alt: "Smiling trainee in a chef jacket standing behind a tiered brown cake" },
      catering: { url: m("catering/ceremony-red-carpet-under-tree"), alt: "Guests gathered on a red carpet under marquee tents at an event" },
    },
    featured: [
      { kind: "food", title: "Textured gold-leaf cake", caption: "Three tiers, hand-applied gold leaf", url: m("food/textured-gold-leaf-cake"), alt: "Three-tier textured white cake with gold leaf and red roses" },
      { kind: "project", title: "Gold gourd showpiece", caption: "Sculpted by our trainees", url: m("projects/gold-gourd-cake-braid-stand"), alt: "Brown block cake topped with a gold gourd, red bead trim and a braided stand" },
      { kind: "event", title: "Decorated venue", caption: "Gold and red drapes", url: m("catering/venue-entrance-gold-red-drapes-b"), alt: "Guests and staff gathered under gold and red drapes at a decorated venue entrance" },
      { kind: "student", title: "Showcase day", caption: "A trainee and her cake", url: m("projects/student-emerald-cake"), alt: "Trainee in chef whites beside an emerald green tiered cake" },
      { kind: "food", title: "Gold four-tier showpiece", caption: "Made to order", url: m("food/gold-four-tier-showpiece-cake"), alt: "Gold four-tier showpiece cake with silver detailing and red bead trim" },
      { kind: "event", title: "Wedding cakes on display", caption: "Showcase tables", url: m("catering/wedding-cakes-green-red-cloths"), alt: "Team behind tables of white cakes dressed in red and green cloths" },
      { kind: "project", title: "Gravity cake", caption: "Snack-themed", url: m("projects/orange-teal-gravity-cake-snack-theme"), alt: "Orange and teal tiered cake with snacks pouring down the front" },
      { kind: "student", title: "Trainees at the showcase", caption: "In chef whites", url: m("training/trainees-chef-whites-red-carpet"), alt: "Group of trainees in white chef jackets on a red carpet" },
    ],
  },
  faqs: [
    { q: "How do I place a food order?", a: "Open Order Food, choose your items, then pick delivery or pickup and pay online. You can order now or schedule for later." },
    { q: "Can I schedule an order in advance?", a: "Yes. Choose a date and time at checkout. Scheduled orders need at least 24 hours' notice and can be booked up to 30 days ahead." },
    { q: "How does delivery work, and what does it cost?", a: "Delivery fees depend on your delivery area and are shown at checkout before you pay. You can also collect your order from our pickup point." },
    { q: "How do I pay?", a: "You pay securely online by card or bank transfer at checkout." },
    { q: "How do I apply for a vocational programme?", a: "Choose a programme, complete the application form and pay the ₦5,000 application-form fee. The fee is non-refundable and is deducted from your total fees. Your programme invoice appears automatically once the payment is confirmed, and you pay the balance there." },
    { q: "How do I get a quotation for an event?", a: "Open Event Catering and fill in the quotation form with your date, place, number of guests and needs. Your request opens in WhatsApp: press Send so it reaches us." },
    { q: "Can I track my order or application?", a: "Yes. Use the private link we sent you, or use \"Find my order or application\" at the bottom of any page." },
  ].map((f, sort) => ({ ...f, published: true, sort })),
};
async function seedSite(repo: Repo, log: Log) {
  const stored = async (s: Section) => ((await repo.docGet<Record<string, unknown>>("site", "main")) ?? {})[s] !== undefined;
  const d = defaultSettings(); const done: string[] = [];
  const put = async (s: Section, raw: unknown) => { if (await stored(s)) return; const r = await saveSection(repo, s, raw); mustOk(`site/${s}`, r as any); done.push(s); };
  await put("business", { ...d.business, ...SITE.business });
  await put("contact", { ...d.contact, ...SITE.contact }); // keeps the supplied phone and WhatsApp number
  await put("about", SITE.about);
  await put("homepage", SITE.homepage);
  await put("faqs", SITE.faqs);
  if (!(await repo.docGet("meta", "seed-institute-address"))) {
    const st = ((await repo.docGet<Record<string, any>>("site", "main")) ?? {}).contact;
    if (st && !st.address) { const r = await saveSection(repo, "contact", { ...st, address: "No 1 Regent Street, Nnewi", city: st.city ?? "Nnewi" }); mustOk("site/contact address", r as any); done.push("address"); }
    await repo.docPut("meta", "seed-institute-address", { at: new Date().toISOString() });
  }
  log(done.length ? `website content: ${done.join(", ")}` : "website content: already configured, skipped");
}

// ---------------------------------------------------------------- vocational studies (the Vocational Institute, Nnewi)
// Fees, requirements and courses come from the institute's fee sheet. Markers: [hostel]/[day] = that student type only, [yearly] = later years, [graduation] = due at graduation.
const REG_FEES = [
  ["Acceptance fee", "other", 5_000, "Paid first when you apply; it is part of the total and is credited on your invoice"], ["Tuition and registration", "tuition", 35_000], ["Hostel fee", "accommodation", 20_000, null, "hostel"], ["Practical wear", "other", 7_500], ["Exam", "other", 5_000],
  ["I.D card", "other", 5_000], ["Sanitation", "other", 5_000], ["Practical fees", "other", 20_000], ["Uniform", "other", 8_000], ["Matriculation fees", "other", 10_000],
  ["Hostel fee (each later year)", "accommodation", 20_000, null, "hostel", "yearly"], ["Tuition (each later year)", "tuition", 35_000, null, null, "yearly"], ["Practical fee (each later year)", "other", 20_000, null, null, "yearly"], ["Exam (each later year)", "other", 5_000, null, null, "yearly"], ["Maintenance (each later year)", "other", 5_000, null, null, "yearly"],
] as const;
const feeLines = (rows: readonly (readonly (string | number | null)[])[]) => rows.map(([label, kind, naira_, note, appliesTo, phase]) => ({ label, kind, amountKobo: naira(naira_ as number), note: note ?? null, appliesTo: appliesTo ?? "all", phase: phase ?? "intake" }));
const REG_REQUIREMENTS = ["4 passport photographs", "2 office files", "Medical lab results: HIV, Hepatitis B and C, VDRL, physical fitness, blood group and genotype (lab tests: Santa Maria Diagnosis, opposite Teaching Hospital, Nnewi, 08132556284)", "2 Cornerstone tissue and 2 packs of 1 kg detergent", "1 original mop and 1 tile brush", "Result (WAEC or NECO)", "Identification letter (L.G.A. or church)", "1 Bible (compulsory)", "File all documents, originals and photocopies, and bring them to the admission desk"];
const INT_REQUIREMENTS = ["1 passport photograph and 1 office file", "Medical lab results: HIV, genotype and blood group", "2 Cornerstone tissue, 2 packs of 1 kg detergent, 1 tile broom and 1 packet of whiteboard marker", "Result and identification letter", "File all documents, originals and photocopies, and bring them to the admission desk"];
const INT_FEES = [["Practical wear", "other", 5_000], ["Graduation and project fee", "other", 50_000, "Payable on the date of graduation", null, "graduation"]] as const;
const named = (names: string[]) => names.map((name) => ({ name, description: null, role: "included" as const, priceKobo: null }));
const pickable = (rows: [string, number | null][]) => rows.map(([name, p]) => ({ name, description: null, role: "choice" as const, priceKobo: p === null ? null : naira(p) }));
const INSTITUTE_PROGRAMMES: Record<string, any> = {
  "regular-3y": { summary: "The Regular Programme runs for 3 years at the Vocational Institute, Nnewi. Year 1 is the new-intake year; fees for later years are charged yearly. Students can attend as day students or in the hostel.", fees: feeLines(REG_FEES), requirements: REG_REQUIREMENTS, accommodation: { available: true, note: "Hostel students also bring: foam, 2 pots, 2 buckets, a stove, a cupboard, a 1-gallon container for water, food stuff and similar items." } },
  "intensive-1m": { summary: "A one-month intensive training in one course of your choice. The price depends on the course you choose.", courses: pickable([["Varieties of Food", 150_000], ["Pastries", 150_000], ["Craft", 100_000], ["Cosmetology", 70_000], ["Hair styling", 70_000], ["Decoration", 70_000], ["Cocktails, Smoothies, Juices etc.", 100_000], ["Make-up and Gele tying", 100_000]]), choose: 1, fees: feeLines(INT_FEES) },
  "intensive-3m": { summary: "A three-month intensive package covering pastries, sugar craft, bread, continental and intercontinental dishes, barbecue and fashion design.", courses: named(["Pastries", "Sugar craft", "Bread", "Varieties of food (Continental and Intercontinental)", "Barbecue", "Fashion design"]), fees: feeLines([["Tuition", "tuition", 350_000], ...INT_FEES]) },
  "intensive-6m": { summary: "A six-month intensive package covering pastries, sugar craft, continental and intercontinental dishes and barbecue.", courses: named(["Pastries", "Sugar craft", "Varieties of dish (Continental and Intercontinental)", "Barbecue (varieties)"]), fees: feeLines([["Tuition", "tuition", 500_000], ...INT_FEES]) },
  "intensive-1y": { summary: "The complete one-year package: all of the six-month training, plus any two more courses of your choice.", courses: [...named(["Complete package: everything in the 6-month training (pastries, sugar craft, dishes and barbecue)"]), ...pickable([["Cosmetology", null], ["Craft", null], ["Hair styling", null], ["Bead making", null], ["Fashion design", null], ["Decoration", null]])], choose: 2, fees: feeLines([["Tuition", "tuition", 750_000], ...INT_FEES]) },
  "intensive-special": { summary: "Short specialist courses. Choose one: shawarma and pizza, yogurt, ice cream, or fashion (male and female).", courses: pickable([["Shawarma and Pizza", 350_000], ["Yogurt", 350_000], ["Ice cream", 350_000], ["Fashion (male and female)", 200_000]]), choose: 1, fees: feeLines(INT_FEES) },
};
const OLD_SAMPLE_SUMMARIES = ["A three-year programme that builds your skills step by step, from kitchen fundamentals to advanced cake design and event service, with practical assessments throughout and a final showcase project.", "A one-month, hands-on course for learning a single skill quickly. Ideal if you want to start making and selling cakes and small chops soon.", "A three-month course that covers cake decoration and pastry in depth, with regular practical sessions and a final presentation of your work.", "A six-month course for serious learners: advanced cake decoration, sculpted showpiece cakes, pastry and the basics of event catering, finishing with a showcase of your work."];
const OLD_SAMPLE_PROGRAMME_NOTE = "Intake dates are confirmed by admissions after you apply.";
const INSTITUTE = { name: "Vocational Institute", address: "No 1 Regent Street, Nnewi", phones: ["08101032983", "08083143342", "08035006435", "08038472422", "09033697799"], note: "For confirmation: Engr. Ibezim Ojukwu 08133300777" };
async function seedVocational(repo: Repo, log: Log) {
  const done: string[] = [];
  const force = process.env.FORCE_VOC === "1";
if (force || !(await repo.docGet("meta", "seed-institute-v1"))) {
    for (const [id, c] of Object.entries(INSTITUTE_PROGRAMMES)) {
      const cur = await repo.docGet<any>("content", id);
      // Replace missing content or my earlier SAMPLE content; keep anything the owner has written themselves.
      if (!force && cur && cur.summary && !OLD_SAMPLE_SUMMARIES.includes(cur.summary)) { log(`  programme ${id}: you have edited it, so it was kept`); continue; }
      const carry = !force && id === "regular-3y" && cur
  ? {
      courses: cur.courses,
      curriculum: cur.curriculum,
      benefits: cur.benefits,
    }
  : {
      courses: [],
      curriculum: [],
      benefits: [],
    };
      must(`programme ${id}`, await saveContent(repo, id, { open: true, published: true, intakeNote: OLD_SAMPLE_PROGRAMME_NOTE, ...carry, ...c, requirements: id === "regular-3y" ? REG_REQUIREMENTS : INT_REQUIREMENTS, accommodation: c.accommodation ?? { available: null, note: null } })); done.push(id);
    }
    await repo.docPut("meta", "seed-institute-v1", { at: new Date().toISOString() });
  }
  if (force || !(await repo.docGet("settings", "institute"))) { must("institute details", await saveInstitute(repo, INSTITUTE)); done.push("institute details"); }
  log(done.length ? `vocational institute: ${done.join(", ")}` : "vocational institute: already configured, skipped");
  if ((await repo.docList("portfolio")).length) log("vocational photos: already has content, skipped");
  else { let sort = 0; for (const [kind, title, caption, img, alt] of PORTFOLIO) must("portfolio photo", await saveMedia(repo, "portfolio", { kind, title, caption, imageUrl: m(img), imageAlt: alt, variantId: null, published: true, sort: sort++ })); log(`vocational photos: ${PORTFOLIO.length}`); }
  if ((await repo.docList("testimonial")).length) return log("testimonials: already has content, skipped");
  // Drafts only: never published, permission not recorded. A testimonial must be a real student's words with written permission.
  for (const [quote, relation] of [["Replace this sample with a real student's words, then record their permission and publish it.", "Sample · Regular Programme"], ["Replace this sample with a real graduate's words, then record their permission and publish it.", "Sample · Intensive Programme"]]) must("testimonial", await saveMedia(repo, "testimonial", { quote, name: "Sample student", relation, permission: false, published: false }));
  log("testimonials: 2 unpublished sample drafts");
}
// kind, title, caption, image (relative to /media), alt. Order matters: the Vocational Studies hero uses the first project, instructor and facility.
type P = [string, string, string, string, string];
const PORTFOLIO: P[] = [
  ["project", "Gold gourd cake on a braided stand", "A sculpted showpiece with a gold gourd topper, bead-style trim and a braided support.", "projects/gold-gourd-cake-braid-stand", "Brown block cake topped with a gold gourd, red bead trim and a braided stand"],
  ["project", "Textured cap cake with berry filling", "A sculpted cake with a gold-flecked textured finish and a cut-away showing a berry filling.", "projects/textured-cap-cake-berry-filling", "Sculpted textured cake with pink ruffle trim and a cut-away showing berry filling"],
  ["project", "Gold chest cake with bead trim", "A chest-shaped cake in brown fondant with red bead-style trim and a gold topper.", "projects/gold-gourd-chest-cake-bead-trim", "Brown chest-shaped cake with red bead trim and a gold topper"],
  ["project", "Treasure chest cake with bottle topper", "A chest-shaped cake with gold detailing and a hand-modelled green bottle on top.", "projects/treasure-chest-cake-green-bottle", "Brown chest-shaped cake with gold detailing and a green bottle topper"],
  ["project", "Snack-themed gravity cake", "An orange and teal tiered cake with a snack-pouring gravity effect.", "projects/orange-teal-gravity-cake-snack-theme", "Orange and teal tiered cake with snacks pouring down the front"],
  ["project", "Chocolate cube cake with gold gourd", "A glossy chocolate cube cake finished with a gold gourd, roses and greenery.", "projects/chocolate-cube-cake-gold-gourd-roses", "Dark chocolate cube cake topped with a gold gourd, roses and greenery"],
  ["project", "Round sculpted cake with red bead trim", "A rich brown cake with a sculpted gold-brown topper and cascading red beads.", "projects/round-sculpted-cake-red-bead-trim", "Round brown cake with a textured gold topper and cascading red beads"],
  ["project", "Gold sculpted cake with biscuit sticks", "A white cake with gold detail, red beads and a fence of biscuit sticks.", "projects/gold-sculpted-cake-biscuit-sticks", "White cake with a gold sculpted top, red beads and biscuit sticks"],
  ["project", "Stacked brown cylinder cake", "Layered brown cylinders with white bands on a glossy brown base.", "projects/brown-cylinder-stacked-cake", "Stacked brown cylinder cake with white bands on a glossy brown base"],
  ["project", "Gourd cakes on brown blocks", "Two sculpted cakes with gold gourd toppers, bead trim and a modelled braid.", "projects/two-gourd-cakes-brown-blocks", "Two brown block cakes with gold gourd toppers and a modelled braid"],
  ["project", "Four-tier cake with gold leaf", "Four brown tiers with gold leaf and red bead garlands.", "projects/four-tier-brown-gold-leaf-cake", "Four-tier brown cake with gold leaf and red bead garlands"],
  ["project", "Cake on a red bead pedestal", "A two-tier cake with a framed medallion, raised on a red bead pedestal.", "projects/two-tier-cake-red-bead-pedestal", "Two-tier white and dark red cake with a gold framed medallion on a red bead pedestal"],
  ["project", "Red sculpture cake in a gold frame", "A sculpted red form inside a gold frame, on a bright green tier.", "projects/red-sculpture-cake-gold-frame", "Red sculpted cake inside a gold frame on a green square tier"],
  ["project", "Orange gravity cake, close up", "A close-up of the gravity effect on an orange two-tier cake.", "projects/orange-gravity-cake-close-up", "Close-up of an orange two-tier gravity cake with snacks cascading down"],
  ["project", "Three-tier brown cake with gold gourd", "Wood-grain brown tiers with coral bead trim and a gold gourd topper.", "projects/three-tier-brown-cake-gold-gourd", "Three-tier brown cake with coral bead trim and a gold gourd topper"],
  ["project", "Three-tier cake, close up", "A close-up of the wood-grain finish and bead trim on a three-tier cake.", "projects/three-tier-brown-cake-gourd-close-up", "Close-up of a three-tier brown cake with a gold gourd topper"],
  ["instructor", "Instructor leading a class", "A practical session in the training hall.", "training/instructor-leading-class-green-caps", "Instructor standing at the front of a class of students in green caps"],
  ["instructor", "Teaching at the whiteboard", "Theory and demonstration go together in our sessions.", "training/instructor-teaching-whiteboard", "Instructor teaching at a whiteboard in a classroom"],
  ["instructor", "Lesson in the training hall", "A full-hall lesson with an instructor at the front.", "training/instructor-front-of-training-hall", "Instructor at the front of a full training hall"],
  ["facility", "Training hall in session", "Students at long tables during a class.", "training/training-hall-class-green-caps", "Training hall with students in green caps seated at long tables"],
  ["facility", "Classroom with natural light", "A bright classroom with large windows.", "training/classroom-session-wide-windows", "Classroom session with students at desks beside large windows"],
  ["facility", "Classroom, overhead view", "Students working at tables.", "training/classroom-overhead-view", "Overhead view of students seated at tables in a classroom"],
  ["facility", "Classroom, side view", "A class in progress.", "training/classroom-side-view", "Side view of students listening in a classroom"],
  ["facility", "Training kitchen classroom", "Long work tables and a teaching area.", "training/training-kitchen-classroom-wide", "Wide view of a training hall with long tables and students in green caps"],
  ["student", "Trainees in chef whites", "Our trainees at a showcase event.", "training/trainees-chef-whites-red-carpet", "Group of trainees in white chef jackets on a red carpet"],
  ["student", "Trainees in chef whites, group photo", "A group photo at the showcase.", "training/trainees-chef-whites-group-a", "Group of trainees in white chef jackets posing together on a red carpet"],
  ["student", "Trainees in chef whites, second group photo", "Another group photo from the showcase.", "training/trainees-chef-whites-group-b", "Trainees in white chef jackets posing together, some kneeling in front"],
  ["student", "Trainees with their gravity cakes", "Trainees behind a row of gravity cakes.", "training/trainees-gravity-cakes-row", "Trainees in lime-green tops standing behind orange and teal gravity cakes"],
  ["student", "Gravity cakes on display", "A display of gravity cakes made by trainees.", "training/trainees-gravity-cakes-wide", "Wide view of trainees behind a table of orange and teal gravity cakes"],
  ["student", "Trainees with gravity cakes, close up", "Trainees showing their finished cakes.", "training/trainees-gravity-cakes-orange-teal", "Trainees in lime-green tops with tall orange and teal cakes"],
  ["student", "Two trainees, two gravity cakes", "Trainees with their cakes at the showcase table.", "training/trainees-two-gravity-cakes", "Two trainees standing beside tall gravity cakes on a green-cloth table"],
  ["student", "Trainees with their cakes", "Trainees presenting their cake projects.", "training/trainees-gravity-cakes-lime-tops", "Trainees in lime-green tops standing behind tall tiered cakes"],
  ["student", "Student with a tiered gourd cake", "A trainee presenting a tiered cake at the showcase.", "projects/student-tiered-cake-gourd-topper", "Trainee in chef whites behind a tiered brown cake with a gold gourd topper"],
  ["student", "Trainee with a tiered brown cake", "A finished tiered cake, ready for judging.", "projects/student-smiling-tiered-brown-cake", "Smiling trainee in a chef jacket behind a tiered brown cake"],
  ["student", "Student with a red sculpture cake", "A sculpted cake on a bright green base.", "projects/student-red-sculpture-cake-green-base", "Student in chef whites beside a red sculpted cake in a gold frame"],
  ["student", "Student with a gourd cake", "A gold gourd cake on a brown block.", "projects/student-gourd-cake-brown-block", "Student in chef whites beside a gold gourd cake on a brown block"],
  ["student", "Student with a marbled gold cake", "A tiered cake with a marbled gold finish.", "projects/student-gold-marbled-tiered-cake", "Student in chef whites behind a tiered marbled cake with gold detail"],
  ["student", "Trainee presenting a gourd cake", "A demonstration at the showcase.", "projects/student-gourd-cake-demonstration", "Trainee in chef whites presenting a gourd cake on a brown block"],
  ["student", "Trainee with a gold gourd cake and flowers", "A chocolate cake finished with flowers and a gold topper.", "projects/student-gold-gourd-cake-flowers", "Trainee in chef whites behind a chocolate cake with flowers and a gold gourd"],
  ["student", "Student with a yellow and gold cake", "A four-tier cake in yellow and gold.", "projects/student-yellow-gold-four-tier-cake", "Student in chef whites beside a yellow and gold four-tier cake"],
  ["student", "Student with a cream and gold ornate cake", "An ornate cake with gold detail.", "projects/student-cream-gold-ornate-cake", "Student in chef whites behind a cream and gold ornate cake"],
  ["student", "Trainee with a white cake on a brown base", "A white cake with red bead trim.", "projects/student-white-cake-red-bead-trim", "Trainee in chef whites behind a white cake with red bead trim on a brown base"],
  ["student", "Student with a red-brown tiered cake", "A tiered cake in red and brown.", "projects/student-red-brown-tiered-cake", "Student in chef whites behind a red-brown tiered cake with a gourd topper"],
  ["student", "Student with a cake on a bead stand", "A cake raised on a red bead stand.", "projects/student-cake-red-bead-stand", "Student in chef whites behind a cake raised on a red bead stand"],
  ["student", "Student with a treasure chest cake", "A chest cake with a feather and bottle topper.", "projects/student-treasure-chest-cake-feather", "Student in chef whites behind a treasure chest cake with a white feather"],
  ["student", "Student with an emerald cake", "A tiered emerald cake with gold detail.", "projects/student-emerald-cake", "Student in chef whites beside an emerald green tiered cake"],
];
// ---------------------------------------------------------------- VIP menu (separate from the regular menu; starts as a read-only static menu)
const VIP_STARTER: [string, [string, number, string, string][]][] = [
  ["Mains", [["Jollof Rice", 2_500, "Freshly cooked jollof rice.", "jollof-rice"], ["Fried Rice", 2_500, "Freshly cooked fried rice.", "fried-rice"], ["Native Rice", 3_000, "Native rice served with sauce.", "ofada-rice"]]],
  ["Soups and Swallows", [["Egusi Soup with Garri", 4_500, "Egusi soup served with garri and 1 beef.", "egusi-garri"], ["Oha Soup with Fufu", 4_500, "Oha soup served with fufu and 1 beef.", "oha-soup"]]],
  ["Fish", [["Grilled Catfish", 6_000, "Whole grilled catfish.", "grilled-catfish"], ["Catfish Pepper Soup", 6_000, "Hot, aromatic catfish pepper soup.", "catfish-pepper-soup"]]],
  ["Sides", [["Moi Moi", 1_000, "Moi moi (bean pudding).", "moi-moi"]]],
];
async function seedVip(repo: Repo, log: Log) {
  if ((await repo.docList("vipcat")).length || (await repo.docList("vipitem")).length) return log("VIP menu: already has content, skipped");
  // Starts as a static (read-only) menu; switch to WhatsApp ordering in Admin > VIP menu > Ordering and settings. These are sample prices to edit.
  if (!(await repo.docGet("settings", "vip"))) must("VIP settings", await saveVipSettings(repo, { enabled: true, mode: "static", title: "VIP Menu", tableLabel: "Table" }));
  let sort = 0, cs = 0;
  for (const [name, list] of VIP_STARTER) { const cat = must("VIP category", await saveVipCategory(repo, { name, sort: cs++, active: true })); for (const [n, price, description, img] of list) must("VIP item", await saveVipItem(repo, { name: n, categoryId: cat.id, description, priceKobo: naira(price), imageUrl: m(`food/illustrations/${img}`), imageAlt: `Illustration of ${n}`, available: true, active: true, sort: sort++ })); }
  log(`VIP menu: ${VIP_STARTER.length} categories, ${VIP_STARTER.reduce((t, [, l]) => t + l.length, 0)} sample items (static mode)`);
}

// ---------------------------------------------------------------- event catering
const CAT_CONTENT = {
  categories: [{ name: "Weddings", description: "Receptions and engagement parties, with a cake to match." }, { name: "Birthday Parties", description: "Milestone and family birthdays, large or small." }, { name: "Corporate Events", description: "Meetings, launches, staff parties and conferences." }, { name: "Graduation and Award Ceremonies", description: "Catering for school, college and training ceremonies." }, { name: "Naming Ceremonies and Baby Showers", description: "Warm, welcoming catering for family celebrations." }, { name: "Anniversaries and Private Dinners", description: "Intimate gatherings with a menu planned for you." }].map((c) => ({ ...c, published: true })),
  services: [{ name: "Buffet and plated catering", description: "Hot dishes prepared fresh and served as a buffet or plated meal." }, { name: "Small chops and cocktail service", description: "Finger foods and platters for receptions and cocktails." }, { name: "Custom celebration cakes", description: "Wedding, birthday and showpiece cakes made to your design." }, { name: "Dessert tables", description: "Cakes, pastries and sweet treats arranged for your guests." }, { name: "Serving staff and setup", description: "Trained staff to set up, serve and clear." }, { name: "Menu planning and consultation", description: "We help you choose a menu that fits your guests and budget." }].map((s) => ({ ...s, published: true })),
  styles: ["Buffet", "Plated service", "Small chops and cocktail", "Dessert table", "Live food station"],
};
type G = [string, string, string, string, string];
// kind, title, caption, image, alt. The first three appear in the Event Catering hero (food, event, food).
const GALLERY: G[] = [
  ["food", "Gold four-tier showpiece", "A statement cake for a grand table.", "food/gold-four-tier-showpiece-cake", "Gold four-tier showpiece cake with silver detailing"],
  ["event", "Decorated venue entrance", "Gold and red drapes welcome guests.", "catering/venue-entrance-gold-red-drapes-b", "Guests and staff gathered under gold and red drapes at a decorated venue entrance"],
  ["food", "Emerald tiered cake", "Four square tiers with gold detail.", "food/emerald-green-tiered-cake", "Four-tier emerald green cake with ornate gold detail"],
  ["event", "Wedding cakes on display", "Showcase tables dressed in red and green.", "catering/wedding-cakes-green-red-cloths", "Team behind tables of white cakes dressed in red and green cloths"],
  ["food", "Classic white wedding cake", "Two tiers, pearl detail and white roses.", "food/classic-white-wedding-cake", "Two-tier white wedding cake with pearl detail and white roses"],
  ["food", "Gold-accent wedding cake", "White tiers with gold accents.", "food/gold-accent-wedding-cake", "Two-tier white cake with gold accents and white roses"],
  ["food", "Textured gold-leaf cake", "Three tiers with hand-applied gold leaf.", "food/textured-gold-leaf-cake", "Three-tier textured white cake with gold leaf and red roses"],
  ["food", "Monogram wedding cake", "A gold monogram of the couple's initials.", "food/monogram-wedding-cake", "Two-tier white cake with a gold monogram and white roses"],
  ["food", "Rustic white rose cake", "A softly textured cake with white roses.", "food/rustic-white-rose-cake", "Two-tier textured white cake with white roses and a Mrs topper"],
  ["food", "Gravity snack cake", "A playful cake for parties.", "food/gravity-snack-cake", "Tiered blue and orange gravity cake with snacks pouring down the front"],
  ["event", "Guests at the decorated entrance", "A welcome at the door.", "catering/venue-entrance-gold-red-drapes-a", "Guests and staff gathered at a venue entrance decorated with gold and red drapes"],
  ["event", "Cake tables in red and green", "A row of cakes ready for guests.", "catering/cake-tables-green-and-red-cloths", "Team standing behind cake tables dressed in green and red cloths"],
  ["event", "Team with the cake display", "Cakes laid out for a showcase.", "catering/team-with-cake-display-table", "Team in lime-green tops beside a table of white and showpiece cakes"],
  ["event", "Team with wedding cakes", "Our team beside the finished cakes.", "catering/team-with-wedding-cakes-display", "Team in lime and red tops behind a display of wedding cakes"],
  ["event", "Three wedding cakes on a table", "A trio of white cakes.", "catering/team-three-wedding-cakes-table", "Three team members behind three white wedding cakes on a table"],
  ["event", "White cakes on an orange table", "A cake table under the marquee.", "catering/team-white-cakes-orange-table", "Team behind white cakes on an orange-clothed table"],
  ["event", "Cake display under the tent", "Cakes on show at a ceremony.", "catering/team-cake-display-tent", "Team and guests around a cake display table under a tent"],
  ["event", "Ceremony on the red carpet", "Guests gathered under the marquee.", "catering/ceremony-guests-red-carpet-a", "Guests lined up on a red carpet beside a marquee during a ceremony"],
  ["event", "Guests on the red carpet", "A ceremony in progress.", "catering/ceremony-guests-red-carpet-b", "Guests standing on a red carpet beneath marquee tents"],
  ["event", "Guests reading programme sheets", "Guests in colourful outfits.", "catering/ceremony-guests-reading-sheets", "Guests in colourful outfits holding printed sheets on a red carpet"],
  ["event", "Red carpet under the trees", "A garden ceremony setting.", "catering/ceremony-red-carpet-under-tree", "Guests on a red carpet under marquee tents and trees"],
  ["event", "Guests in traditional attire", "Colourful outfits at the ceremony.", "catering/guests-traditional-attire-red-carpet", "Guests in traditional outfits lined up on a red carpet"],
  ["event", "Guests lined up", "Guests posing together.", "catering/guests-lined-up-traditional-outfits", "Guests in traditional outfits standing together on a red carpet"],
  ["event", "Guests in red and blue dresses", "Event guests dressed for the occasion.", "catering/guests-red-and-blue-dresses", "Seven guests in red, blue and patterned dresses on a red carpet"],
  ["event", "Fashion showcase", "Garments on show at an event.", "catering/showcase-garments-red-carpet", "Guests holding up patterned garments on a red carpet under a marquee"],
];
async function seedCatering(repo: Repo, log: Log) {
  if (await repo.docGet("cat-content", "main")) log("catering content: already configured, skipped");
  else { must("catering content", await saveCateringContent(repo, CAT_CONTENT)); log(`catering content: ${CAT_CONTENT.categories.length} event categories, ${CAT_CONTENT.services.length} services, ${CAT_CONTENT.styles.length} styles`); }
  if ((await repo.docList("cgallery")).length) return log("catering gallery: already has content, skipped");
  let sort = 0; for (const [kind, title, caption, img, alt] of GALLERY) must("gallery photo", await saveGallery(repo, { kind, title, caption, imageUrl: m(img), imageAlt: alt, published: true, sort: sort++ }));
  log(`catering gallery: ${GALLERY.length} photos`);
}

export async function seedAll(repo: Repo, log: Log = console.log) {
  // Each area is independent: one failing does not stop the rest, and everything is safe to re-run.
  const steps: [string, () => Promise<void>][] = [["menu", () => seedMenu(repo, log)], ["delivery and pickup", () => seedOrdering(repo, log)], ["website content", () => seedSite(repo, log)], ["vocational studies", () => seedVocational(repo, log)], ["event catering", () => seedCatering(repo, log)], ["VIP menu", () => seedVip(repo, log)]];
  const failed: string[] = [];
  for (const [name, run] of steps) { try { await run(); } catch (e) { failed.push(name); log(`FAILED  ${name}: ${(e as Error).message}`); } }
  const live = !!(await repo.docGet("content", "regular-3y"));
  log(`\nDatabase now holds: ${(await repo.listItems()).length} menu items, ${live ? "programme details saved" : "NO programme details"}, ${(await repo.docList("portfolio")).length} programme photos, ${(await repo.docList("cgallery")).length} catering photos.`);
  if (failed.length) throw new Error(`Problems in: ${failed.join(", ")}. The other areas were seeded. Fix the error above and run the seed again.`);
}
