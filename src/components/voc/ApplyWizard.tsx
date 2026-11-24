"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { VARIANTS, vocConfig } from "@/config/vocational";
import { formatNaira } from "@/lib/money";
import "./apply.css";

export interface ApplyOption {
  variantId: string;
  open: boolean;
  courses: string[];
  tuition: string | null;
  hostelChoice: boolean;
  choose: number;
  choices: { name: string; priceKobo: number | null }[];
  included: { name: string; description: string | null }[];
}

type D = { fullName: string; phone: string; email: string; dob: string; address: string; education: string; emergencyName: string; emergencyPhone: string; additional: string };
const empty: D = { fullName: "", phone: "", email: "", dob: "", address: "", education: "", emergencyName: "", emergencyPhone: "", additional: "" };
type Acc = "" | "hostel" | "day";
type Cat = "regular" | "intensive" | "";

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const keyFor = (fp: string) => {
  const k = `ef-appidem-${hash(fp)}`;
  try { let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem(k, v); } return v; }
  catch { return crypto.randomUUID().replace(/-/g, ""); }
};

/** True when the programme choices are complete (open, student type if asked, the right number of courses). */
const isReady = (o: ApplyOption | undefined, acc: Acc, picked: string[]) =>
  !!o?.open && (!o.hostelChoice || !!acc) && (o.choose === 0 || picked.length === o.choose);

// Keep F outside ApplyWizard to prevent input focus loss.
function F({ id, label, req, err, children, hint }: { id: string; label: string; req?: boolean; err?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className={`field ${err ? "bad" : ""}`}>
      <label htmlFor={id}>{label} <span className={req ? "req" : "opt-t"}>{req ? "(required)" : "(optional)"}</span></label>
      {children}{hint && <p className="hint">{hint}</p>}{err && <p className="err" id={`${id}-e`}>{err}</p>}
    </div>
  );
}

export function ApplyWizard({ options, initialVariant, resume, initial }: {
  options: ApplyOption[];
  initialVariant: string | null;
  resume?: { ref: string; token: string };
  initial?: { variantId: string; course: string | null; courses?: string[]; accommodation?: string | null; details: Partial<D> };
}) {
  const startVariant = initial?.variantId ?? initialVariant ?? "";
  const startPicked = initial?.courses?.length ? initial.courses : initial?.course ? [initial.course] : [];
  const startAcc = ((initial?.accommodation as "hostel" | "day" | null) ?? "") as Acc;

  // Open on details only when the programme choices are already complete; otherwise start at Step 1 with what is known filled in.
  const [step, setStep] = useState<1 | 2>(resume || isReady(options.find((o) => o.variantId === startVariant), startAcc, startPicked) ? 2 : 1);
  const [variant, setVariant] = useState<string>(startVariant);
  const [picked, setPicked] = useState<string[]>(startPicked);
  const [acc, setAcc] = useState<Acc>(startAcc);
  // Only name, phone and email are asked now. The other fields stay in state so an existing application's details are never wiped on save.
  const [d, setD] = useState<D>({ ...empty, ...(initial?.details as D | undefined) });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false); const [dup, setDup] = useState(false);
  const [draft, setDraft] = useState<{ ref: string; token: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const snap = useRef<{ variant: string; picked: string[]; acc: Acc; cat: Cat } | null>(null);

  const opt = options.find((o) => o.variantId === variant);
  const vinfo = VARIANTS.find((v) => v.id === variant);
  const [cat, setCat] = useState<Cat>(vinfo ? vinfo.programme : "");

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("ef-apply-selection");
      if (s && !variant) {
        const j = JSON.parse(s);
        setVariant(j.variant); setPicked(j.picked ?? []); setAcc(j.acc ?? "");
        setCat(VARIANTS.find((v) => v.id === j.variant)?.programme ?? "");
      }
      const l = localStorage.getItem("ef-app-draft");
      if (l && !resume) setDraft(JSON.parse(l));
    } catch { /* storage unavailable */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (variant) { try { sessionStorage.setItem("ef-apply-selection", JSON.stringify({ variant, picked, acc })); } catch { /* ignore */ } }
  }, [variant, picked, acc]);

  const set = (k: keyof D) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((prev) => ({ ...prev, [k]: e.target.value }));
  const fp = useMemo(() => JSON.stringify({ variant, picked, acc, d }), [variant, picked, acc, d]);
  const toggle = (name: string, n: number) => setPicked((p) => (n === 1 ? [name] : p.includes(name) ? p.filter((x) => x !== name) : p.length < n ? [...p, name] : p));

  const ready = isReady(opt, acc, picked);
  const hasInc = !!opt && opt.included.length > 0;
  const missing = !cat ? "Choose a programme to continue."
    : !opt ? "Choose how long you want to train."
    : !opt.open ? ""
    : opt.hostelChoice && !acc ? "Choose day student or hostel student to continue."
    : opt.choose > 0 && picked.length < opt.choose ? (opt.choose === 1 ? "Choose your course to continue." : `Choose ${opt.choose - picked.length} more course${opt.choose - picked.length === 1 ? "" : "s"} to continue.`)
    : "";

  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const startChange = () => { snap.current = { variant, picked, acc, cat }; setChanging(true); setStep(1); top(); };
  const cancelChange = () => { const s = snap.current; if (s) { setVariant(s.variant); setPicked(s.picked); setAcc(s.acc); setCat(s.cat); } setChanging(false); setStep(2); top(); };
  const toDetails = () => { setChanging(false); setStep(2); top(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrs({}); setMsg("");
    const details = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null]));
    try {
      const r = await fetch(
        resume ? `/api/applications/${resume.ref}?t=${encodeURIComponent(resume.token)}` : "/api/applications",
        { method: resume ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: keyFor(fp), variantId: variant, course: picked[0] ?? null, courses: picked, accommodation: acc || null, details }) }
      );
      const j = await r.json();
      if (r.ok) {
        const ref = resume?.ref ?? j.ref, token = resume?.token ?? j.token;
        try { localStorage.setItem("ef-app-draft", JSON.stringify({ ref, token })); } catch { /* ignore */ }
        location.assign(`/application/${ref}/${token}`);
        return;
      }
      setErrs(j.fieldErrors ?? {}); setMsg(j.error ?? "Something went wrong."); setDup(j.code === "DUPLICATE_APPLICATION"); setBusy(false);
      setTimeout(() => document.getElementById("form-alert")?.focus(), 50);
    } catch {
      setMsg("We couldn't reach the server. Nothing was charged. Please try again."); setBusy(false);
    }
  };

  return (
    <div className="apply">
      <ol className="stepper2" aria-label="Application progress">
        {["Programme", "Your details", "Review", "Payment", "Confirmation"].map((s, n) => (
          <li key={s} className={n + 1 === step ? "cur" : n + 1 < step ? "done" : ""} aria-current={n + 1 === step ? "step" : undefined}><span>{n + 1}</span>{s}</li>
        ))}
      </ol>

      {draft && !resume && (
        <div className="alert" role="status">You have an application in progress. <Link href={`/application/${draft.ref}/${draft.token}`}>Resume it</Link> or start a new one below.</div>
      )}

      {step === 1 && (
        <section aria-labelledby="s1">
          <h2 id="s1" className="serif">{changing ? "Change your programme or courses" : "Step 1: Choose your programme"}</h2>
          {changing && <p className="ap-note" role="status">Your name, phone and email are kept. Choosing a different programme clears your course choices.</p>}

          <fieldset className="ap-block">
            <legend className="lab">Programme</legend>
            <div className="seg" role="radiogroup" aria-label="Programme">
              {(["regular", "intensive"] as const).map((c) => (
                <label key={c} className={cat === c ? "on" : ""}>
                  <input type="radio" name="cat" checked={cat === c} onChange={() => { setCat(c); setPicked([]); setAcc(""); setVariant(c === "regular" ? "regular-3y" : ""); }} />
                  {c === "regular" ? "Regular Programme (2 years)" : "Intensive Programme"}
                </label>
              ))}
            </div>
          </fieldset>

          {cat === "intensive" && (
            <fieldset className="ap-block">
              <legend className="lab">Duration</legend>
              <div className="seg" role="radiogroup" aria-label="Duration">
                {VARIANTS.filter((v) => v.programme === "intensive").map((v) => (
                  <label key={v.id} className={variant === v.id ? "on" : ""}>
                    <input type="radio" name="dur" checked={variant === v.id} onChange={() => { setVariant(v.id); setPicked([]); setAcc(""); }} />
                    {v.durationLabel}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {opt && !opt.open && <p className="alert" role="alert">Applications for this option are not open yet.</p>}

          {opt?.open && opt.hostelChoice && (
            <fieldset className="ap-block">
              <legend className="lab">Student type <span className="req">(required)</span></legend>
              <div className="seg" role="radiogroup" aria-label="Student type">
                {([["day", "Day student"], ["hostel", "Hostel student"]] as const).map(([k, l]) => (
                  <label key={k} className={acc === k ? "on" : ""}>
                    <input type="radio" name="acc" checked={acc === k} onChange={() => setAcc(k)} />{l}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {opt?.open && opt.choose > 0 && (
            <fieldset className="ap-block">
              <legend className="lab">Your courses</legend>
              {hasInc && (
                <div className="ap-incl">
                  <b>{variant === "intensive-1y" ? "You will learn everything in the 6-month programme:" : "Included in this programme:"}</b>
                  <ul>{opt.included.map((x) => <li key={x.name}>{x.name}{x.description && <span className="small dim0 block">{x.description}</span>}</li>)}</ul>
                </div>
              )}
              <p className="ap-ask">
                {opt.choose === 1 ? (hasInc ? "Then choose one more course" : "Choose your course") : `Then choose ${opt.choose} more courses`} <span className="req">(required)</span>
              </p>
              {opt.choose > 1 && (
                <>
                  <p className="small" role="status">{picked.length} of {opt.choose} chosen{picked.length === opt.choose ? ". To pick a different course, remove one first." : ""}</p>
                  {picked.length > 0 && (
                    <ul className="ap-chosen" aria-label="Your chosen courses">
                      {picked.map((n) => <li key={n}><span>{n}</span><button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== n))} aria-label={`Remove ${n}`}>&times;</button></li>)}
                    </ul>
                  )}
                </>
              )}
              <div className="seg" role={opt.choose === 1 ? "radiogroup" : "group"} aria-label="Courses">
                {opt.choices.map((c) => (
                  <label key={c.name} className={picked.includes(c.name) ? "on" : ""}>
                    <input type={opt.choose === 1 ? "radio" : "checkbox"} name="choice" checked={picked.includes(c.name)}
                      disabled={opt.choose > 1 && !picked.includes(c.name) && picked.length >= opt.choose} onChange={() => toggle(c.name, opt.choose)} />
                    {c.name}{c.priceKobo ? ` (${formatNaira(c.priceKobo)})` : ""}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {opt?.open && opt.choose === 0 && opt.courses.length > 0 && (
            <div className="field">
              <label htmlFor="course">Preferred course <span className="opt-t">(optional)</span></label>
              <select id="course" value={picked[0] ?? ""} onChange={(e) => setPicked(e.target.value ? [e.target.value] : [])}>
                <option value="">No preference</option>
                {opt.courses.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          <p className="small">
            Fees: {opt?.tuition ?? "to be confirmed by the institution"}. Application-form fee: {formatNaira(vocConfig.applicationFee.kobo)}, non-refundable
            {vocConfig.applicationFee.creditedToTuition ? ". It is part of your total fees and is deducted from your school fees once you are accepted." : " and separate from tuition."}
          </p>

          <div className="acts">
            <button type="button" className="pill" disabled={!ready} onClick={changing ? toDetails : toDetails}>{changing ? "Save changes" : "Continue to your details"}</button>
            {changing && <button type="button" className="pill ghost" onClick={cancelChange}>Cancel</button>}
          </div>
          {!ready && missing && <p className="hint" role="status">{missing}</p>}
        </section>
      )}

      {step === 2 && (
        <form onSubmit={submit} noValidate aria-labelledby="s2">
          <h2 id="s2" className="serif">Step 2: Your details</h2>

          <div className="ap-sum">
            <div>
              <span className="lab green">Your programme</span>
              <p><b>{vinfo?.label}, {vinfo?.durationLabel}</b></p>
              {hasInc && opt && opt.choose > 0 && <p className="small">Includes: {opt.included.map((x) => x.name).join(", ")}</p>}
              {picked.length > 0 && <p className="small">Your courses: {picked.join(", ")}</p>}
              {acc && <p className="small">{acc === "hostel" ? "Hostel" : "Day"} student</p>}
            </div>
            <button type="button" className="pill ghost sm" onClick={startChange}>Change programme or courses</button>
          </div>

          <p className="small"><span className="req">(required)</span> fields must be completed.</p>

          {msg && (
            <div id="form-alert" tabIndex={-1} className="alert" role="alert">
              {msg}
              {dup && <p className="ap-alert-link"><Link href="/recover" className="linkbtn">Did not get the email? Send me the link again</Link></p>}{(errs.courses || errs.course || errs.accommodation || errs.variantId) && <p className="ap-alert-link"><button type="button" className="linkbtn" onClick={startChange}>Go back and fix your choices</button></p>}
            </div>
          )}

          <F id="fullName" label="Full name" req err={errs.fullName}>
            <input id="fullName" autoComplete="name" value={d.fullName} onChange={set("fullName")} aria-invalid={!!errs.fullName} aria-describedby={errs.fullName ? "fullName-e" : undefined} />
          </F>
          <F id="phone" label="Phone number" req err={errs.phone}>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={d.phone} onChange={set("phone")} aria-invalid={!!errs.phone} aria-describedby={errs.phone ? "phone-e" : undefined} />
          </F>
          <F id="email" label="Email address" req err={errs.email} hint="We send your application link and receipts here.">
            <input id="email" type="email" autoComplete="email" value={d.email} onChange={set("email")} aria-invalid={!!errs.email} aria-describedby={errs.email ? "email-e" : undefined} />
          </F>

          <div className="acts">
            <button className="pill" disabled={busy}>{busy ? "Saving…" : resume ? "Save changes and review" : "Save and review"}</button>
            {resume && <Link href={`/application/${resume.ref}/${resume.token}`} className="pill ghost">Cancel</Link>}
          </div>
          <p className="small dim0">Nothing is charged yet. You will review everything before paying.</p>
        </form>
      )}
    </div>
  );
}