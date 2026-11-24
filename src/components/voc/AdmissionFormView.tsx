"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { admissionForm, applicantName, headingCase, type FormField, type SignRole } from "@/config/admissionForm";
import type { FormViewData } from "@/server/voc/form";
import { SignaturePad } from "./SignaturePad";
import { ToastStack, useToasts } from "./Toast";
import "./admission-form.css";

const readAsDataUrl = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("read")); r.readAsDataURL(f); });
/** Reads a picture without a blob: address (the site's security policy blocks those, which made good photos "unreadable"). */
async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try { const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any); return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }; } catch { /* fall back to the slower route below */ }
  }
  const url = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img")); i.src = url; });
  return { src: img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, close: () => {} };
}
/** Shrinks a photo on the phone before upload, so uploads are small and fast. */
async function shrink(file: File, maxW: number, maxH: number, quality: number): Promise<string> {
  const pic = await decode(file);
  try {
    const k = Math.min(1, maxW / pic.w, maxH / pic.h); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(pic.w * k)); c.height = Math.max(1, Math.round(pic.h * k));
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("canvas"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(pic.src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally { pic.close(); }
}
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" }) : "");

/** Declared at module level on purpose: a component created inside another one is rebuilt on every keystroke and the input loses focus. */
function FieldInput({ f, value, err, onChange }: { f: FormField; value: string; err?: string; onChange: (v: string) => void }) {
  const id = `f-${f.id}`;
  return (
    <div className={`field ${err ? "bad" : ""}`} data-required={f.required ? "yes" : undefined}>
      <label htmlFor={id}>{f.label}{f.required && <span className="req" aria-hidden="true"> *</span>}</label>
      {f.kind === "select" ? <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} aria-required={f.required}><option value="">Choose&hellip;</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
        : <input id={id} type={f.kind} inputMode={f.kind === "tel" ? "tel" : undefined} maxLength={f.max} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} aria-required={f.required} />}
      {f.hint && <p className="hint">{f.hint}</p>}{err && <p className="err">{err}</p>}
    </div>
  );
}

export function AdmissionFormView({ refNo, token, initial }: { refNo: string; token: string; initial: FormViewData }) {
  const router = useRouter(); const [view, setView] = useState(initial); const [data, setData] = useState<Record<string, string>>(initial.data);
  const [sigs, setSigs] = useState<Partial<Record<SignRole, string | null>>>({}); const [confirmed, setConfirmed] = useState(initial.confirmed);
  const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(""); const [photoUrl, setPhotoUrl] = useState("");
  const [path, setPath] = useState<"" | "online" | "print">(initial.mode === "print" || initial.scans.length > 0 ? "print" : initial.passport || initial.signed.applicant ? "online" : "");
  const base = `/api/applications/${refNo}/form`; const back = `/application/${refNo}/${token}`; const pdfUrl = `${base}/pdf?t=${encodeURIComponent(token)}`;

  const { toasts, push, dismiss } = useToasts();
  /** Scrolls to the first thing that needs fixing, so an error is never somewhere the person cannot see. */
  const showFirstError = () => setTimeout(() => {
    const el = document.querySelector<HTMLElement>(".af .err"); if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" }); el.closest(".field")?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
  }, 80);
  const { A, B, C, D, E, F, G } = admissionForm; const name = applicantName(data);
  const fi = (f: FormField) => <FieldInput key={f.id} f={f} value={data[f.id] ?? ""} err={errs[f.id]} onChange={(v) => setData((p) => ({ ...p, [f.id]: v }))} />;
  const sigBlock = (role: SignRole) => { const b = admissionForm.signBlocks.find((x) => x.role === role)!; return (
    <div className="signbox"><p className="small"><b>{b.title}</b> <span className="req" aria-hidden="true">*</span><b>.</b> {b.hand}</p>
      <SignaturePad label={b.title} saved={view.signed[role]} pending={typeof sigs[role] === "string"} onChange={(u) => setSigs((p) => ({ ...p, [role]: u }))} />
      {errs[`sig_${role}`] && <p className="err">{errs[`sig_${role}`]}</p>}</div>); };

  const call = async (url: string, method: "POST" | "PUT", body: object): Promise<{ ok: boolean; json: any }> => {
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) }); return { ok: r.ok, json: await r.json().catch(() => ({})) }; }
    catch { return { ok: false, json: { error: "We couldn't reach the server. Please check your connection and try again." } }; }
  };
  const done = (r: { ok: boolean; json: any }, success: string) => {
    if (r.ok) { setView(r.json); setErrs({}); push(success, "success"); }
    else {
      const fe: Record<string, string> = r.json.fieldErrors ?? {}; const n = Object.keys(fe).length; setErrs(fe);
      push(n ? `${r.json.error ?? "Please check your form."} ${n === 1 ? "1 item needs" : `${n} items need`} your attention (marked in red).` : r.json.error ?? "Something went wrong.", "error");
      if (n) showFirstError();
    }
    setBusy("");
  };
  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "save");
    const r = await call(submit ? `${base}/submit` : base, submit ? "POST" : "PUT", { data, signatures: sigs, confirmed });
    if (r.ok) { setSigs({}); if (submit) router.refresh(); }
    done(r, submit ? "Your form has been submitted." : "Saved. You can come back and finish later.");
  };
  const uploadPassport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy("passport");
    try { const url = await shrink(f, 600, 800, 0.85); const r = await call(`${base}/passport`, "POST", { name: "passport.jpg", data: url }); if (r.ok) setPhotoUrl(url); done(r, "Photograph added."); }
    catch { push("That photograph could not be read. Try another one.", "error"); setBusy(""); }
  };
  const uploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy("scan");
    try {
      if (f.type === "application/pdf" && f.size > 2_000_000) { push("That PDF is too large (up to 2 MB). Take photos of the pages instead.", "error"); setBusy(""); return; }
      const url = f.type === "application/pdf" ? await readAsDataUrl(f) : await shrink(f, 1600, 2200, 0.72);
      done(await call(`${base}/scan`, "POST", { name: f.name, data: url }), "File added.");
    } catch { push("That file could not be read. Try another one.", "error"); setBusy(""); }
  };
  const removeScan = async (fileId: string) => { setBusy("scan"); done(await call(`${base}/remove`, "POST", { fileId }), "File removed."); };
  const sendPrint = async () => { setBusy("print"); const r = await call(`${base}/print-submit`, "POST", {}); if (r.ok) router.refresh(); done(r, "Your signed form has been submitted."); };

  if (view.status !== "draft") return (
    <div className="af">
      <ToastStack toasts={toasts} dismiss={dismiss} />
      <div className="paybox ok" role="status"><b className="serif">{view.status === "school_signed" ? "The school has signed your form" : "Form received"}</b>
        <span>{view.status === "school_signed" ? `The school signed your form on ${when(view.schoolSignedAt)}. Wait for our email about your acceptance.` : `We received your form${view.submittedAt ? ` on ${when(view.submittedAt)}` : ""}. Next, wait for our email confirming your acceptance. School fees can be paid only after you are accepted.`}</span></div>
      <div className="acts">{view.mode !== "print" && <a className="pill" href={pdfUrl} target="_blank" rel="noopener">Download a copy (PDF)</a>}<Link className="pill ghost" href={back}>Back to your application</Link></div>
    </div>
  );
  return (
    <div className="af">
      {view.isPlaceholder && <p className="ap-note" role="note">This is a draft template. The school will replace it with its final form.</p>}
      {view.staffNote && <div className="alert" role="alert"><b>We sent your form back:</b> {view.staffNote}</div>}
      <ToastStack toasts={toasts} dismiss={dismiss} />
      <fieldset className="ap-block"><legend className="lab">How do you want to complete it?</legend>
        <div className="seg" role="radiogroup" aria-label="How to complete the form">
          <label className={path === "online" ? "on" : ""}><input type="radio" name="path" checked={path === "online"} onChange={() => setPath("online")} />Fill in and sign on this page</label>
          <label className={path === "print" ? "on" : ""}><input type="radio" name="path" checked={path === "print"} onChange={() => setPath("print")} />Print, sign and upload</label>
        </div></fieldset>

      {path === "online" && <>
        <p className="legend"><span className="req">*</span> marks a compulsory field. <b>Every part of this form must be filled in</b>; if something does not apply to you, write N/A (or None). In Section B only the first school is compulsory, and in Section C you must choose at least one course. You will need a passport photograph. This is the school&rsquo;s own form, section by section. Your sponsor, your recommender and your witness each sign in their own box: hand them the phone or computer when it is their turn.</p>
        <section className="fsec" aria-labelledby="h-A">
          <div className="personal-head">
            <h2 id="h-A" className="serif">{headingCase(A.title)}</h2>
            <div className="passport-upload">
              <h3 className="serif">{admissionForm.passportLabel} <span className="req" aria-hidden="true">*</span></h3>
              <div className="passrow"><div className="passportbox">{photoUrl ? <img src={photoUrl} alt="Your passport photograph" /> : <span className="small">{view.passport ? "Photograph added" : "No photograph yet"}</span>}</div>
                <div><label className="pill ghost sm">{busy === "passport" ? "Uploading\u2026" : view.passport ? "Replace" : "Add photo"}<input className="sr" type="file" accept="image/*" onChange={uploadPassport} disabled={!!busy} /></label>
                  <p className="hint">Recent, front-facing photo on a plain background.</p>{errs.passport && <p className="err">{errs.passport}</p>}</div></div>
            </div>
          </div>
          <div className="name3">{A.nameFields.map(fi)}</div><div className="grid-f2">{A.fields.map(fi)}</div></section>        <section className="fsec" aria-labelledby="h-B"><h2 id="h-B" className="serif">{headingCase(B.title)}</h2>
          {B.rows.map((r, i) => <div key={i} className="schrow" role="group" aria-label={`School ${i + 1}`}>{r.map(fi)}</div>)}
          <p className="hint">{B.note}</p></section>
        <section className="fsec" aria-labelledby="h-C"><h2 id="h-C" className="serif">{headingCase(C.title)} <span className="req" aria-hidden="true">*</span></h2><p className="small">{C.instruction} Choose at least one course.</p>
          {C.courses.map((c, i) => { const cur = data[c.id] ?? ""; return (
            <div key={c.id} className="crs" role="radiogroup" aria-label={c.name}><b>{i + 1}. {headingCase(c.name)}</b>
              <div className="modes">{["", ...C.modes].map((m) => <label key={m} className={cur === m ? "on" : ""}><input type="radio" name={`c-${c.id}`} checked={cur === m} onChange={() => setData((p) => ({ ...p, [c.id]: m }))} />{m || "Not applying"}</label>)}</div></div>); })}
          {errs.courses && <p className="err">{errs.courses}</p>}</section>
        <section className="fsec" aria-labelledby="h-D"><h2 id="h-D" className="serif">{headingCase(D.title)}</h2><p className="small">{D.subtitle}</p>
          <p>{D.lead} {D.leadLine2} <b>{name || "(fill in Section A first)"}</b></p><div className="grid-f2">{D.fields.map(fi)}</div>{sigBlock("sponsor")}</section>
        <section className="fsec" aria-labelledby="h-E"><h2 id="h-E" className="serif">{headingCase(E.title)}</h2><p className="small">{E.subtitle}</p>
          <p>{E.before} <b>{data.knownYears || "___"}</b> {E.after} {E.line2}</p><div className="grid-f2">{E.fields.map(fi)}</div>{sigBlock("recommender")}</section>
        <section className="fsec" aria-labelledby="h-F"><h2 id="h-F" className="serif">{headingCase(F.title)}</h2><p>{F.lines.join(" ")}</p></section>
        <section className="fsec" aria-labelledby="h-G"><h2 id="h-G" className="serif">{headingCase(G.title)}</h2><p className="small">{G.subtitle}</p>
          <p>{G.paragraph.join(" ")}</p><p><b>{name || "(fill in Section A first)"}</b> {G.paragraph2.join(" ")}</p>
          <p className="small">Name in full (of the applicant): <b>{name || "(fill in Section A first)"}</b></p>{sigBlock("applicant")}
          <div className="grid-f2">{G.fields.map(fi)}</div>{sigBlock("witness")}</section>
        <section className="fsec"><label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> <span className="req" aria-hidden="true">*</span> {admissionForm.confirmation}</label>{errs.confirmed && <p className="err">{errs.confirmed}</p>}</section>
        <div className="acts"><button className="pill" disabled={!!busy} onClick={() => save(true)}>{busy === "submit" ? "Submitting\u2026" : "Submit form"}</button><button className="pill ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving\u2026" : "Save and continue later"}</button><Link className="linkbtn" href={back}>Back to your application</Link></div>
      </>}

      {path === "print" && <>
        <section className="fsec"><h2 className="serif">1. Download and print the form</h2><p>Any details we already have (such as your phone number) are filled in. Fill in the rest by hand, then have your sponsor, your recommender, yourself and your witness sign.</p>
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