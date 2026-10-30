// Seeds sample content into the PostgreSQL database. Run:  npm run db:seed   (needs DATABASE_URL; see docs/SEEDING.md)
// Safe to re-run: an area is only seeded while it is still empty, so nothing you edited in the admin is overwritten or duplicated.
import { seedAll } from "./seed-data";

async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. The seed writes to PostgreSQL (the in-memory development store is lost on restart, so seeding it would do nothing)."); process.exit(1); }
  const { PrismaRepo } = await import("../src/server/repo-prisma");
  await seedAll(new PrismaRepo());
  console.log("Seed complete. Everything seeded can be edited or deleted in /admin.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
