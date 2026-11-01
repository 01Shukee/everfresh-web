"use client";
import { useEffect, useMemo, useState } from "react";
import { formatNaira } from "@/lib/money";

interface F { name: string; phone: string; email: string; eventType: string; eventDate: string; location: string; guests: string; style: string; menu: string; dietary: string; budget: string; additional: string }
const empty: F = { name: "", phone: "", email: "", eventType: "", eventDate: "", location: "", guests: "", style: "", menu: "", dietary: "", budget: "", additional: "" };
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const keyFor = (fp: string) => { const k = `ef-enqidem-${hash(fp)}`; try { let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem(k, v); } return v; } catch { return crypto.randomUUID().replace(/-/g, ""); } };
const todayLagos = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
const long = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`; };

/** Declared at module level on purpose: a component created inside the form's render gets a new identity on every keystroke, so React remounts the input and it loses focus. */
function Fld({ id, label, req, err, children, hint }: { id: keyof F; label: string; req?: boolean; err?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className={`field ${err ? "bad" : ""}`}><label htmlFor={`q-${id}`}>{label} <span className={req ? "req" : "opt-t"}>{req ? "(required)" : "(optional)"}</span></label>{children}{hint && <p className="hint">{hint}</p>}{err && <p className="err" id={`q-${id}-e`}>{err}</p>}</div>);
}

export function QuoteForm({ categories, styles }: { categories: string[]; styles: string[] }) {
  const [f, setF] = useState<F>(empty); const [step, setStep] = useState<"form" | "review">("form"); const [errs, setErrs] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); useEffect(() => { if (tick) document.getElementById("q-alert")?.focus(); }, [tick]);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const v = e.target.value; setF((prev) => ({ ...prev, [k]: v })); };
  const fp = useMemo(() => JSON.stringify(f), [f]);
  const need: [keyof F, string][] = [["name", "Enter your full name."], ["phone", "Enter your phone number."], ["eventType", "Choose or enter the type of event."], ["eventDate", "Enter the event date."], ["location", "Enter where the event will take place."], ["guests", "Enter the estimated number of guests."]];
  const review = (e: React.FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {}; need.forEach(([k, m]) => { if (!f[k].trim()) x[k] = m; });
    if (f.eventDate && f.eventDate < todayLagos()) x.eventDate = "The event date can't be in the past.";
    setErrs(x); setMsg(Object.keys(x).length ? "Please complete the highlighted fields." : ""); if (Object.keys(x).length) setTick((n) => n + 1); else { setStep("review"); setTimeout(() => document.getElementById("review-h")?.focus(), 30); }
  };
  const submit = async () => {
    if (busy) return; setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/catering/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, idempotencyKey: keyFor(fp) }) }); const j = await r.json();
      if (r.ok) { location.assign(`/event-catering/enquiry/${j.ref}/${j.token}?new=1`); return; }
      setErrs(j.fieldErrors ?? {}); setMsg(j.error ?? "Something went wrong. Nothing was sent."); setStep("form"); setBusy(false); setTick((n) => n + 1);
    } catch { setMsg("We couldn't reach the server. Your request was not saved. Please try again."); setBusy(false); }
  };
  const inp = (id: keyof F, p: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={`q-${id}`} value={f[id]} onChange={set(id)} aria-invalid={!!errs[id]} aria-describedby={errs[id] ? `q-${id}-e` : undefined} {...p} />;

  if (step === "review") {
    const rows: [string, string | null][] = [["Full name", f.name], ["Phone number", f.phone], ["Email", f.email], ["Event type", f.eventType], ["Event date", f.eventDate ? long(f.eventDate) : ""], ["Event location", f.location], ["Estimated guests", f.guests], ["Catering style", f.style], ["Preferred menu", f.menu], ["Dietary requirements", f.dietary], ["Estimated budget", f.budget ? (/^[\d,\s₦]+$/.test(f.budget) ? formatNaira(Number(f.budget.replace(/[^\d]/g, "")) * 100) : f.budget) : ""], ["Additional information", f.additional]];
    return (
      <div className="qreview"><h3 id="review-h" tabIndex={-1} className="serif">Review your request</h3><p>Check your details. Nothing has been sent yet.</p>
        <dl className="dl rows">{rows.filter(([, v]) => v && v.trim()).map(([k, v]) => <div key={k} className="dlrow"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {msg && <div className="alert" role="alert">{msg}</div>}
        <div className="acts"><button className="pill" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save my request and continue to WhatsApp"}</button><button className="pill ghost" onClick={() => setStep("form")} disabled={busy}>Edit details</button></div>
        <p className="small dim0">We save your request first. Then WhatsApp opens with your message ready. <b>You must press Send in WhatsApp</b> for it to reach us.</p></div>);
  }
  return (
    <form onSubmit={review} noValidate className="qform" aria-label="Catering quotation request">
      <p className="small"><span className="req">(required)</span> fields must be completed. <span className="opt-t">(optional)</span> fields can be left blank.</p>
      {msg && <div id="q-alert" tabIndex={-1} className="alert" role="alert">{msg}</div>}
      <div className="grid-f2"><Fld id="name" label="Full name" req err={errs.name}>{inp("name", { autoComplete: "name" })}</Fld><Fld id="phone" label="Phone number" req err={errs.phone}>{inp("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "0803 123 4567" })}</Fld></div>
      <Fld id="email" label="Email address" err={errs.email}>{inp("email", { type: "email", autoComplete: "email" })}</Fld>
      <div className="grid-f2"><Fld id="eventType" label="Event type" req err={errs.eventType}>{categories.length ? <select id="q-eventType" value={f.eventType} onChange={set("eventType")} aria-invalid={!!errs.eventType}><option value="">Choose an event type</option>{categories.map((c) => <option key={c}>{c}</option>)}</select> : inp("eventType", { placeholder: "For example: wedding, birthday, corporate" })}</Fld>
        <Fld id="eventDate" label="Event date" req err={errs.eventDate}>{inp("eventDate", { type: "date", min: todayLagos() })}</Fld></div>
      <div className="grid-f2"><Fld id="location" label="Event location" req err={errs.location}>{inp("location", { autoComplete: "off" })}</Fld><Fld id="guests" label="Estimated number of guests" req err={errs.guests}>{inp("guests", { inputMode: "numeric" })}</Fld></div>
      <div className="grid-f2"><Fld id="style" label="Catering style" err={errs.style}>{styles.length ? <select id="q-style" value={f.style} onChange={set("style")}><option value="">No preference</option>{styles.map((s) => <option key={s}>{s}</option>)}</select> : inp("style", { placeholder: "For example: buffet, plated, finger food" })}</Fld><Fld id="budget" label="Estimated budget (₦)" hint="A whole number in naira, for example 500000." err={errs.budget}>{inp("budget", { inputMode: "numeric" })}</Fld></div>
      <Fld id="menu" label="Preferred menu" err={errs.menu}><textarea id="q-menu" rows={2} value={f.menu} onChange={set("menu")} /></Fld>
      <Fld id="dietary" label="Dietary requirements" err={errs.dietary}><textarea id="q-dietary" rows={2} value={f.dietary} onChange={set("dietary")} /></Fld>
      <Fld id="additional" label="Additional information" err={errs.additional}><textarea id="q-additional" rows={3} value={f.additional} onChange={set("additional")} /></Fld>
      <button className="pill">Review my request</button>
    </form>
  );
}