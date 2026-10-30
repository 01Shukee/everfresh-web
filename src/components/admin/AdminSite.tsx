"use client";
import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { parseLines } from "@/lib/voc-text";
import { UploadButton, api, when } from "./shared";

type Sub = "business" | "about" | "homepage" | "faqs" | "brand";
const L = { business: "Business and contact", about: "About page", homepage: "Homepage", faqs: "FAQs", brand: "Logo and brand" } as const;

export function AdminSite({ role }: { role: Role }) {
  const subs = (Object.keys(L) as Sub[]).filter((s) => (s === "business" ? can(role, "settings", false) : can(role, "content", false)));
  const [sub, setSub] = useState<Sub>(subs[0]);
  return (<div><nav className="admin-tabs sub" aria-label="Website sections">{subs.map((s) => <button key={s} className={sub === s ? "on" : ""} aria-pressed={sub === s} onClick={() => setSub(s)}>{L[s]}</button>)}</nav>
    {sub === "business" ? <Business /> : <Content sub={sub} />}</div>);
}

const T = (f: any, setF: (x: any) => void, k: string, label: string, rows = 3, hint?: string) => <div className="field"><label htmlFor={`s-${k}`}>{label}</label><textarea id={`s-${k}`} rows={rows} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <p className="hint">{hint}</p>}</div>;
const I = (f: any, setF: (x: any) => void, k: string, label: string, hint?: string, up = false) => <div className="field"><label htmlFor={`s-${k}`}>{label}</label><input id={`s-${k}`} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <p className="hint">{hint}</p>}{up && <UploadButton onUploaded={(u) => setF({ ...f, [k]: u })} />}</div>;

function Business() {
  const [b, setB] = useState<any>(null); const [c, setC] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/admin/site/settings").then((r) => { if (r.ok) { setB({ ...r.json.business }); setC({ ...r.json.contact, hours: r.json.contact.hours.join("\n"), social: r.json.contact.social.map((x: any) => `${x.label} | ${x.url}`).join("\n") }); } }); }, []);
  if (!b || !c) return <p role="status">Loading…</p>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const social = parseLines(c.social).map((l) => { const [label, url] = l.split("|").map((x) => x.trim()); return { label, url }; });
    const r1 = await api("/api/admin/site/settings/business", "PUT", b); if (!r1.ok) return setMsg(r1.json.error);
    const r2 = await api("/api/admin/site/settings/contact", "PUT", { ...c, hours: parseLines(c.hours), social }); setMsg(r2.ok ? "Saved. The website now shows these details." : r2.json.error);
  };
  return (
    <form className="adminform" onSubmit={save} aria-label="Business and contact details"><h2 className="serif">Business and contact</h2>{msg && <p className="alert" role="status">{msg}</p>}
      <div className="grid-f">{I(b, setB, "name", "Business name")}{I(b, setB, "legalName", "Legal name")}{I(b, setB, "tagline", "Tagline")}{I(b, setB, "notifyEmail", "Staff notification email", "New paid orders, applications, enquiries and messages are announced here. Leave blank for none.")}</div>{T(b, setB, "description", "Short description", 2)}
      <div className="grid-f">{I(c, setC, "phone", "Phone number")}{I(c, setC, "email", "Email address")}{I(c, setC, "whatsapp", "WhatsApp number", "With country code. Used for the contact page and catering quotation requests.")}</div>
      <div className="grid-f">{I(c, setC, "address", "Physical address")}{I(c, setC, "city", "City")}<label className="check"><input type="checkbox" checked={!!c.mapConfirmed} onChange={(e) => setC({ ...c, mapConfirmed: e.target.checked })} /> Show a map link (only when the address is confirmed)</label></div>
      {T(c, setC, "hours", "Business hours (one line each, for example Mon to Fri: 9am to 6pm)", 3)}{T(c, setC, "social", "Social links (Label | https://address, one per line)", 2)}
      <button className="pill sm">Save</button></form>
  );
}

function Content({ sub }: { sub: Exclude<Sub, "business"> }) {
  const [d, setD] = useState<any>(null); const [f, setF] = useState<any>({}); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/admin/site/content").then((r) => { if (!r.ok) return; setD(r.json); const x = r.json;
    if (sub === "about") setF({ ...x.about, values: x.about.values.join("\n"), credentials: x.about.credentials.join("\n"), photos: x.about.photos.map((p: any) => `${p.url} | ${p.alt} | ${p.caption}`).join("\n") });
    if (sub === "homepage") setF({ benefits: x.homepage.benefits.join("\n"), hero: x.homepage.heroImages, featured: x.homepage.featured.map((p: any) => `${p.kind} | ${p.title} | ${p.caption} | ${p.url} | ${p.alt}`).join("\n") });
    if (sub === "faqs") setF({ faqs: x.faqs.map((q: any) => `${q.q} | ${q.a} | ${q.published ? "yes" : "no"}`).join("\n") });
    if (sub === "brand") setF({ ...x.brand }); }); }, [sub]);
  if (!d) return <p role="status">Loading…</p>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); let body: any = f;
    if (sub === "about") body = { ...f, values: parseLines(f.values), credentials: parseLines(f.credentials), photos: parseLines(f.photos).map((l: string) => { const [url, alt, ...c] = l.split("|").map((x) => x.trim()); return { url, alt, caption: c.join(" | ") }; }) };
    if (sub === "homepage") body = { benefits: parseLines(f.benefits), heroImages: f.hero, featured: parseLines(f.featured).map((l: string) => { const [kind, title, caption, url, alt] = l.split("|").map((x) => x.trim()); return { kind, title, caption, url, alt }; }) };
    if (sub === "faqs") body = { faqs: parseLines(f.faqs).map((l: string, i: number) => { const [q, a, pub] = l.split("|").map((x) => x.trim()); return { q, a, published: (pub ?? "yes").toLowerCase() !== "no", sort: i }; }) };
    const r = await api(`/api/admin/site/${sub}`, "PUT", body); setMsg(r.ok ? "Saved. The website now shows this content." : r.json.error);
  };
  const hero = (k: "food" | "studies" | "catering", name: string) => { const h = f.hero?.[k] ?? { url: "", alt: "" }; const set = (x: any) => setF({ ...f, hero: { ...f.hero, [k]: x } }); return (<div className="field heroimg" key={k}><b>{name}</b><input aria-label={`${name} hero photo path`} placeholder="/uploads/… or https://…" value={h.url} onChange={(e) => set({ ...h, url: e.target.value })} /><input aria-label={`${name} hero photo alt text`} placeholder="Alt text" value={h.alt} onChange={(e) => set({ ...h, alt: e.target.value })} /><UploadButton onUploaded={(u) => set({ ...h, url: u })} /></div>); };
  return (
    <form className="adminform" onSubmit={save}><h2 className="serif">{L[sub]}</h2>{msg && <p className="alert" role="status">{msg}</p>}
      {sub === "about" && <>{T(f, setF, "intro", "Business introduction", 3)}{T(f, setF, "mission", "Mission", 2)}{T(f, setF, "values", "Values (one per line)", 3)}{T(f, setF, "history", "Confirmed business history", 4)}{T(f, setF, "foodInfo", "Food ordering information", 2)}{T(f, setF, "vocationalInfo", "Vocational training information", 2)}{T(f, setF, "cateringInfo", "Catering information", 2)}{T(f, setF, "credentials", "Credentials (only those you can prove; one per line)", 2)}
        {T(f, setF, "photos", "Photos (one per line: path or URL | alt text | caption)", 3)}<UploadButton label="Upload a photo and add it" onUploaded={(u) => setF({ ...f, photos: `${f.photos ? f.photos + "\n" : ""}${u} | Describe this photo | ` })} /></>}
      {sub === "homepage" && <>{T(f, setF, "benefits", "Confirmed business benefits (one per line; only claims you can stand behind)", 4)}<fieldset><legend className="lab">Hero photos for the three doors</legend>{hero("food", "Order food")}{hero("studies", "Vocational studies")}{hero("catering", "Event catering")}</fieldset>
        {T(f, setF, "featured", "Featured work (kind | title | caption | image path | alt). Kinds: food, project, event, student", 5)}<UploadButton label="Upload a photo and add it" onUploaded={(u) => setF({ ...f, featured: `${f.featured ? f.featured + "\n" : ""}food | Title | Caption | ${u} | Describe this photo` })} /><p className="hint">Testimonials and videos come from the Vocational studies tab (published items only).</p></>}
      {sub === "faqs" && T(f, setF, "faqs", "FAQs (Question | Answer | yes/no to show). Shown on the Contact page.", 8)}
      {sub === "brand" && <>{I(f, setF, "logoUrl", "Logo image", "Upload a PNG or WebP of the horizontal logo, or paste a path.", true)}{I(f, setF, "logoAlt", "Logo alt text")}{I(f, setF, "emblemUrl", "Emblem (shown in the header and footer)", "A square image works best.", true)}{I(f, setF, "faviconUrl", "Favicon", undefined, true)}<p className="hint">Brand rules: do not stretch, recolour or add effects to the logo. A vector (SVG) logo should be supplied to the developer; SVG uploads are refused for safety.</p></>}
      <button className="pill sm">Save</button></form>
  );
}

export function AdminInbox() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [list, setList] = useState<any[] | null>(null); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await api(`/api/admin/inbox/messages?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}`); if (r.ok) setList(r.json.messages); }, [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const mark = async (id: string, s: string) => { await api(`/api/admin/inbox/messages/${id}`, "PATCH", { status: s }); load(); };
  return (
    <section aria-labelledby="ib"><div className="bar"><h2 id="ib" className="serif">Messages from the contact form</h2></div>
      <div className="searchbar"><label className="field"><span className="sr">Search messages</span><input type="search" placeholder="Search name, phone, email, message…" value={q} onChange={(e) => setQ(e.target.value)} /></label><label className="inl"><span className="sr">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="new">New</option><option value="read">Read</option><option value="handled">Handled</option></select></label></div>
      {!list ? <p role="status">Loading…</p> : list.length === 0 ? <div className="empty"><p className="serif empty-title">No messages.</p></div> : <ul className="orders">{list.map((m) => (<li key={m.id}>
        <button className="orow" aria-expanded={open === m.id} onClick={() => { setOpen(open === m.id ? null : m.id); if (m.status === "new") mark(m.id, "read"); }}><b>{m.id}</b><span>{m.name}</span><span>{m.topic ?? ""}</span><span className="tag">{m.status}</span><span className="small">{when(m.createdAt)}</span></button>
        {open === m.id && <div className="odetail"><div><b>From</b><p>{m.name}<br />{m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}{m.phone && m.email ? <br /> : null}{m.email && <a href={`mailto:${m.email}`}>{m.email}</a>}</p></div><div style={{ gridColumn: "span 2" }}><b>Message</b><p className="prewrap">{m.message}</p><div className="acts"><button className="pill sm" onClick={() => mark(m.id, "handled")}>Mark handled</button><button className="pill ghost sm" onClick={async () => { if (confirm("Delete this message?")) { await api(`/api/admin/inbox/messages/${m.id}`, "DELETE"); load(); } }}>Delete</button></div></div></div>}</li>))}</ul>}
    </section>
  );
}
