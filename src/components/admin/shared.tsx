"use client";
import { useState, useEffect } from "react";

export const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.reload(); throw new Error("Signed out"); }
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
};
export const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

/** Phone photos are often 5 to 10 MB, more than hosting platforms accept in one request. Shrink to at most 1600 px on the long side (JPEG) before sending; small files are sent as they are. */
async function shrink(f: File): Promise<File> {
  if (f.size < 900_000 && f.type !== "image/png") return f;
  try {
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85)); return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}
/** Uploads a JPEG/PNG/WebP and returns its site path. The server checks the real file type. */
export function UploadButton({ onUploaded, label = "Upload photo" }: { onUploaded: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target; const f = input.files?.[0]; if (!f) return; setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", await shrink(f)); const r = await fetch("/api/admin/media", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.url) onUploaded(j.url); else setErr(j?.error ?? (r.status === 413 ? "That photo is too large. Choose one under 5 MB." : r.status === 401 || r.status === 403 ? "You do not have permission to upload photos." : `Upload failed (error ${r.status}). Please try again.`));
    } catch { setErr("Upload failed. Check your connection and try again."); }
    setBusy(false); input.value = "";
  };
  return <span className="upl"><label className="pill ghost sm">{busy ? "Uploading…" : label}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} className="sr" /></label>{err && <span className="err" role="alert">{err}</span>}</span>;
}

/** Shows the photo an address points to as soon as it is typed or pasted, so a link that is not a direct image is noticed before saving. */
export function ImagePreview({ url }: { url?: string | null }) {
  const raw = (url ?? "").trim(); const [bad, setBad] = useState(false); useEffect(() => setBad(false), [raw]);
  if (!raw) return null; const http = /^http:\/\//i.test(raw); const src = http ? `https://${raw.slice(7)}` : raw;
  return (
    <div className="imgprev">
      {!bad && <img src={src} alt="Preview of the photo" onError={() => setBad(true)} />}
      {bad && <p className="hint warn" role="alert">This address did not load as a picture. Paste the direct link to the image file (it usually ends in .jpg, .png or .webp, not a web page, Instagram or Google Drive link), or use Upload photo.</p>}
      {http && <p className="hint">This http:// link will be saved as https://.</p>}
    </div>
  );
}
