"use client";
import { useState } from "react";
export function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(""); const r = await fetch("/api/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) }); const j = await r.json(); if (r.ok) setDone(true); else setErr(j.error ?? "Could not reset."); setBusy(false); };
  if (done) return <div className="paybox ok" role="status"><b className="serif">Password changed.</b><span>You can now <a href="/admin" style={{ color: "#fff", textDecoration: "underline" }}>sign in</a>. Any other open sessions were ended.</span></div>;
  return (<form className="login" onSubmit={go}><div className={`field ${err ? "bad" : ""}`}><label htmlFor="rp">New password (12+ characters)</label><input id="rp" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />{err && <p className="err" role="alert">{err}</p>}</div><button className="pill" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button></form>);
}
