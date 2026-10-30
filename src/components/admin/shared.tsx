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
    try { const r = await fetch("/api/admin/media", { method: "POST", body: fd }); const j = await r.json(); if (r.ok) onUploaded(j.url); else setErr(j.error ?? "Upload failed."); } catch { setErr("Upload failed."); }
    setBusy(false); e.target.value = "";
  };
  return <span className="upl"><label className="pill ghost sm">{busy ? "Uploading…" : label}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} className="sr" /></label>{err && <span className="err" role="alert">{err}</span>}</span>;
}
