import type { Repo } from "./repo";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_CAPTIONS_BYTES = 512 * 1024;
export const mediaDir = () => process.env.MEDIA_DIR ?? join(process.cwd(), ".uploads");
/** Production hosting (Vercel) has no writable persistent disk, so uploads go to Vercel Blob when BLOB_READ_WRITE_TOKEN is set. Otherwise files are written to MEDIA_DIR. */
export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

type Fail = { ok: false; status: number; error: string };
export type SaveResult = { ok: true; url: string } | Fail;

/** Identify the real image type from its first bytes. The browser-declared type and file name are never trusted. SVG is refused (it can carry scripts). */
export function sniffImage(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}
/** Video container brands browsers can play (MP4 family and iPhone QuickTime). HEIC/AVIF images and audio-only brands share the "ftyp" box, so the brand is checked too. */
const VIDEO_BRANDS = /^(isom|iso[2-9]|mp4[12]|avc1|M4V |M4VH|M4VP|qt {2}|dash|MSNV|3gp\d|3g2\d|f4v |hvc1|hev1|XAVC|mmp4)$/;
/** Identify a playable video from its first bytes: MP4/M4V/MOV (served as MP4) or WebM. */
export function sniffVideo(b: Uint8Array): "mp4" | "webm" | null {
  if (b.length > 16 && String.fromCharCode(...b.slice(4, 8)) === "ftyp" && VIDEO_BRANDS.test(String.fromCharCode(...b.slice(8, 12)))) return "mp4";
  if (b.length > 16 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  return null;
}
/** A WebVTT captions file is UTF-8 text that starts with "WEBVTT" (an optional byte-order mark is allowed). */
export function isWebVtt(b: Uint8Array): boolean {
  const t = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 16)).replace(/^\uFEFF/, "");
  return /^WEBVTT(?:[ \t\r\n]|$)/.test(t);
}

const NO_STORAGE = "File storage isn't set up on this server. Connect a Vercel Blob store to the project (it adds BLOB_READ_WRITE_TOKEN), or set MEDIA_DIR to a persistent disk.";
const NOT_WRITABLE = "The file could not be saved on the server. Check that the upload folder (MEDIA_DIR) exists and is writable.";
/** Stores bytes under a random name. An explicit `dir` always means local disk (used by tests); otherwise Vercel Blob when configured, else MEDIA_DIR. */
async function store(bytes: Uint8Array, ext: string, type: string, dir?: string): Promise<SaveResult> {
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  if (dir === undefined && blobEnabled()) {
    try { const { put } = await import("@vercel/blob"); const b = await put(`uploads/${name}`, Buffer.from(bytes), { access: "public", contentType: type, addRandomSuffix: false }); return { ok: true, url: b.url }; }
    catch (e) { console.error("Blob upload failed", e); return { ok: false, status: 502, error: "The file could not be uploaded to storage. Please try again." }; }
  }
  if (dir === undefined && process.env.VERCEL) return { ok: false, status: 503, error: NO_STORAGE };
  try { const d = dir ?? mediaDir(); await mkdir(d, { recursive: true }); await writeFile(join(d, name), bytes); return { ok: true, url: `/uploads/${name}` }; }
  catch (e) { console.error("Upload write failed", e); return { ok: false, status: 503, error: NOT_WRITABLE }; }
}

export async function saveImage(bytes: Uint8Array, dir?: string): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, status: 422, error: "That file is empty." }; if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: "Images can be up to 5 MB." };
  const ext = sniffImage(bytes); if (!ext) return { ok: false, status: 415, error: "Upload a JPEG, PNG or WebP photo." };
  return store(bytes, ext, IMAGE_TYPES[ext], dir);
}
export async function saveVideo(bytes: Uint8Array, dir?: string): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, status: 422, error: "That file is empty." }; if (bytes.length > MAX_VIDEO_BYTES) return { ok: false, status: 413, error: `Videos can be up to ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` };
  const ext = sniffVideo(bytes); if (!ext) return { ok: false, status: 415, error: "Upload an MP4 or WebM video (H.264 MP4 plays on every phone and browser)." };
  return store(bytes, ext, VIDEO_TYPES[ext], dir);
}
export async function saveCaptions(bytes: Uint8Array, dir?: string): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, status: 422, error: "That file is empty." }; if (bytes.length > MAX_CAPTIONS_BYTES) return { ok: false, status: 413, error: "Captions files can be up to 512 KB." };
  if (!isWebVtt(bytes)) return { ok: false, status: 415, error: "Upload a WebVTT captions file (.vtt). It must start with the line WEBVTT." };
  return store(bytes, "vtt", CAPTION_TYPE, dir);
}

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm" };
const CAPTION_TYPE = "text/vtt; charset=utf-8";
const TYPES: Record<string, string> = { ...IMAGE_TYPES, ...VIDEO_TYPES, vtt: CAPTION_TYPE };
const NAME = /^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm|vtt)$/;
/**
 * Saves an uploaded image using the configured storage strategy.
 *
 * DATABASE_URL set:
 *   Store in the database.
 *
 * No DATABASE_URL:
 *   Store on disk, falling back to the database if disk storage fails.
 *
 * MEDIA_STORAGE=disk:
 *   Always use disk storage.
 */
export async function saveUpload(
  repo: Repo,
  bytes: Uint8Array,
  dir?: string
): Promise<SaveResult> {
  if (bytes.length === 0) {
    return { ok: false, status: 422, error: "That file is empty." };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: "Images can be up to 5 MB." };
  }

  const ext = sniffImage(bytes);

  if (!ext) {
    return {
      ok: false,
      status: 415,
      error: "Upload a JPEG, PNG or WebP photo.",
    };
  }

  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const type = IMAGE_TYPES[ext];
  const url = `/uploads/${name}`;

  const useDatabase =
    process.env.DATABASE_URL !== undefined &&
    process.env.DATABASE_URL !== "" &&
    process.env.MEDIA_STORAGE !== "disk";

  const saveToDatabase = async (): Promise<SaveResult> => {
    try {
      await repo.docPut("upload", name, {
        bytes: Array.from(bytes),
        type,
      });

      return { ok: true, url };
    } catch (error) {
      console.error("Database upload failed", error);

      return {
        ok: false,
        status: 503,
        error: "The file could not be saved. Please try again.",
      };
    }
  };

  if (useDatabase) {
    return saveToDatabase();
  }

  try {
    const directory = dir ?? mediaDir();

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), bytes);

    return { ok: true, url };
  } catch (error) {
    console.error("Disk upload failed", error);

    // Explicit disk mode must never silently switch storage.
    if (process.env.MEDIA_STORAGE === "disk") {
      return {
        ok: false,
        status: 503,
        error: NOT_WRITABLE,
      };
    }

    // Fall back to database storage when disk is unavailable.
    return saveToDatabase();
  }
}

/**
 * Reads an uploaded image from the database first,
 * then checks the local disk.
 */
export async function readStoredUpload(
  repo: Repo,
  name: string,
  dir = mediaDir()
): Promise<{ bytes: Buffer; type: string } | null> {
  const match = NAME.exec(name);

  if (!match || !IMAGE_TYPES[match[1]]) {
    return null;
  }

  try {
    const stored = await repo.docGet<{
      bytes?: number[];
      type?: string;
    }>("upload", name);

    if (
      stored &&
      Array.isArray(stored.bytes) &&
      typeof stored.type === "string" &&
      IMAGE_TYPES[match[1]] === stored.type
    ) {
      return {
        bytes: Buffer.from(stored.bytes),
        type: stored.type,
      };
    }
  } catch (error) {
    console.error("Database upload read failed", error);
  }

  try {
    return await readUpload(name, dir);
  } catch {
    return null;
  }
}

export async function readUpload(name: string, dir = mediaDir()): Promise<{ bytes: Buffer; type: string } | null> {
  const m = NAME.exec(name); if (!m) return null; try { return { bytes: await readFile(join(dir, name)), type: TYPES[m[1]] }; } catch { return null; }
}
/** Locates a stored file without reading it, so large videos can be streamed in byte ranges. */
export async function openUpload(name: string, dir = mediaDir()): Promise<{ path: string; size: number; type: string } | null> {
  const m = NAME.exec(name); if (!m) return null; try { const path = join(dir, name); const st = await stat(path); return st.isFile() ? { path, size: st.size, type: TYPES[m[1]] } : null; } catch { return null; }
}