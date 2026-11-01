// One-off: copies photos that were uploaded while running locally (saved in the .uploads folder or MEDIA_DIR) into the database, so the live website can show them.
//   npm run db:import-uploads        (needs DATABASE_URL; safe to repeat; nothing is deleted)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_IMAGE_BYTES, mediaDir, sniffImage } from "../src/server/media";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
async function main() {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
  const dir = mediaDir(); const files = await readdir(dir).catch(() => [] as string[]); const { PrismaRepo } = await import("../src/server/repo-prisma"); const repo = new PrismaRepo();
  let added = 0, had = 0, skipped = 0;
  for (const name of files.filter((f) => /^[a-f0-9]{32}\.(jpg|png|webp)$/.test(f))) {
    const bytes = await readFile(join(dir, name)); const ext = sniffImage(bytes); if (!ext || bytes.length > MAX_IMAGE_BYTES) { skipped++; continue; }
    if (await repo.docGet("upload", name)) { had++; continue; }
    await repo.docPut("upload", name, { type: TYPES[ext], data: Buffer.from(bytes).toString("base64") }); added++; console.log("copied", name);
  }
  console.log(`${files.length ? "" : `No files found in ${dir}. `}${added} copied to the database, ${had} already there, ${skipped} skipped.`); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
