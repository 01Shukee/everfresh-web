"use client";
import { ImagePreview, UploadButton } from "./shared";
import { useCallback, useEffect, useState } from "react";
import { decimalToKobo, formatNaira } from "@/lib/money";
import { parseLines } from "@/lib/voc-text";

const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.reload(); throw new Error("Signed out"); }
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
};
const label = (s: string) => s.replace(/_/g, " "); const STATUSES = ["new", "contacted", "quote_in_progress", "quote_sent", "confirmed", "on_hold", "lost", "completed"];
const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
const long = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "UTC" });

export function AdminCatering() {
  const [sub, setSub] = useState<"enquiries" | "content">("enquiries");
  return <div><nav className="admin-tabs sub" aria-label="Catering sections">{(["enquiries", "content"] as const).map((s) => <button key={s} className={sub === s ? "on" : ""} aria-pressed={sub === s} onClick={() => setSub(s)}>{s === "enquiries" ? "Enquiries" : "Categories, services and gallery"}</button>)}</nav>{sub === "enquiries" ? <Enquiries /> : <Content />}</div>;
}

function Enquiries() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [list, setList] = useState<any[] | null>(null); const [open, setOpen] = useState<string | null>(null); const [det, setDet] = useState<any>(null); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api(`/api/admin/catering/enquiries?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}`); if (r.ok) setList(r.json.enquiries); }, [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (!open) return setDet(null); api(`/api/admin/catering/enquiries/${open}`).then((r) => r.ok && setDet(r.json)); }, [open]);
  const act = async (action: string, body: object, ok: string) => { const r = await api(`/api/admin/catering/enquiries/${open}/${action}`, "POST", body); setMsg(r.ok ? ok : r.json.error ?? "Failed."); if (r.ok) setDet(r.json); load(); return r.ok; };
  const [note, setNote] = useState(""); const [ct, setCt] = useState({ method: "call", direction: "outbound", summary: "" }); const [qt, setQt] = useState({ status: "draft", amount: "", note: "" });
  return (
    <section aria-labelledby="eh"><div className="bar"><h2 id="eh" className="serif">Catering enquiries</h2></div>
      <div className="searchbar"><label className="field"><span className="sr">Search enquiries</span><input type="search" placeholder="Search name, phone, reference, location, notes…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="inl"><span className="sr">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label></div>
      {msg && <p className="alert" role="status">{msg}</p>}
      {!list ? <p role="status">Loading…</p> : list.length === 0 ? <div className="empty"><p className="serif empty-title">{q || status ? "No enquiries match." : "No enquiries yet."}</p></div> : (
        <ul className="orders">{list.map((e) => (<li key={e.ref}>
          <button className="orow" aria-expanded={open === e.ref} onClick={() => setOpen(open === e.ref ? null : e.ref)}><b>{e.ref}</b><span>{e.name}</span><span>{e.eventType} · {long(e.eventDate)}</span><span className="tag">{label(e.status)}</span><span className="tag wa-t">{e.whatsapp.staffConfirmedAt ? "WhatsApp received" : e.whatsapp.openedAt ? "WhatsApp opened (not confirmed)" : "WhatsApp not opened"}</span><span className="small">{e.guests} guests</span></button>
          {open === e.ref && det && (<div className="odetail">
            <div><b>Event</b><p>{det.eventType}<br />{long(det.eventDate)}<br />{det.location}<br />{det.guests} guests{det.style ? <><br />Style: {det.style}</> : null}{det.budgetKobo !== null ? <><br />Budget: {formatNaira(det.budgetKobo)}</> : null}</p>
              {det.menu && <p><b>Preferred menu</b><br />{det.menu}</p>}{det.dietary && <p><b>Dietary</b><br />{det.dietary}</p>}{det.additional && <p><b>Additional</b><br />{det.additional}</p>}
              <b>Customer</b><p>{det.name}<br /><a href={`tel:${det.phone}`}>{det.phone}</a>{det.email ? <><br /><a href={`mailto:${det.email}`}>{det.email}</a></> : null}</p>
              <p className="small">Received {when(det.createdAt)}. WhatsApp: {det.whatsapp.openedAt ? `link opened ${det.whatsapp.openedCount}× (last ${when(det.whatsapp.openedAt)}), delivery not confirmed` : "customer has not opened the link"}.</p>
              {!det.whatsapp.staffConfirmedAt ? <button className="pill ghost sm" onClick={() => act("whatsapp-received", {}, "Marked as received on WhatsApp.")}>Message arrived on WhatsApp</button> : <p className="small">Marked received on WhatsApp {when(det.whatsapp.staffConfirmedAt)}.</p>}</div>
            <div><b>Status</b><div className="field"><label htmlFor="st" className="sr">Status</label><select id="st" value={det.status} onChange={(e) => act("status", { status: e.target.value }, `Status set to ${label(e.target.value)}.`)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
              <b>Quotation progress</b><ul className="small">{det.quotes.map((x: any) => <li key={x.id}>{when(x.at)}: {x.status}{x.amountKobo !== null ? ` ${formatNaira(x.amountKobo)}` : ""}{x.note ? ` – ${x.note}` : ""}</li>)}{det.quotes.length === 0 && <li>None recorded</li>}</ul>
              <div className="grid-f2"><div className="field"><label htmlFor="qs">Quotation</label><select id="qs" value={qt.status} onChange={(e) => setQt({ ...qt, status: e.target.value })}>{["draft", "sent", "accepted", "declined"].map((s) => <option key={s}>{s}</option>)}</select></div><div className="field"><label htmlFor="qa">Amount (₦)</label><input id="qa" inputMode="numeric" value={qt.amount} onChange={(e) => setQt({ ...qt, amount: e.target.value })} /></div></div>
              <div className="field"><label htmlFor="qn">Quotation note</label><input id="qn" value={qt.note} onChange={(e) => setQt({ ...qt, note: e.target.value })} /></div>
              <button className="pill sm" onClick={async () => { const k = qt.amount ? decimalToKobo(qt.amount.replace(/,/g, "")) : null; if (qt.amount && k === null) return setMsg("Enter the amount in naira."); if (await act("quote", { status: qt.status, amountKobo: k === null ? null : k, note: qt.note }, "Quotation progress recorded.")) setQt({ status: "draft", amount: "", note: "" }); }}>Record quotation</button></div>
            <div><b>Customer contact history</b><ul className="small">{det.contacts.map((c: any) => <li key={c.id}>{when(c.at)}: {c.direction} {c.method} – {c.summary}</li>)}{det.contacts.length === 0 && <li>None recorded</li>}</ul>
              <div className="grid-f2"><div className="field"><label htmlFor="cm">Method</label><select id="cm" value={ct.method} onChange={(e) => setCt({ ...ct, method: e.target.value })}>{["call", "whatsapp", "email", "visit", "other"].map((s) => <option key={s}>{s}</option>)}</select></div><div className="field"><label htmlFor="cd">Direction</label><select id="cd" value={ct.direction} onChange={(e) => setCt({ ...ct, direction: e.target.value })}><option>outbound</option><option>inbound</option></select></div></div>
              <div className="field"><label htmlFor="cs2">What was discussed</label><input id="cs2" value={ct.summary} onChange={(e) => setCt({ ...ct, summary: e.target.value })} /></div>
              <button className="pill sm" onClick={async () => { if (await act("contact", ct, "Contact recorded.")) setCt({ ...ct, summary: "" }); }}>Record contact</button>
              <b>Internal notes</b><ul className="small notes">{det.notes.map((n: any) => <li key={n.id}>{when(n.at)}: {n.text}</li>)}{det.notes.length === 0 && <li>None</li>}</ul>
              <div className="field"><label htmlFor="nt">Add an internal note (never shown to the customer)</label><textarea id="nt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div><button className="pill sm" onClick={async () => { if (await act("note", { text: note }, "Note added.")) setNote(""); }}>Add note</button>
              <b>History</b><ul className="small notes">{det.history.map((h: any, i: number) => <li key={i}>{when(h.at)}: {label(h.status)}{h.note ? ` (${h.note})` : ""}</li>)}</ul></div>
          </div>)}
        </li>))}</ul>)}
    </section>
  );
}

function Content() {
  const [cats, setCats] = useState(""); const [svc, setSvc] = useState(""); const [styles, setStyles] = useState(""); const [msg, setMsg] = useState(""); const [items, setItems] = useState<any[]>([]); const [g, setG] = useState<any>({});
  const fmt = (l: any[]) => l.map((x) => `${x.name} | ${x.description ?? ""} | ${x.published ? "yes" : "no"}`).join("\n");
  const loadG = useCallback(async () => { const r = await api("/api/admin/catering/gallery"); if (r.ok) setItems(r.json.items); }, []);
  useEffect(() => { api("/api/admin/catering/content").then((r) => { if (r.ok) { setCats(fmt(r.json.categories)); setSvc(fmt(r.json.services)); setStyles(r.json.styles.join("\n")); } }); loadG(); }, [loadG]);
  const parse = (t: string) => parseLines(t).map((l) => { const [name, description, pub] = l.split("|").map((s) => s.trim()); return { name, description: description ?? "", published: (pub ?? "yes").toLowerCase() !== "no" }; });
  const save = async (e: React.FormEvent) => { e.preventDefault(); const r = await api("/api/admin/catering/content", "PUT", { categories: parse(cats), services: parse(svc), styles: parseLines(styles) }); setMsg(r.ok ? "Saved." : r.json.error ?? "Could not save."); };
  const addG = async (e: React.FormEvent) => { e.preventDefault(); const body = { ...g, sort: g.sort === undefined || g.sort === "" || g.sort === null ? undefined : Number(g.sort), published: !!g.published }; const r = g.id ? await api(`/api/admin/catering/gallery/${g.id}`, "PUT", body) : await api("/api/admin/catering/gallery", "POST", body); setMsg(r.ok ? (g.id ? "Changes saved. The website shows them now." : "Photo added. The website shows it now if Publish is ticked.") : r.json.error); if (r.ok) setG({}); loadG(); };
  const I = (k: string, l: string) => <div className="field"><label htmlFor={`g-${k}`}>{l}</label><input id={`g-${k}`} value={g[k] ?? ""} onChange={(e) => setG({ ...g, [k]: e.target.value })} />{k === "imageUrl" && <ImagePreview url={g[k]} />}</div>;
  return (
    <section aria-labelledby="cch"><h2 id="cch" className="serif">Categories, services and gallery</h2>{msg && <p className="alert" role="status">{msg}</p>}
      <form className="adminform" onSubmit={save}>
        <div className="field"><label htmlFor="cats">Event categories you serve (one per line: Name | description | yes/no to show). Only these appear on the site.</label><textarea id="cats" rows={4} value={cats} onChange={(e) => setCats(e.target.value)} /></div>
        <div className="field"><label htmlFor="svc">Catering services (Name | description | yes/no)</label><textarea id="svc" rows={4} value={svc} onChange={(e) => setSvc(e.target.value)} /></div>
        <div className="field"><label htmlFor="sty">Catering styles (one per line, optional)</label><textarea id="sty" rows={2} value={styles} onChange={(e) => setStyles(e.target.value)} /></div>
        <button className="pill sm">Save</button></form>
      <form className="adminform" onSubmit={addG}><h3 className="serif" id="gal">{g.id ? "Edit gallery photo" : "Add a gallery photo"}</h3>{g.id ? <p className="alert" role="status">Editing “{g.title}”. Change anything and press Save changes.</p> : <p className="hint">The homepage and catering page show the first published Food and Event photos. A newly added photo goes to the front.</p>}<div className="grid-f"><div className="field"><label htmlFor="g-kind">Type</label><select id="g-kind" value={g.kind ?? ""} onChange={(e) => setG({ ...g, kind: e.target.value })}><option value="">Choose…</option><option value="food">Food</option><option value="event">Event</option></select></div>{I("title", "Title")}{I("imageUrl", "Photo path or URL")}<div className="field"><UploadButton onUploaded={(u) => setG({ ...g, imageUrl: u })} /></div>{I("imageAlt", "Alt text")}{I("caption", "Caption")}{I("sort", "Display order (lower numbers show first)")}</div>
        <label className="check"><input type="checkbox" checked={!!g.published} onChange={(e) => setG({ ...g, published: e.target.checked })} /> Publish on the website</label><div className="acts"><button className="pill sm">{g.id ? "Save changes" : "Add photo"}</button>{g.id && <button type="button" className="linkbtn" onClick={() => setG({})}>Cancel editing</button>}</div></form>
      {items.length === 0 ? <div className="empty"><p className="serif empty-title">No gallery photos yet.</p></div> : <table className="atable"><thead><tr><th>Photo</th><th>Published</th><th><span className="sr">Actions</span></th></tr></thead><tbody>{items.map((i) => <tr key={i.id}><td><img className="thumb" src={i.imageUrl} alt="" width="48" height="48" loading="lazy" /><b>{i.title}</b> · {i.kind}<span className="hint"> · order {i.sort ?? 0}</span></td><td><label className="check"><input type="checkbox" checked={i.published} aria-label={`${i.title} published`} onChange={async () => { await api(`/api/admin/catering/gallery/${i.id}`, "PUT", { ...i, published: !i.published }); loadG(); }} /></label></td><td><div className="acts"><button className="linkbtn" onClick={() => { setG({ ...i, sort: i.sort ?? 0 }); setMsg(""); document.getElementById("gal")?.scrollIntoView({ block: "start" }); }}>Edit</button><button className="linkbtn" onClick={async () => { if (confirm("Delete?")) { await api(`/api/admin/catering/gallery/${i.id}`, "DELETE"); loadG(); } }}>Delete</button></div></td></tr>)}</tbody></table>}
    </section>
  );
}
