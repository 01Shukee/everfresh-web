"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VARIANTS, vocConfig } from "@/config/vocational";
import { formatNaira } from "@/lib/money";

export interface ApplyOption { variantId: string; open: boolean; courses: string[]; tuition: string | null; hostelChoice: boolean; choose: number; choices: { name: string; priceKobo: number | null }[] }
type D = { fullName: string; phone: string; email: string; dob: string; address: string; education: string; emergencyName: string; emergencyPhone: string; additional: string };
const empty: D = { fullName: "", phone: "", email: "", dob: "", address: "", education: "", emergencyName: "", emergencyPhone: "", additional: "" };
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const keyFor = (fp: string) => { const k = `ef-appidem-${hash(fp)}`; try { let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem(k, v); } return v; } catch { return crypto.randomUUID().replace(/-/g, ""); } };

export function ApplyWizard({ options, initialVariant, resume, initial }: { options: ApplyOption[]; initialVariant: string | null; resume?: { ref: string; token: string }; initial?: { variantId: string; course: string | null; courses?: string[]; accommodation?: string | null; details: Partial<D> } }) {
  const [step, setStep] = useState<1 | 2>(resume ? 2 : initialVariant ? 2 : 1);
  const [variant, setVariant] = useState<string>(initial?.variantId ?? initialVariant ?? ""); const [picked, setPicked] = useState<string[]>(initial?.courses?.length ? initial.courses : initial?.course ? [initial.course] : []); const [acc, setAcc] = useState<"" | "hostel" | "day">((initial?.accommodation as "hostel" | "day" | null) ?? "");
  const [d, setD] = useState<D>({ ...empty, ...(initial?.details as D | undefined) }); const [errs, setErrs] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ ref: string; token: string } | null>(null);
  const opt = options.find((o) => o.variantId === variant); const vinfo = VARIANTS.find((v) => v.id === variant);
  const [cat, setCat] = useState<"regular" | "intensive" | "">(vinfo ? vinfo.programme : "");

  useEffect(() => { try { const s = sessionStorage.getItem("ef-apply-selection"); if (s && !variant) { const j = JSON.parse(s); setVariant(j.variant); setPicked(j.picked ?? []); setAcc(j.acc ?? ""); setCat(VARIANTS.find((v) => v.id === j.variant)?.programme ?? ""); } const l = localStorage.getItem("ef-app-draft"); if (l && !resume) setDraft(JSON.parse(l)); } catch { /* storage unavailable */ } }, []); // eslint-disable-line
  useEffect(() => { if (variant) try { sessionStorage.setItem("ef-apply-selection", JSON.stringify({ variant, picked, acc })); } catch { /* ignore */ } }, [variant, picked, acc]);
  const set = (k: keyof D) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const fp = useMemo(() => JSON.stringify({ variant, picked, acc, d }), [variant, picked, acc, d]);
  const toggle = (name: string, n: number) => setPicked((p) => (n === 1 ? [name] : p.includes(name) ? p.filter((x) => x !== name) : p.length < n ? [...p, name] : p));
  const ready = !!opt?.open && (!opt.hostelChoice || !!acc) && (opt.choose === 0 || picked.length === opt.choose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErrs({}); setMsg("");
    const details = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null]));
    try {
      const r = await fetch(resume ? `/api/applications/${resume.ref}?t=${encodeURIComponent(resume.token)}` : "/api/applications", { method: resume ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: keyFor(fp), variantId: variant, course: picked[0] ?? null, courses: picked, accommodation: acc || null, details }) });
      const j = await r.json();
      if (r.ok) { const ref = resume?.ref ?? j.ref, token = resume?.token ?? j.token; try { localStorage.setItem("ef-app-draft", JSON.stringify({ ref, token })); } catch { /* ignore */ } location.assign(`/application/${ref}/${token}`); return; }
      setErrs(j.fieldErrors ?? {}); setMsg(j.error ?? "Something went wrong."); setBusy(false); setTimeout(() => document.getElementById("form-alert")?.focus(), 50);
    } catch { setMsg("We couldn't reach the server. Nothing was charged. Please try again."); setBusy(false); }
  };
  const F = ({ id, label, req, err, children, hint }: { id: string; label: string; req?: boolean; err?: string; children: React.ReactNode; hint?: string }) => (
    <div className={`field ${err ? "bad" : ""}`}><label htmlFor={id}>{label} <span className={req ? "req" : "opt-t"}>{req ? "(required)" : "(optional)"}</span></label>{children}{hint && <p className="hint">{hint}</p>}{err && <p className="err" id={`${id}-e`}>{err}</p>}</div>);

  return (
    <div className="apply">
      <ol className="stepper2" aria-label="Application progress">{["Programme", "Your details", "Review", "Payment", "Confirmation"].map((s, n) => <li key={s} className={n + 1 === step ? "cur" : n + 1 < step ? "done" : ""} aria-current={n + 1 === step ? "step" : undefined}><span>{n + 1}</span>{s}</li>)}</ol>
      {draft && !resume && <div className="alert" role="status">You have an application in progress. <Link href={`/application/${draft.ref}/${draft.token}`}>Resume it</Link> or start a new one below.</div>}
      {step === 1 && (
        <section aria-labelledby="s1"><h2 id="s1" className="serif">Step 1: Choose your programme</h2>
          <div className="seg" role="radiogroup" aria-label="Programme">{(["regular", "intensive"] as const).map((c) => <label key={c} className={cat === c ? "on" : ""}><input type="radio" name="cat" checked={cat === c} onChange={() => { setCat(c); setPicked([]); setAcc(""); setVariant(c === "regular" ? "regular-3y" : ""); }} />{c === "regular" ? "Regular Programme (3 years)" : "Intensive Programme"}</label>)}</div>
          {cat === "intensive" && <fieldset><legend className="lab">Duration</legend><div className="seg" role="radiogroup" aria-label="Duration">{VARIANTS.filter((v) => v.programme === "intensive").map((v) => <label key={v.id} className={variant === v.id ? "on" : ""}><input type="radio" name="dur" checked={variant === v.id} onChange={() => { setVariant(v.id); setPicked([]); setAcc(""); }} />{v.durationLabel}</label>)}</div></fieldset>}
          {opt && !opt.open && <p className="alert" role="alert">Applications for this option are not open yet.</p>}
          {opt?.open && opt.hostelChoice && <fieldset><legend className="lab">Student type <span className="req">(required)</span></legend><div className="seg" role="radiogroup" aria-label="Student type">{([["day", "Day student"], ["hostel", "Hostel student"]] as const).map(([k, l]) => <label key={k} className={acc === k ? "on" : ""}><input type="radio" name="acc" checked={acc === k} onChange={() => setAcc(k)} />{l}</label>)}</div></fieldset>}
          {opt?.open && opt.choose > 0 && <fieldset><legend className="lab">{opt.choose === 1 ? "Choose your course" : `Choose ${opt.choose} courses`} <span className="req">(required{opt.choose > 1 ? `: ${picked.length} of ${opt.choose} chosen` : ""})</span></legend><div className="seg" role={opt.choose === 1 ? "radiogroup" : "group"} aria-label="Courses">{opt.choices.map((c) => <label key={c.name} className={picked.includes(c.name) ? "on" : ""}><input type={opt.choose === 1 ? "radio" : "checkbox"} name="choice" checked={picked.includes(c.name)} disabled={opt.choose > 1 && !picked.includes(c.name) && picked.length >= opt.choose} onChange={() => toggle(c.name, opt.choose)} />{c.name}{c.priceKobo ? ` (${formatNaira(c.priceKobo)})` : ""}</label>)}</div></fieldset>}
          {opt?.open && opt.choose === 0 && opt.courses.length > 0 && <div className="field"><label htmlFor="course">Preferred course <span className="opt-t">(optional)</span></label><select id="course" value={picked[0] ?? ""} onChange={(e) => setPicked(e.target.value ? [e.target.value] : [])}><option value="">No preference</option>{opt.courses.map((c) => <option key={c}>{c}</option>)}</select></div>}
          <p className="small">Fees: {opt?.tuition ?? "to be confirmed by the institution"}. Application-form fee: {formatNaira(vocConfig.applicationFee.kobo)}, non-refundable{vocConfig.applicationFee.creditedToTuition ? ". It is part of your total fees and is deducted from your programme invoice." : " and separate from tuition."}</p>
          <button className="pill" disabled={!ready} onClick={() => setStep(2)}>Continue to your details</button>
        </section>)}
      {step === 2 && (
        <form onSubmit={submit} noValidate aria-labelledby="s2"><h2 id="s2" className="serif">Step 2: Your details</h2>
          <p className="sel">Selected: <b>{vinfo?.label}, {vinfo?.durationLabel}</b>{picked.length ? ` · ${picked.join(", ")}` : ""}{acc ? ` · ${acc === "hostel" ? "Hostel" : "Day"} student` : ""} {!resume && <button type="button" className="linkbtn" onClick={() => setStep(1)}>Change</button>}</p>
          <p className="small"><span className="req">(required)</span> fields must be completed. <span className="opt-t">(optional)</span> fields can be left blank.</p>
          {msg && <div id="form-alert" tabIndex={-1} className="alert" role="alert">{msg}</div>}
          <div className="grid-f2">
            <F id="fullName" label="Full name" req err={errs.fullName}><input id="fullName" autoComplete="name" value={d.fullName} onChange={set("fullName")} aria-invalid={!!errs.fullName} aria-describedby={errs.fullName ? "fullName-e" : undefined} /></F>
            <F id="phone" label="Phone number" req err={errs.phone}><input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={d.phone} onChange={set("phone")} aria-invalid={!!errs.phone} aria-describedby={errs.phone ? "phone-e" : undefined} /></F>
            <F id="email" label="Email address" req err={errs.email}><input id="email" type="email" autoComplete="email" value={d.email} onChange={set("email")} aria-invalid={!!errs.email} aria-describedby={errs.email ? "email-e" : undefined} /></F>
            <F id="dob" label="Date of birth" err={errs.dob}><input id="dob" type="date" autoComplete="bday" value={d.dob} onChange={set("dob")} aria-invalid={!!errs.dob} /></F>
          </div>
          <F id="address" label="Residential address" req err={errs.address}><textarea id="address" rows={3} autoComplete="street-address" value={d.address} onChange={set("address")} aria-invalid={!!errs.address} aria-describedby={errs.address ? "address-e" : undefined} /></F>
          <F id="education" label="Educational background" err={errs.education}><textarea id="education" rows={2} value={d.education} onChange={set("education")} /></F>
          <div className="grid-f2"><F id="emergencyName" label="Emergency contact name" err={errs.emergencyName}><input id="emergencyName" value={d.emergencyName} onChange={set("emergencyName")} /></F><F id="emergencyPhone" label="Emergency contact phone" err={errs.emergencyPhone}><input id="emergencyPhone" type="tel" value={d.emergencyPhone} onChange={set("emergencyPhone")} /></F></div>
          <F id="additional" label="Additional information" err={errs.additional}><textarea id="additional" rows={3} value={d.additional} onChange={set("additional")} /></F>
          <div className="acts"><button className="pill" disabled={busy}>{busy ? "Saving…" : resume ? "Save changes and review" : "Save and review"}</button>{resume && <Link href={`/application/${resume.ref}/${resume.token}`} className="pill ghost">Cancel</Link>}</div>
          <p className="small dim0">Nothing is charged yet. You will review everything before paying.</p>
        </form>)}
    </div>
  );
}
