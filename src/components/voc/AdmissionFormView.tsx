"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { admissionForm, type FormField, type SignRole } from "@/config/admissionForm";
import type { FormViewData } from "@/server/voc/form";
import { SignaturePad } from "./SignaturePad";
import "./admission-form.css";

const readAsDataUrl = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("read")); r.readAsDataURL(f); });
/** Shrinks a photo on the phone before upload, so uploads are small and fast. */
async function shrink(file: File, maxW: number, maxH: number, quality: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img")); i.src = url; });
    const k = Math.min(1, maxW / img.width, maxH / img.height); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("canvas"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally { URL.revokeObjectURL(url); }
}
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" }) : "");

/** Declared at module level on purpose: a component created inside another one is rebuilt on every keystroke and the input loses focus. */
function FieldInput({ f, value, err, onChange }: { f: FormField; value: string; err?: string; onChange: (v: string) => void }) {
  const id = `f-${f.id}`;
  return (
    <div className={`field ${err ? "bad" : ""} ${f.kind === "textarea" ? "span2" : ""}`}>
      <label htmlFor={id}>{f.label} {f.required && <span className="req">(required)</span>}</label>
      {f.kind === "textarea" ? <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} />
        : f.kind === "select" ? <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err}><option value="">Choose&hellip;</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
        : <input id={id} type={f.kind} inputMode={f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : undefined} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} />}
      {f.hint && <p className="hint">{f.hint}</p>}{err && <p className="err">{err}</p>}
    </div>
  );
}

export function AdmissionFormView({ refNo, token, initial }: { refNo: string; token: string; initial: FormViewData }) {
  const router = useRouter(); const [view, setView] = useState(initial); const [data, setData] = useState<Record<string, string>>(initial.data);
  const [sigs, setSigs] = useState<Partial<Record<SignRole, string | null>>>({}); const [confirmed, setConfirmed] = useState(initial.confirmed);
  const [errs, setErrs] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(""); const [photoUrl, setPhotoUrl] = useState("");
  const [path, setPath] = useState<"" | "online" | "print">(initial.mode === "print" || initial.scans.length > 0 ? "print" : initial.passport || initial.signed.applicant ? "online" : "");
  const base = `/api/applications/${refNo}/form`; const back = `/application/${refNo}/${token}`; const pdfUrl = `${base}/pdf?t=${encodeURIComponent(token)}`;

  const call = async (url: string, method: "POST" | "PUT", body: object): Promise<{ ok: boolean; json: any }> => {
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) }); return { ok: r.ok, json: await r.json().catch(() => ({})) }; }
    catch { return { ok: false, json: { error: "We couldn't reach the server. Please check your connection and try again." } }; }
  };
  const done = (r: { ok: boolean; json: any }, success: string) => {
    if (r.ok) { setView(r.json); setErrs({}); setMsg(""); setOk(success); } else { setErrs(r.json.fieldErrors ?? {}); setMsg(r.json.error ?? "Something went wrong."); setOk(""); }
    setBusy("");
  };
  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "save"); setMsg(""); setOk("");
    const r = await call(submit ? `${base}/submit` : base, submit ? "POST" : "PUT", { data, signatures: sigs, confirmed });
    if (r.ok) { setSigs({}); if (submit) router.refresh(); }
    done(r, submit ? "Your form has been submitted." : "Saved. You can come back and finish later.");
    if (!r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const uploadPassport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy("passport"); setMsg(""); setOk("");
    try { const url = await shrink(f, 600, 800, 0.85); const r = await call(`${base}/passport`, "POST", { name: "passport.jpg", data: url }); if (r.ok) setPhotoUrl(url); done(r, "Photograph added."); }
    catch { setMsg("That photograph could not be read. Try another one."); setBusy(""); }
  };
  const uploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy("scan"); setMsg(""); setOk("");
    try {
      if (f.type === "application/pdf" && f.size > 2_000_000) { setMsg("That PDF is too large (up to 2 MB). Take photos of the pages instead."); setBusy(""); return; }
      const url = f.type === "application/pdf" ? await readAsDataUrl(f) : await shrink(f, 1600, 2200, 0.72);
      done(await call(`${base}/scan`, "POST", { name: f.name, data: url }), "File added.");
    } catch { setMsg("That file could not be read. Try another one."); setBusy(""); }
  };
  const removeScan = async (fileId: string) => { setBusy("scan"); done(await call(`${base}/remove`, "POST", { fileId }), "File removed."); };
  const sendPrint = async () => { setBusy("print"); const r = await call(`${base}/print-submit`, "POST", {}); if (r.ok) router.refresh(); done(r, "Your signed form has been submitted."); };

  if (view.status !== "draft") return (
    <div className="af">
      <div className="paybox ok" role="status"><b className="serif">{view.status === "school_signed" ? "The school has signed your form" : "Form received"}</b>
        <span>{view.status === "school_signed" ? `The school signed your form on ${when(view.schoolSignedAt)}. Wait for our email about your acceptance.` : `We received your form${view.submittedAt ? ` on ${when(view.submittedAt)}` : ""}. Next, wait for our email confirming your acceptance. School fees can be paid only after you are accepted.`}</span></div>
      <div className="acts">{view.mode !== "print" && <a className="pill" href={pdfUrl} target="_blank" rel="noopener">Download a copy (PDF)</a>}<Link className="pill ghost" href={back}>Back to your application</Link></div>
    </div>
  );
  return (
    <div className="af">
      {view.isPlaceholder && <p className="ap-note" role="note">This is a draft template. The school will replace it with its final form.</p>}
      {view.staffNote && <div className="alert" role="alert"><b>We sent your form back:</b> {view.staffNote}</div>}
      {msg && <div className="alert" role="alert">{msg}</div>}{ok && <p className="alert okmsg" role="status">{ok}</p>}
      <fieldset className="ap-block"><legend className="lab">How do you want to complete it?</legend>
        <div className="seg" role="radiogroup" aria-label="How to complete the form">
          <label className={path === "online" ? "on" : ""}><input type="radio" name="path" checked={path === "online"} onChange={() => setPath("online")} />Fill in and sign on this page</label>
          <label className={path === "print" ? "on" : ""}><input type="radio" name="path" checked={path === "print"} onChange={() => setPath("print")} />Print, sign and upload</label>
        </div></fieldset>

      {path === "online" && <>
        <p className="small">You will need a passport photograph. Your parent or guardian and your lawyer each sign in their own box below: hand them the phone or computer when it is their turn.</p>
        {admissionForm.sections.map((s) => (
          <section key={s.id} className="fsec" aria-labelledby={`h-${s.id}`}><h2 id={`h-${s.id}`} className="serif">{s.title}</h2>{s.intro && <p className="small">{s.intro}</p>}
            <div className="grid-f2">{s.fields.map((f) => <FieldInput key={f.id} f={f} value={data[f.id] ?? ""} err={errs[f.id]} onChange={(v) => setData((p) => ({ ...p, [f.id]: v }))} />)}</div></section>))}
        <section className="fsec"><h2 className="serif">{admissionForm.passportLabel}</h2>
          <div className="passrow"><div className="passportbox">{photoUrl ? <img src={photoUrl} alt="Your passport photograph" /> : <span className="small">{view.passport ? "Photograph added" : "No photograph yet"}</span>}</div>
            <div><label className="pill ghost sm">{busy === "passport" ? "Uploading\u2026" : view.passport ? "Replace photograph" : "Add photograph"}<input className="sr" type="file" accept="image/*" onChange={uploadPassport} disabled={!!busy} /></label>
              <p className="hint">A clear, recent, front-facing photograph on a plain background.</p>{errs.passport && <p className="err">{errs.passport}</p>}</div></div></section>
        {admissionForm.signBlocks.map((b) => (
          <section key={b.role} className="fsec"><h2 className="serif">{b.title}</h2><p>{b.declaration}</p>
            <p className="small">Name: <b>{data[b.nameField] || "(fill in the name above first)"}</b></p>
            <SignaturePad label={`Signature: ${b.title}`} saved={view.signed[b.role]} pending={typeof sigs[b.role] === "string"} onChange={(u) => setSigs((p) => ({ ...p, [b.role]: u }))} />
            {errs[`sig_${b.role}`] && <p className="err">{errs[`sig_${b.role}`]}</p>}</section>))}
        <section className="fsec"><label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {admissionForm.confirmation}</label>{errs.confirmed && <p className="err">{errs.confirmed}</p>}</section>
        <div className="acts"><button className="pill" disabled={!!busy} onClick={() => save(true)}>{busy === "submit" ? "Submitting\u2026" : "Submit form"}</button><button className="pill ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving\u2026" : "Save and continue later"}</button><Link className="linkbtn" href={back}>Back to your application</Link></div>
      </>}

      {path === "print" && <>
        <section className="fsec"><h2 className="serif">1. Download and print the form</h2><p>Your name and programme are already filled in. Fill in the rest by hand, then have your parent or guardian, your lawyer and yourself sign.</p>
          <a className="pill" href={`${pdfUrl}&blank=1`} target="_blank" rel="noopener">Download printable form (PDF)</a></section>
        <section className="fsec"><h2 className="serif">2. Upload the signed form</h2><p>Take a clear photo of each page, or upload a PDF scan.</p>
          <label className="pill ghost sm">{busy === "scan" ? "Uploading\u2026" : "Add a photo or scan"}<input className="sr" type="file" accept="image/*,application/pdf" onChange={uploadScan} disabled={!!busy || view.scans.length >= 3} /></label>
          <p className="hint">Up to 3 files, 2 MB each. Photos are reduced automatically.</p>
          {view.scans.length > 0 && <ul className="scanlist">{view.scans.map((s) => <li key={s.id}><span>{s.name} <span className="small dim0">({kb(s.size)})</span></span><button type="button" className="linkbtn" disabled={!!busy} onClick={() => removeScan(s.id)}>Remove</button></li>)}</ul>}</section>
        <div className="acts"><button className="pill" disabled={!!busy || view.scans.length === 0} onClick={sendPrint}>{busy === "print" ? "Submitting\u2026" : "Submit signed form"}</button><Link className="linkbtn" href={back}>Back to your application</Link></div>
      </>}
    </div>
  );
}