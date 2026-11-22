// Replaces the delivery areas with named places around Nnewi, with ESTIMATED fees and minimum orders.
// DRY RUN by default: it prints what would change. Run with APPLY=1 to save.
// Pickup locations, scheduling and promo codes are kept exactly as they are. Edit any fee later in Admin > Food > Delivery and pickup.
import { formatNaira } from "../src/lib/money";
import { getOrderingConfig, saveOrderingSettings } from "../src/server/ordering-settings";

const naira = (n: number) => n * 100; // money is stored as integer kobo
// [area, delivery fee in naira, minimum order in naira]: nearest first
const AREAS: [string, number, number][] = [
  ["Nnewichi", 1_000, 3_000], ["Okofia", 1_500, 4_000], ["Otolo", 1_500, 4_000], ["Uruagu", 1_500, 4_000], ["Umudim", 2_000, 5_000],
  ["Nnobi", 2_500, 6_000], ["Ukpor", 2_500, 6_000], ["Oba", 3_000, 8_000], ["Amichi", 3_000, 8_000], ["Osumenyi", 3_000, 8_000],
  ["Ojoto", 3_500, 10_000], ["Alor", 3_500, 10_000], ["Ozubulu", 4_000, 10_000], ["Ichi", 4_000, 10_000],
];

async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Nothing was changed."); process.exit(1); }
  const apply = process.env.APPLY === "1";
  const { PrismaRepo } = await import("../src/server/repo-prisma");
  const repo = new PrismaRepo();
  const cfg = await getOrderingConfig(repo);

  console.log(apply ? "APPLYING.\n" : "DRY RUN: nothing will be saved. Run again with APPLY=1 to save.\n");
  console.log("Current delivery areas (these will be replaced):");
  if (!cfg.zones.length) console.log("  (none)");
  for (const z of cfg.zones) console.log(`  - ${z.name}   ${formatNaira(z.feeKobo)}   minimum ${formatNaira(z.minOrderKobo)}${z.active ? "" : "   (switched off)"}`);
  console.log("\nNew delivery areas:");
  for (const [n, f, m] of AREAS) console.log(`  + ${n}   ${formatNaira(naira(f))}   minimum ${formatNaira(naira(m))}`);

  if (apply) {
    const r = await saveOrderingSettings(repo, {
      zones: AREAS.map(([name, f, m]) => ({ name, feeKobo: naira(f), minOrderKobo: naira(m), active: true })),
      pickupLocations: cfg.pickupLocations, scheduling: cfg.scheduling, promos: cfg.promos,
    });
    if (!r.ok) throw new Error(r.error);
    console.log("\nSaved. Checkout now offers these areas.");
  } else console.log("\nDRY RUN finished: nothing was saved.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });