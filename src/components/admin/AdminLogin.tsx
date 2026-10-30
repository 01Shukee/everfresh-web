"use client";
import { useState } from "react";
export function AdminLogin() {
  const [mode, setMode] = useState<"in" | "forgot">("in"); const [need2fa, setNeed2fa] = useState(false); const [code, setCode] = useState(""); const [note, setNote] = useState(""); const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em, password: pw, code: code || undefined }) });
    if (r.ok) location.reload(); else { const j = await r.json(); if (j.need2fa) setNeed2fa(true); setErr(j.error ?? "Sign-in failed."); setBusy(false); }
  };
  const forgot = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); const r = await fetch("/api/admin/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) }); const j = await r.json().catch(() => ({})); setNote(j.message ?? j.error ?? "Please try again later."); setBusy(false); };
  if (mode === "forgot") return (<form className="login" onSubmit={forgot}><h1 className="serif page-title">Reset your password.</h1><div className="field"><label htmlFor="em">Staff email</label><input id="em" type="email" autoComplete="username" value={em} onChange={(e) => setEm(e.target.value)} required /></div><button className="pill" disabled={busy}>{busy ? "Sending…" : "Email me a reset link"}</button>{note && <p className="alert" role="status">{note}</p>}<p><button type="button" className="linkbtn" onClick={() => setMode("in")}>Back to sign in</button></p></form>);
  return (
    <form className="login" onSubmit={go}>
      <h1 className="serif page-title">Admin sign in</h1>
      <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="username" value={em} onChange={(e) => setEm(e.target.value)} required /></div>
      <div className={`field ${err ? "bad" : ""}`}><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />{err && <p className="err" role="alert">{err}</p>}</div>
      <button className="pill" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {need2fa && <div className="field"><label htmlFor="code">Authentication code (or a recovery code)</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>}
      <p><button type="button" className="linkbtn" onClick={() => setMode("forgot")}>Forgot your password?</button></p>
      <p className="small dim0">Staff accounts only. Access is limited by role.</p>
    </form>
  );
}
