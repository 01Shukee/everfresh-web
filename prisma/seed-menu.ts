// Imports the supplied Everfresh food menu into the PostgreSQL database. Run:  npm run db:seed-menu   (needs DATABASE_URL)
//   --dry-run        show what would change, write nothing (do this first)
//   --keep-samples   do not switch off the untouched sample dishes that are not on the supplied menu
//   --images-only    only attach downloaded photos (after `npm run food-images -- fetch`) to the dishes
//   --reorder        only put Main Meals, Soups and Special Dishes and Protein and Extras (and their dishes) first on the menu and homepage
//   --force          run again after the menu was already imported (dishes you edited in /admin are still protected)
// Safe to re-run. Nothing is deleted. See prisma/menu-sync.ts for the exact rules.
import { syncMenu } from "./menu-sync";

async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. This writes to PostgreSQL (the in-memory development store is lost on restart)."); process.exit(1); }
  const a = new Set(process.argv.slice(2));
  const { PrismaRepo } = await import("../src/server/repo-prisma");
  await syncMenu(new PrismaRepo(), { dryRun: a.has("--dry-run"), keepSamples: a.has("--keep-samples"), imagesOnly: a.has("--images-only"), force: a.has("--force"), reorderOnly: a.has("--reorder") });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
