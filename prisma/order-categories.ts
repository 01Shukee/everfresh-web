// Puts the Rice category first on the menu and keeps every other category in its current order.
// Also switches ON any category that is off but still holds active dishes (those dishes would otherwise be hidden).
// DRY RUN by default: it prints what would change. Run with APPLY=1 to save.
import { saveCategory } from "../src/server/admin-api";

const FIRST = /rice/i; // the first ACTIVE category whose name matches goes to the front

async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Nothing was changed."); process.exit(1); }
  const apply = process.env.APPLY === "1";
  const { PrismaRepo } = await import("../src/server/repo-prisma");
  const repo = new PrismaRepo();
  const cats = [...(await repo.listCategories())].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const items = await repo.listItems();
  const first = cats.find((c) => c.active && FIRST.test(c.name));
  if (!first) { console.error('No active category with "rice" in its name was found. Nothing was changed.'); process.exit(1); }

  const ordered = [first, ...cats.filter((c) => c.id !== first.id)];
  console.log(apply ? "APPLYING.\n" : "DRY RUN: nothing will be saved. Run again with APPLY=1 to save.\n");
  console.log("Before:"); cats.forEach((c) => console.log(`  ${String(c.sort).padStart(3)}  ${c.name}${c.active ? "" : "   (switched off)"}`));
  console.log("\nAfter:");
  let changes = 0;
  for (const [i, c] of ordered.entries()) {
    const sort = i + 1;
    const holdsDishes = items.some((x) => x.categoryId === c.id && x.active);
    const reactivate = !c.active && holdsDishes;
    console.log(`  ${String(sort).padStart(3)}  ${c.name}${reactivate ? "   (switched ON: it holds active dishes)" : c.active ? "" : "   (switched off)"}`);
    if (c.sort === sort && !reactivate) continue;
    changes++;
    if (apply) {
      const r = await saveCategory(repo, { name: c.name, sort, active: reactivate ? true : c.active }, c.id);
      if (r.status >= 300) throw new Error(`${c.name}: ${JSON.stringify(r.body)}`);
    }
  }
  console.log(apply ? `\nDone: ${changes} categor${changes === 1 ? "y" : "ies"} updated.` : `\nDRY RUN finished: ${changes} change(s) would be made.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });