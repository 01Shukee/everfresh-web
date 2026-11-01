"use client";
import { useState } from "react";

export const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.reload(); throw new Error("Signed out"); }
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
};
export const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

/** Uploads a JPEG/PNG/WebP (max 5 MB) and returns its site path. The server checks the real file type. */
export function UploadButton({ onUploaded, label = "Upload photo" }: { onUploaded: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true); setErr(""); const fd = new FormData(); fd.append("file", f);
    try { const r = await fetch("/api/admin/media", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (r.ok) onUploaded(j.url); else setErr(j.error ?? (r.status === 413 ? "That photo is too large for this server. Try a smaller one (under 4 MB)." : "Upload failed.")); } catch { setErr("Upload failed."); }
    setBusy(false); e.target.value = "";
  };
  return <span className="upl"><label className="pill ghost sm">{busy ? "Uploading…" : label}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} className="sr" /></label>{err && <span className="err" role="alert">{err}</span>}</span>;
}

/** Uploads an MP4 or WebM video and returns its URL. With Vercel Blob configured the file goes straight from the browser to Blob (serverless functions cannot take large bodies); otherwise it is saved on the server's disk. */
export function VideoUploadButton({ onUploaded, label = "Upload video" }: { onUploaded: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [pct, setPct] = useState(0);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); setErr(""); setPct(0);
    try {
      const cfg = await fetch("/api/admin/media", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Upload is not available right now."))));
      if (!/^video\//.test(f.type) && !/\.(mp4|m4v|mov|webm)$/i.test(f.name)) throw new Error("Choose an MP4 or WebM video.");
      if (f.size > cfg.maxVideoBytes) throw new Error(`Videos can be up to ${Math.round(cfg.maxVideoBytes / 1048576)} MB.`);
      const ext = f.type === "video/webm" || /\.webm$/i.test(f.name) ? "webm" : "mp4";
      if (cfg.storage === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const id = crypto.randomUUID().replace(/-/g, "");
        const b = await upload(`videos/${id}.${ext}`, f, { access: "public", handleUploadUrl: "/api/admin/media/video", contentType: ext === "webm" ? "video/webm" : "video/mp4", multipart: true, onUploadProgress: (p) => setPct(Math.round(p.percentage)) });
        onUploaded(b.url);
      } else {
        const fd = new FormData(); fd.append("file", f);
        const r = await fetch("/api/admin/media/video", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? (r.status === 413 ? "That video is too large for this server." : "Upload failed.")); onUploaded(j.url);
      }
    } catch (x) { setErr(x instanceof Error && x.message ? x.message : "Upload failed."); }
    setBusy(false);
  };
  return <span className="upl"><label className="pill ghost sm">{busy ? (pct ? `Uploading… ${pct}%` : "Uploading…") : label}<input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm" onChange={pick} disabled={busy} className="sr" /></label>{err && <span className="err" role="alert">{err}</span>}</span>;
}

/** Uploads a WebVTT (.vtt) captions file and returns its URL. The server checks that the file really is WebVTT. */
export function CaptionsUploadButton({ onUploaded, label = "Upload captions (.vtt)" }: { onUploaded: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); setErr(""); const fd = new FormData(); fd.append("file", f);
    try { const r = await fetch("/api/admin/media/captions", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (r.ok) onUploaded(j.url); else setErr(j.error ?? "Upload failed."); } catch { setErr("Upload failed."); }
    setBusy(false);
  };
  return <span className="upl"><label className="pill ghost sm">{busy ? "Uploading…" : label}<input type="file" accept=".vtt,text/vtt" onChange={pick} disabled={busy} className="sr" /></label>{err && <span className="err" role="alert">{err}</span>}</span>;
}
export function ImagePreview({ url }: { url?: string | null }) {
  const src = url?.trim();

  if (!src) return null;

  return (
    <div className="image-preview">
      <img
        src={src}
        alt="Image preview"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}