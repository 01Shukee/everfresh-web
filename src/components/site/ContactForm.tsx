"use client";
import { useEffect, useState } from "react";

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const keyFor = (fp: string) => { const k = `ef-cmidem-${hash(fp)}`; try { let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem(k, v); } return v; } catch { return crypto.randomUUID().replace(/-/g, ""); } };

export function ContactForm() {
  const [f, setF] = useState({ name: "", phone: "", email: "", topic: "", message: "", website: "" }); const [errs, setErrs] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  const [tick, setTick] = useState(0); useEffect(() => { if (tick) document.getElementById("c-alert")?.focus(); }, [tick]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErrs({}); setMsg("");
    try { const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, idempotencyKey: keyFor(JSON.stringify(f)) }) }); const j = await r.json();
      if (r.ok) { setDone(j.ref ?? ""); return; } setErrs(j.fieldErrors ?? {}); setMsg(j.error ?? "Something went wrong."); setBusy(false); setTick((n) => n + 1);
    } catch { setMsg("We couldn't reach the server. Your message was not sent. Please try again."); setBusy(false); }
  };
  if (done !== null) return <div className="paybox ok" role="status"><b className="serif">Thank you. Your message is saved.</b><span>{done ? `Reference ${done}. ` : ""}We will use the phone number or email you gave to reply.</span></div>;
  const Fld = ({ id, label, req, children }: { id: string; label: string; req?: boolean; children: React.ReactNode }) => <div className={`field ${errs[id] ? "bad" : ""}`}><label htmlFor={`c-${id}`}>{label} <span className={req ? "req" : "opt-t"}>{req ? "(required)" : "(optional)"}</span></label>{children}{errs[id] && <p className="err" id={`c-${id}-e`}>{errs[id]}</p>}</div>;
  return (
    <form className="qform" onSubmit={submit} noValidate aria-label="Contact form">
      {msg && <div id="c-alert" tabIndex={-1} className="alert" role="alert">{msg}{errs.contact && <p className="err">{errs.contact}</p>}</div>}
      <div className="grid-f2"><Fld id="name" label="Your name" req><input id="c-name" value={f.name} onChange={set("name")} autoComplete="name" aria-invalid={!!errs.name} /></Fld><Fld id="topic" label="Topic"><input id="c-topic" value={f.topic} onChange={set("topic")} placeholder="Food, studies, catering, other" /></Fld></div>
      <div className="grid-f2"><Fld id="phone" label="Phone number"><input id="c-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" aria-invalid={!!errs.phone} /></Fld><Fld id="email" label="Email address"><input id="c-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" aria-invalid={!!errs.email} /></Fld></div>
      <p className="small dim0">Give at least one of phone or email so we can reply.</p>
      <Fld id="message" label="Message" req><textarea id="c-message" rows={5} value={f.message} onChange={set("message")} aria-invalid={!!errs.message} /></Fld>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><label>Leave this empty<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
      <button className="pill" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
    </form>
  );
}
