"use client";
import { UploadButton } from "./shared";
import { useCallback, useEffect, useState } from "react";
import { VARIANTS } from "@/config/vocational";
import { decimalToKobo, formatNaira } from "@/lib/money";
import { parseCourses, parseCurriculum, parseFees, parseLines, serializeCourses, serializeCurriculum, serializeFees } from "@/lib/voc-text";

const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.reload(); throw new Error("Signed out"); }
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
};
const label = (s: string) => s.replace(/_/g, " ");
type Sub = "applications" | "programmes" | "media";

export function AdminVoc() {
  const [sub, setSub] = useState<Sub>("applications");
  return (<div><nav className="admin-tabs sub" aria-label="Vocational sections">{(["applications", "programmes", "media"] as Sub[]).map((s) => <button key={s} className={sub === s ? "on" : ""} aria-pressed={sub === s} onClick={() => setSub(s)}>{s === "applications" ? "Applications and invoices" : s === "programmes" ? "Programmes and fees" : "Photos, videos, testimonials"}</button>)}</nav>
    {sub === "applications" && <Applications />}{sub === "programmes" && <Programmes />}{sub === "media" && <Media />}</div>);
}

function Applications() {
  const [list, setList] = useState<any[] | null>(null); const [status, setStatus] = useState(""); const [open, setOpen] = useState<string | null>(null); const [det, setDet] = useState<any>(null); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api(`/api/admin/voc/applications${status ? `?status=${status}` : ""}`); if (r.ok) setList(r.json.applications); }, [status]);
  const loadDet = useCallback(async (ref: string) => { const r = await api(`/api/admin/voc/applications/${ref}`); if (r.ok) setDet(r.json); }, []);
  useEffect(() => { load(); }, [load]); useEffect(() => { if (open) loadDet(open); else setDet(null); }, [open, loadDet]);
  const act = async (fn: () => Promise<{ ok: boolean; json: any }>, ok: string) => { const r = await fn(); setMsg(r.ok ? ok : r.json.error ?? "Failed."); if (open) loadDet(open); load(); return r; };
  const [lines, setLines] = useState("tuition | Tuition | \n"); const [due, setDue] = useState(""); const [terms, setTerms] = useState(""); const [pay, setPay] = useState({ amount: "", ref: "", note: "" });
  const makeInvoice = async () => {
    const out: { kind: string; label: string; amountKobo: number }[] = []; for (const l of parseLines(lines)) { const [kind, lab, amt] = l.split("|").map((x) => x.trim()); const k = decimalToKobo(amt); if (k === null) { setMsg(`Line "${l}": use "kind | label | amount in naira".`); return; } out.push({ kind, label: lab, amountKobo: k }); }
    await act(() => api(`/api/admin/voc/applications/${open}/invoices`, "POST", { lines: out, dueDate: due || undefined, paymentTerms: terms || undefined }), "Draft invoice created.");
  };
  return (
    <section aria-labelledby="av"><div className="bar"><h2 id="av" className="serif">Applications</h2><label className="inl"><span className="sr">Filter</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["draft", "awaiting_payment", "submitted", "under_review", "admitted", "not_admitted", "waitlisted", "withdrawn"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label><button className="pill ghost sm" onClick={load}>Refresh</button></div>
      {msg && <p className="alert" role="status">{msg}</p>}
      {!list ? <p role="status">Loading…</p> : list.length === 0 ? <div className="empty"><p className="serif empty-title">No applications yet.</p></div> : (
        <ul className="orders">{list.map((a) => (<li key={a.ref}>
          <button className="orow" aria-expanded={open === a.ref} onClick={() => setOpen(open === a.ref ? null : a.ref)}><b>{a.ref}</b><span>{a.name}</span><span>{a.duration}</span><span className="tag">{label(a.status)}</span><span className={`tag pay-${a.paymentStatus}`}>fee: {label(a.paymentStatus)}</span><span className="small">{a.programme}</span></button>
          {open === a.ref && det && (
            <div className="odetail">
              <div><b>Applicant</b><p>{det.details.fullName}<br />{det.details.phone}<br />{det.details.email}<br />{det.details.address}{det.details.dob ? <><br />DOB {det.details.dob}</> : null}</p>{det.details.education && <p>Education: {det.details.education}</p>}{det.details.emergencyName && <p>Emergency: {det.details.emergencyName}, {det.details.emergencyPhone}</p>}{det.details.additional && <p>Notes: {det.details.additional}</p>}
                <b>{det.programme}, {det.duration}{det.course ? ` · ${det.course}` : ""}</b>
                <div className="acts">{["under_review", "admitted", "not_admitted", "waitlisted", "withdrawn"].map((s) => <button key={s} className={`pill sm ${s === "withdrawn" || s === "not_admitted" ? "ghost" : ""}`} onClick={() => { if (!["admitted", "not_admitted", "withdrawn"].includes(s) || confirm(`Set ${det.ref} to ${label(s)}? The applicant will see this status.`)) act(() => api(`/api/admin/voc/applications/${det.ref}`, "PATCH", { status: s }), `Status set to ${label(s)}.`); }}>{label(s)}</button>)}</div>
                <p className="small">Payment of the application-form fee does not admit anyone. Admission is only set by staff here.</p></div>
              <div><b>Application-form fee: {label(det.payment.status)}</b><ul className="small">{det.payment.attempts.map((x: any) => <li key={x.reference}>{x.reference}: {x.status}{x.chargeId ? ` (${x.chargeId})` : ""}{x.error ? ` – ${x.error}` : ""}</li>)}</ul>
                <b>Receipts</b><ul className="small">{det.receipts.map((r: any) => <li key={r.number}><a href={`/api/admin/voc/receipts/${r.number}/pdf`} target="_blank" rel="noopener">{r.number}</a> {formatNaira(r.amountKobo)} ({r.kind === "application_fee" ? "application fee" : r.invoiceNumber})</li>)}{det.receipts.length === 0 && <li>None</li>}</ul>
                <b>History</b><ul className="small notes">{det.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>
              <div><b>Invoices</b>{det.invoices.map((i: any) => (<div key={i.number} className="inv"><header><b>{i.number}</b><span className="tag">{i.state.replace("_", " ")}</span></header>
                <p className="small">Total {formatNaira(i.totals.totalKobo)} · paid {formatNaira(i.totals.paidKobo)} · <b>outstanding {formatNaira(i.totals.outstandingKobo)}</b></p>
                <div className="acts"><a className="linkbtn" href={`/api/admin/voc/invoices/${i.number}/pdf`} target="_blank" rel="noopener">PDF</a>{i.state === "draft" && <button className="pill sm" onClick={() => act(() => api(`/api/admin/voc/invoices/${i.number}`, "PUT", { action: "issue" }), "Invoice issued.")}>Issue</button>}{(i.state === "draft" || (i.state === "unpaid" && i.payments.length === 0)) && <button className="pill ghost sm" onClick={() => confirm("Void this invoice?") && act(() => api(`/api/admin/voc/invoices/${i.number}`, "PUT", { action: "void" }), "Invoice voided.")}>Void</button>}</div>
                {(i.state === "unpaid" || i.state === "part_paid") && <form className="inl-form" onSubmit={(e) => { e.preventDefault(); const k = decimalToKobo(pay.amount); if (k === null) return setMsg("Enter the amount in naira."); act(() => api(`/api/admin/voc/invoices/${i.number}/payments`, "POST", { amountKobo: k, reference: pay.ref, note: pay.note }), "Payment recorded and receipt issued."); }}>
                  <div className="field"><label>Record payment (₦)</label><input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div><div className="field"><label>Bank/teller reference</label><input value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} /></div><button className="pill sm">Record</button></form>}</div>))}
                <div className="field"><label htmlFor="il">New invoice lines (one per line: tuition|accommodation|other|discount | label | ₦ amount)</label><textarea id="il" rows={4} value={lines} onChange={(e) => setLines(e.target.value)} /></div>
                <div className="grid-f2"><div className="field"><label htmlFor="id">Due date</label><input id="id" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div><div className="field"><label htmlFor="it">Payment terms</label><input id="it" value={terms} onChange={(e) => setTerms(e.target.value)} /></div></div>
                <button className="pill sm" onClick={makeInvoice}>Create draft invoice</button><p className="small">The application-form fee is separate and is never added to an invoice.</p></div>
            </div>)}
        </li>))}</ul>)}
    </section>
  );
}

function Programmes() {
  const [vid, setVid] = useState<string>(VARIANTS[0].id); const [f, setF] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api(`/api/admin/voc/content/${vid}`).then((r) => { const c = r.json; setF({ open: c.open, published: c.published, summary: c.summary ?? "", intakeNote: c.intakeNote ?? "", courses: serializeCourses(c.courses), curriculum: serializeCurriculum(c.curriculum), requirements: c.requirements.join("\n"), benefits: c.benefits.join("\n"), fees: serializeFees(c.fees), acc: c.accommodation.available === null ? "" : String(c.accommodation.available), accNote: c.accommodation.note ?? "" }); }); setMsg(""); }, [vid]);
  if (!f) return <p role="status">Loading…</p>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const co = parseCourses(f.courses), cu = parseCurriculum(f.curriculum), fe = parseFees(f.fees); if (!co.ok) return setMsg(co.error); if (!cu.ok) return setMsg(cu.error); if (!fe.ok) return setMsg(fe.error);
    const r = await api(`/api/admin/voc/content/${vid}`, "PUT", { open: f.open, published: f.published, summary: f.summary, intakeNote: f.intakeNote, courses: co.value, curriculum: cu.value, requirements: parseLines(f.requirements), benefits: parseLines(f.benefits), fees: fe.value.map((x) => ({ ...x, amountKobo: x.amountKobo })), accommodation: { available: f.acc === "" ? null : f.acc === "true", note: f.accNote } });
    setMsg(r.ok ? "Saved." : r.json.error ?? "Could not save.");
  };
  const T = (k: string, l: string, rows = 3, hint?: string) => <div className="field"><label htmlFor={k}>{l}</label><textarea id={k} rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <p className="hint">{hint}</p>}</div>;
  return (
    <section aria-labelledby="pv"><h2 id="pv" className="serif">Programmes and fees</h2>
      <div className="field"><label htmlFor="vsel">Programme option</label><select id="vsel" value={vid} onChange={(e) => setVid(e.target.value)}>{VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}, {v.durationLabel}</option>)}</select></div>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form className="adminform" onSubmit={save}>
        <div className="checks"><label className="check"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Show details on the website</label><label className="check"><input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} /> Accepting applications</label></div>
        {T("summary", "Overview", 3)}{T("intakeNote", "Intake / start date note", 1)}
        {T("courses", "Courses (one per line: Name | description)", 4)}{T("curriculum", "Curriculum (# Module title, then - topic lines)", 6)}{T("requirements", "Admission requirements (one per line)", 4)}{T("benefits", "Programme benefits (one per line; confirmed claims only)", 3)}
        {T("fees", "Fees (one per line: Label | tuition/accommodation/other | amount in ₦ | note). Leave the amount empty if not confirmed.", 4)}
        <div className="grid-f2"><div className="field"><label htmlFor="acc">Accommodation</label><select id="acc" value={f.acc} onChange={(e) => setF({ ...f, acc: e.target.value })}><option value="">Not stated (hidden)</option><option value="true">Available</option><option value="false">Not offered</option></select></div><div className="field"><label htmlFor="accNote">Accommodation note</label><input id="accNote" value={f.accNote} onChange={(e) => setF({ ...f, accNote: e.target.value })} /></div></div>
        <button className="pill sm">Save</button></form>
    </section>
  );
}

function Media() {
  const [kind, setKind] = useState<"portfolio" | "video" | "testimonial">("portfolio"); const [items, setItems] = useState<any[]>([]); const [f, setF] = useState<any>({}); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api(`/api/admin/voc/media/${kind}`); if (r.ok) setItems(r.json.items); }, [kind]); useEffect(() => { load(); setF({}); setMsg(""); }, [load]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); const r = await api(`/api/admin/voc/media/${kind}`, "POST", { ...f, published: !!f.published, permission: !!f.permission }); setMsg(r.ok ? "Saved." : r.json.error); if (r.ok) setF({}); load(); };
  const toggle = async (i: any) => { const r = await api(`/api/admin/voc/media/${kind}/${i.id}`, "PUT", { ...i, published: !i.published }); setMsg(r.ok ? "Updated." : r.json.error); load(); };
  const I = (k: string, l: string) => <div className="field"><label htmlFor={`m-${k}`}>{l}</label><input id={`m-${k}`} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>;
  return (
    <section aria-labelledby="mv"><h2 id="mv" className="serif">Photos, videos and testimonials</h2>
      <div className="seg" role="radiogroup" aria-label="Type">{(["portfolio", "video", "testimonial"] as const).map((k) => <label key={k} className={kind === k ? "on" : ""}><input type="radio" name="mk" checked={kind === k} onChange={() => setKind(k)} />{k === "portfolio" ? "Portfolio photos" : k === "video" ? "Training videos" : "Testimonials"}</label>)}</div>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form className="adminform" onSubmit={save}><div className="grid-f">
        {kind === "portfolio" && <><div className="field"><label htmlFor="m-kind">Type</label><select id="m-kind" value={f.kind ?? ""} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Choose…</option><option value="project">Completed project</option><option value="student">Student work</option><option value="instructor">Instructor demonstration</option><option value="facility">Training facility</option></select></div>{I("title", "Title")}{I("imageUrl", "Photo path or URL")}<div className="field"><UploadButton onUploaded={(u) => setF({ ...f, imageUrl: u })} /></div>{I("imageAlt", "Alt text")}{I("caption", "Caption")}</>}
        {kind === "video" && <>{I("title", "Title")}{I("src", "Video path or URL")}{I("captions", "Captions file (.vtt) path or URL")}{I("poster", "Poster image (optional)")}{I("description", "Description")}</>}
        {kind === "testimonial" && <>{I("name", "Name")}{I("relation", "Relationship (e.g. past student)")}{I("quote", "Quote")}<label className="check"><input type="checkbox" checked={!!f.permission} onChange={(e) => setF({ ...f, permission: e.target.checked })} /> Written permission received</label></>}
      </div><label className="check"><input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Publish on the website</label><div className="acts"><button className="pill sm">Add</button></div></form>
      {items.length === 0 ? <div className="empty"><p className="serif empty-title">Nothing added yet.</p></div> : <table className="atable"><thead><tr><th>Item</th><th>Published</th><th><span className="sr">Actions</span></th></tr></thead><tbody>{items.map((i) => <tr key={i.id}><td><b>{i.title ?? i.name}</b>{i.kind ? ` · ${i.kind}` : ""}</td><td><label className="check"><input type="checkbox" checked={i.published} onChange={() => toggle(i)} aria-label={`${i.title ?? i.name} published`} /></label></td><td><button className="linkbtn" onClick={async () => { if (confirm("Delete?")) { await api(`/api/admin/voc/media/${kind}/${i.id}`, "DELETE"); load(); } }}>Delete</button></td></tr>)}</tbody></table>}
    </section>
  );
}
