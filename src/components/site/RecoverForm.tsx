"use client";
import { useState } from "react";
export function RecoverForm() {
  const [email, setEmail] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(""); setMsg(""); try { const r = await fetch("/api/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const j = await r.json(); if (r.ok) setMsg(j.message); else setErr(j.message ?? j.error ?? "Something went wrong."); } catch { setErr("We couldn't reach the server. Please try again."); } setBusy(false); };
  return (<form className="qform" onSubmit={go} noValidate><div className={`field ${err ? "bad" : ""}`}><label htmlFor="rc-email">Email address you used</label><input id="rc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />{err && <p className="err" role="alert">{err}</p>}</div><button className="pill" disabled={busy}>{busy ? "Sending…" : "Email me my links"}</button>{msg && <p className="alert" role="status">{msg}</p>}<p className="small dim0">We only send links to the email address on the record. If you gave only a phone number, contact us instead.</p></form>);
}
