"use client";
import { useCallback, useEffect, useState } from "react";
import { api, when } from "./shared";
import { allFormFields } from "@/config/admissionForm";
import "../voc/admission-form.css";

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Staff view of one application's admission form and payment safety nets. Shown inside Admin > Vocational studies > an application. */
export function AdmissionFormPanel({ refNo, onDone }: { refNo: string; onDone: () => void }) {
  const [info, setInfo] = useState<any>(null); const [msg, setMsg] = useState(""); const [note, setNote] = useState(""); const [payNote, setPayNote] = useState(""); const base = `/api/admin/voc/applications/${refNo}`;
  const load = useCallback(async () => { const r = await api(`${base}/form`); if (r.ok) setInfo(r.json); }, [base]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<{ ok: boolean; json: any }>, success: string) => { const r = await fn(); setMsg(r.ok ? success : r.json.error ?? "Failed."); await load(); onDone(); };
  if (!info) return null;
  const f = info.form; const files: any[] = f?.files ?? []; const scans = files.filter((x) => x.kind === "scan"); const passport = files.find((x) => x.kind === "passport");
  return (
    <div className="afpanel">
      <h4 className="serif">Admission form</h4>{msg && <p className="alert" role="status">{msg}</p>}
      {!info.paid ? <>
        <p className="small">The ₦5,000 is not recorded as paid ({String(info.paymentStatus).replace(/_/g, " ")}).</p>
        {info.attempts > 0 && <>
          <p className="small"><b>Paid, but it is not showing?</b> Only do this after you have seen the money in the Bachs dashboard.</p>
          <div className="field"><label htmlFor={`pn-${refNo}`}>Where did you check it? (for example the Bachs charge id)</label><input id={`pn-${refNo}`} value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div>
          <button className="pill sm" disabled={!payNote.trim()} onClick={() => { if (confirm(`Mark the ₦5,000 for ${refNo} as paid? Only do this if you have seen the money in Bachs.`)) run(() => api(`${base}/confirm-payment`, "POST", { note: payNote }), "Marked as paid. The applicant has been emailed."); }}>Mark ₦5,000 as paid</button></>}
      </> : <>
        {!f || (f.status === "draft" && !f.mode && !f.submittedAt) ? <p className="small">{f ? "The applicant has started the form but not submitted it." : "The applicant has not started the form yet."}</p> : <>
          <p className="small"><b>{f.status === "school_signed" ? "School section signed" : f.status === "submitted" ? `Submitted (${f.mode === "print" ? "signed copy uploaded" : "filled in and signed online"})` : "Sent back for correction"}</b>{f.submittedAt ? ` · ${when(f.submittedAt)}` : ""}{f.schoolSignedAt ? ` · signed ${when(f.schoolSignedAt)}` : ""}</p>
          {f.staffNote && <p className="small">Note sent: {f.staffNote}</p>}</>}
        {f && f.status !== "draft" && f.data && <details open><summary className="small"><b>What the applicant filled in</b></summary><dl className="small">{allFormFields.filter((x) => f.data[x.id]).map((x) => <div key={x.id}><dt>{x.label}</dt><dd>{f.data[x.id]}</dd></div>)}</dl></details>}
        {f && f.mode === "online" && f.status !== "draft" && <p><a className="pill sm" href={`${base}/form/pdf`} target="_blank" rel="noopener">Open form to print (PDF)</a> <span className="small">The &ldquo;For official use only&rdquo; box is left blank for the school to complete and sign.</span></p>}
        {(scans.length > 0 || passport) && <ul className="small">{passport && <li><a className="linkbtn" href={`${base}/form/file/${passport.id}`} target="_blank" rel="noopener">Passport photograph</a> ({kb(passport.size)})</li>}{scans.map((s) => <li key={s.id}><a className="linkbtn" href={`${base}/form/file/${s.id}`} target="_blank" rel="noopener">{s.name}</a> ({kb(s.size)})</li>)}</ul>}
        {f && f.status !== "draft" && <div className="acts">
          {f.status !== "school_signed" && <button className="pill sm" onClick={() => run(() => api(`${base}/form`, "PATCH", { action: "school_signed" }), "Marked as signed by the school.")}>Mark school section signed</button>}
          <button className="pill ghost sm" onClick={() => { if (confirm("Delete the uploaded files (photo, signatures, scans)? Do this only after the form has been printed and filed.")) run(() => api(`${base}/form`, "PATCH", { action: "purge" }), "Uploaded files deleted."); }}>Delete uploaded files</button></div>}
        {f && f.status !== "draft" && <div className="field"><label htmlFor={`rn-${refNo}`}>Something to correct? Tell the applicant:</label><input id={`rn-${refNo}`} value={note} onChange={(e) => setNote(e.target.value)} /><button className="pill ghost sm" disabled={!note.trim()} onClick={() => run(() => api(`${base}/form`, "PATCH", { action: "return", note }), "Sent back. The applicant has been emailed.")}>Send back for correction</button></div>}
        {info.admitted && <div className="acts"><button className="pill ghost sm" onClick={() => run(() => api(`${base}/accept-again`, "POST"), "Acceptance email and school-fees invoice re-sent.")}>Resend acceptance email and school-fees invoice</button></div>}
        {!info.admitted && f?.status === "submitted" && <p className="small">The form is in. After reviewing it, press <b>Accept student</b> above.</p>}
      </>}
    </div>
  );
}