// Finds, checks and downloads real photos of the Everfresh dishes from Wikimedia Commons (free, no API key).
//   npm run food-images -- discover [slug]   list candidate photos (licence-checked) and write a contact sheet to review in a browser
//   npm run food-images -- fetch [slug]      download the photos a person approved (menu-data.ts: photo.commons = "File:...") into public/media/food/ng/
// Then:  npm run db:seed-menu -- --images-only   to point the dishes at the downloaded photos.
// Photos are SELF-HOSTED after download (no hotlinking, no runtime API, no keys), so the site does not depend on Commons being reachable.
// Nothing is chosen automatically: `discover` only suggests. Needs network access and Node 22+.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MENU, type MenuSeed } from "../prisma/menu-data";
import { MAX_IMAGE_BYTES, sniffImage } from "../src/server/media";

const API = "https://commons.wikimedia.org/w/api.php";
const OUT = join(process.cwd(), "public/media/food/ng");
// Wikimedia asks every client to identify itself with contact details: set FOOD_IMAGES_CONTACT to an email or your site URL.
const UA = `EverfreshWeb/1.0 (${process.env.FOOD_IMAGES_CONTACT ?? "https://everfresh-web.vercel.app"}) food-images script`;
const FIELDS = "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|ObjectName";

export interface Candidate { title: string; page: string; thumb: string; mime: string; width: number; height: number; licence: string; licenceUrl: string; author: string; text: string }

/** Only licences that allow free commercial reuse. CC BY and CC BY-SA need the credit this script writes to CREDITS.md. NC, ND and GFDL-only are refused. */
export const licenceOk = (short: string) => /^(cc0|cc[- ]by(-sa)?[ -]\d|public domain|pd\b|pdm|cc[- ]zero)/i.test(short.trim()) && !/\b(nc|nd)\b/i.test(short);
export const stripHtml = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
export const searchUrl = (q: string, limit = 15, width = 400) => `${API}?${new URLSearchParams({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: String(limit), gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: String(width), iiextmetadatafilter: FIELDS, origin: "*" })}`;
export const titleUrl = (title: string, width = 800) => `${API}?${new URLSearchParams({ action: "query", format: "json", titles: title, prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: String(width), iiextmetadatafilter: FIELDS, origin: "*" })}`;

export function parse(json: any): Candidate[] {
  const pages = Object.values<any>(json?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.flatMap((p) => { const i = p.imageinfo?.[0]; if (!i) return []; const m = i.extmetadata ?? {}; const v = (k: string) => stripHtml(String(m[k]?.value ?? ""));
    return [{ title: p.title, page: i.descriptionurl, thumb: i.thumburl ?? i.url, mime: i.mime, width: i.width, height: i.height, licence: v("LicenseShortName"), licenceUrl: String(m.LicenseUrl?.value ?? ""), author: v("Artist") || v("Credit") || "Unknown", text: `${p.title} ${v("ImageDescription")} ${v("ObjectName")}` }]; });
}
const get = async (url: string) => { const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) }); if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url.slice(0, 90)}`); return r; };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const seeds = (slug?: string) => { const l = MENU.filter((m) => !slug || m.slug === slug); if (!l.length) throw new Error(`No dish with slug "${slug}". Slugs: ${MENU.map((m) => m.slug).join(", ")}`); return l; };

async function discover(slug?: string) {
  const sheet: string[] = [];
  for (const m of seeds(slug)) {
    const found = parse(await (await get(searchUrl(m.photo.query))).json()).filter((c) => /^image\/(jpeg|png|webp)$/.test(c.mime) && licenceOk(c.licence) && new RegExp(m.photo.match, "i").test(c.text)).slice(0, 6);
    console.log(`\n${m.name}  [${m.slug}]  ${found.length ? "" : "no licence-safe candidates: use the placeholder, or upload your own photo in /admin"}`);
    for (const c of found) console.log(`  ${c.title}   ${c.licence}   by ${c.author.slice(0, 40)}   ${c.page}`);
    sheet.push(`<h2>${m.name} <small>${m.slug}</small></h2><p>Approve by pasting the title into prisma/menu-data.ts as <code>commons</code>. Only approve a photo that shows THIS dish, as served in Nigeria.</p><div class=g>${found.map((c) => `<figure><a href="${c.page}"><img src="${c.thumb}" loading=lazy></a><figcaption><b>${c.title}</b><br>${c.licence} · ${c.author.slice(0, 60)}</figcaption></figure>`).join("") || "<i>none</i>"}</div>`);
    await pause(400);
  }
  const dir = join(tmpdir(), "everfresh-food-images"); mkdirSync(dir, { recursive: true }); const file = join(dir, "candidates.html");
  writeFileSync(file, `<meta charset=utf-8><title>Dish photo candidates</title><style>body{font:15px system-ui;margin:24px}.g{display:flex;flex-wrap:wrap;gap:12px}figure{width:240px;margin:0}img{width:240px;height:180px;object-fit:cover;border-radius:8px}</style>${sheet.join("")}`);
  console.log(`\nContact sheet with thumbnails: ${file}`);
}

async function fetchOne(m: MenuSeed, credits: Record<string, unknown>) {
  const title = m.photo.commons!; const c = parse(await (await get(titleUrl(title))).json())[0];
  if (!c) throw new Error(`${title}: not found on Commons`);
  if (!licenceOk(c.licence)) throw new Error(`${title}: licence "${c.licence}" is not allowed`);
  const bytes = new Uint8Array(await (await get(c.thumb)).arrayBuffer()); const ext = sniffImage(bytes);
  if (!ext) throw new Error(`${title}: not a JPEG, PNG or WebP image`); if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${title}: larger than 5 MB`);
  mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${m.slug}.${ext}`), bytes);
  credits[m.slug] = { dish: m.name, file: c.title, author: c.author, licence: c.licence, licenceUrl: c.licenceUrl, source: c.page, width: c.width, height: c.height };
  console.log(`ok   ${m.name}: ${m.slug}.${ext} (${Math.round(bytes.length / 1024)} KB) ${c.licence}`);
}
async function fetchAll(slug?: string) {
  const jsonPath = join(OUT, "credits.json"); const credits: Record<string, any> = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : {}; let failed = 0;
  const todo = seeds(slug).filter((m) => m.photo.commons); if (!todo.length) return console.log("No approved photos yet. Run `discover`, then set photo.commons for the dishes you approve in prisma/menu-data.ts.");
  for (const m of todo) { try { await fetchOne(m, credits); } catch (e) { failed++; console.error(`FAIL ${m.name}: ${(e as Error).message}`); } await pause(400); }
  mkdirSync(OUT, { recursive: true }); writeFileSync(jsonPath, JSON.stringify(credits, null, 2) + "\n");
  writeFileSync(join(OUT, "CREDITS.md"), `# Photo credits\nPhotos of dishes from Wikimedia Commons. Show these credits on the site (for example under About or in the footer): CC BY and CC BY-SA licences require it.\n\n${Object.values<any>(credits).map((c) => `- **${c.dish}**: "${c.file.replace(/^File:/, "")}" by ${c.author}, ${c.licence} (${c.licenceUrl || "public domain"}). Source: ${c.source}`).join("\n")}\n`);
  console.log(`\n${todo.length - failed} downloaded${failed ? `, ${failed} failed` : ""}. Credits written to public/media/food/ng/CREDITS.md. Next: npm run db:seed-menu -- --images-only`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("food-images.ts")) {
  const [cmd, slug] = process.argv.slice(2);
  (cmd === "discover" ? discover(slug) : cmd === "fetch" ? fetchAll(slug) : Promise.reject(new Error("Usage: npm run food-images -- discover|fetch [slug]"))).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
