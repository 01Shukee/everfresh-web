import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const mediaDir = () => process.env.MEDIA_DIR ?? join(process.cwd(), ".uploads");
/** Identify the real image type from its first bytes. The browser-declared type and file name are never trusted. SVG is refused (it can carry scripts). */
export function sniffImage(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}
export async function saveImage(bytes: Uint8Array, dir = mediaDir()): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }> {
  if (bytes.length === 0) return { ok: false, status: 422, error: "That file is empty." }; if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: "Images can be up to 5 MB." };
  const ext = sniffImage(bytes); if (!ext) return { ok: false, status: 415, error: "Upload a JPEG, PNG or WebP photo." };
  const name = `${randomBytes(16).toString("hex")}.${ext}`; await mkdir(dir, { recursive: true }); await writeFile(join(dir, name), bytes); return { ok: true, url: `/uploads/${name}` };
}
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export async function readUpload(name: string, dir = mediaDir()): Promise<{ bytes: Buffer; type: string } | null> {
  const m = /^[a-f0-9]{32}\.(jpg|png|webp)$/.exec(name); if (!m) return null; try { return { bytes: await readFile(join(dir, name)), type: TYPES[m[1]] }; } catch { return null; }
}
