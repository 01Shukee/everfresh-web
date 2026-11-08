"use client";
import { useCallback, useEffect, useState } from "react";
import { formatNaira, decimalToKobo } from "@/lib/money";
import { parseAddOns, parseVariants, serializeAddOns, serializeVariants } from "@/lib/menu-text";
import type { Category, MenuItem, Order } from "@/server/types";
import { AdminVoc } from "./AdminVoc";
import { AdminVip } from "./AdminVip";
import { AdminCatering } from "./AdminCatering";
import { AdminSite, AdminInbox } from "./AdminSite";
import { AdminTeam, AdminAccount } from "./AdminTeam";
import { AdminFoodSettings } from "./AdminFoodSettings";
import { UploadButton } from "./shared";
import { can, type Role } from "@/lib/permissions";

type Tab = "orders" | "menu" | "categories" | "delivery" | "vip" | "vocational" | "catering" | "website" | "messages" | "team" | "account";
const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { location.reload(); throw new Error("Signed out"); }
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
};
const STATUS = ["pending_payment", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"];
const label = (s: string) => s.replace(/_/g, " ");

export interface Me { name: string; email: string; role: Role; mustChangePassword: boolean; needs2fa?: boolean; twoFactor?: boolean }
const TABS: { id: Tab; label: string; show: (r: Role) => boolean }[] = [
  { id: "orders", label: "Orders", show: (r) => can(r, "food", false) }, { id: "menu", label: "Menu items", show: (r) => can(r, "food", false) }, { id: "categories", label: "Categories", show: (r) => can(r, "food", false) }, { id: "delivery", label: "Delivery and pickup", show: (r) => can(r, "food", false) }, { id: "vip", label: "VIP menu", show: (r) => can(r, "food", false) },
  { id: "vocational", label: "Vocational studies", show: (r) => can(r, "vocational", false) }, { id: "catering", label: "Event catering", show: (r) => can(r, "catering", false) },
  { id: "website", label: "Website", show: (r) => can(r, "content", false) || can(r, "settings", false) }, { id: "messages", label: "Messages", show: (r) => can(r, "inbox", false) },
  { id: "team", label: "Team and security", show: (r) => can(r, "users", false) }, { id: "account", label: "My account", show: () => true },
];
/** The tabs are a convenience only. Every request is authorised again on the server by role and URL path. */
export function AdminApp({ me }: { me: Me }) {
  const tabs = TABS.filter((t) => t.show(me.role)); const locked = me.mustChangePassword || !!me.needs2fa; const [tab, setTab] = useState<Tab>(locked ? "account" : tabs[0].id);
  return (
    <div className="admin">
      <div className="admin-head"><h1 className="serif">Admin</h1>
        <nav className="admin-tabs" aria-label="Admin sections">{tabs.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} aria-pressed={tab === t.id} disabled={locked && t.id !== "account"} onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" }); }}>{t.label}</button>)}</nav>
        <span className="small who">{me.name} · {me.role.replace(/_/g, " ")}</span><button className="linkbtn" onClick={async () => { await api("/api/admin/logout", "POST"); location.reload(); }}>Sign out</button></div>
      {tab === "orders" && <Orders />}{tab === "menu" && <MenuAdmin />}{tab === "categories" && <Categories />}{tab === "delivery" && <AdminFoodSettings />}{tab === "vip" && <AdminVip />}{tab === "vocational" && <AdminVoc />}{tab === "catering" && <AdminCatering />}
      {tab === "website" && <AdminSite role={me.role} />}{tab === "messages" && <AdminInbox />}{tab === "team" && <AdminTeam />}{tab === "account" && <AdminAccount forced={me.mustChangePassword} needs2fa={!!me.needs2fa} enabled={!!me.twoFactor} />}
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null); const [status, setStatus] = useState(""); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api(`/api/admin/orders${status ? `?status=${status}` : ""}`); if (r.ok) setOrders(r.json.orders); }, [status]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const move = async (o: Order, to: string) => {
    if (to === "cancelled" && !confirm(`Cancel order ${o.orderNumber}?${o.paymentStatus === "paid" ? " It is paid: you must refund it in the Bachs dashboard." : ""}`)) return;
    const r = await api(`/api/admin/orders/${o.orderNumber}`, "PATCH", { status: to }); setMsg(r.ok ? r.json.warning ?? `Order ${o.orderNumber} is now ${label(to)}.` : r.json.error); load();
  };
  const next = (o: Order) => ({ pending_payment: ["cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: [o.fulfilment.type === "delivery" ? "out_for_delivery" : "completed", "cancelled"], out_for_delivery: ["completed"], completed: [], cancelled: [] } as Record<string, string[]>)[o.status];
  return (
    <section aria-labelledby="oh"><div className="bar"><h2 id="oh" className="serif">Orders</h2>
      <label className="inl"><span className="sr">Filter by status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label><button className="pill ghost sm" onClick={load}>Refresh</button></div>
      {msg && <p className="alert" role="status">{msg}</p>}
      {!orders ? <p role="status">Loading…</p> : orders.length === 0 ? <div className="empty"><p className="serif empty-title">No orders yet.</p></div> : (
        <ul className="orders">{orders.map((o) => (
          <li key={o.id} className={o.paymentStatus === "needs_review" ? "flag" : ""}>
            <button className="orow" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
              <b>{o.orderNumber}</b><span>{o.customer.name}</span><span className="tab">{formatNaira(o.totalKobo)}</span><span className={`tag st-${o.status}`}>{label(o.status)}</span><span className={`tag pay-${o.paymentStatus}`}>{label(o.paymentStatus)}</span><span className="small">{new Date(o.createdAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Lagos" })}</span></button>
            {open === o.id && <div className="odetail">
              <div><b>Customer</b><p>{o.customer.name}<br />{o.customer.phone}<br />{o.customer.email}</p>
                <b>{o.fulfilment.type === "delivery" ? `Delivery: ${o.fulfilment.zoneName}` : `Pickup: ${o.fulfilment.pickupName}`}</b><p>{o.fulfilment.address}{o.fulfilment.instructions ? ` (${o.fulfilment.instructions})` : ""}<br />{o.fulfilment.scheduledFor ? `Scheduled: ${new Date(o.fulfilment.scheduledFor).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}` : "As soon as possible"}</p></div>
              <div><b>Items</b><ul>{o.lines.map((l, i) => <li key={i}>{l.qty} × {l.name} {[l.variantName, ...l.addOns.map((a) => a.name)].filter(Boolean).join(", ")} {l.note && `("${l.note}")`}<span className="tab"> {formatNaira(l.lineKobo)}</span></li>)}</ul>
                <p>Subtotal {formatNaira(o.subtotalKobo)} · Delivery {formatNaira(o.deliveryFeeKobo)} · Discount {formatNaira(o.discountKobo)} · <b>Total {formatNaira(o.totalKobo)}</b></p></div>
              <div><b>Payment: {label(o.paymentStatus)}</b><ul className="small">{o.attempts.map((a) => <li key={a.reference}>{a.reference}: {a.status}{a.chargeId ? ` (${a.chargeId})` : ""}{a.error ? ` – ${a.error}` : ""}</li>)}</ul>
                {o.notes.length > 0 && <ul className="small notes">{o.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                {(o.paymentStatus === "needs_review" || o.paymentStatus === "paid") && <p className="small">Refunds are issued in the Bachs dashboard; the status here updates when Bachs reports the refund.</p>}
                <div className="acts">{next(o).map((s) => <button key={s} className={`pill sm ${s === "cancelled" ? "ghost" : ""}`} onClick={() => move(o, s)}>{s === "cancelled" ? "Cancel order" : `Mark ${label(s)}`}</button>)}</div></div>
            </div>}
          </li>))}</ul>)}
    </section>
  );
}

const blank = { name: "", categoryId: "", description: "", price: "", sizes: "", addons: "", tags: "", imageUrl: "", imageAlt: "", active: true, available: true };
function MenuAdmin() {
  const [items, setItems] = useState<MenuItem[]>([]); const [cats, setCats] = useState<Category[]>([]); const [f, setF] = useState(blank); const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [form, setForm] = useState(false);
  const load = useCallback(async () => { const r = await api("/api/admin/menu"); if (r.ok) { setItems(r.json.items); setCats(r.json.categories); } }, []);
  useEffect(() => { load(); }, [load]);
  const edit = (i: MenuItem) => { setEditing(i.id); setForm(true); setErr(""); setF({ name: i.name, categoryId: i.categoryId, description: i.description, price: i.variants.length ? "" : String(i.basePriceKobo / 100), sizes: serializeVariants(i.variants), addons: serializeAddOns(i.addOnGroups), tags: i.tags.join(", "), imageUrl: i.imageUrl ?? "", imageAlt: i.imageAlt, active: i.active, available: i.available }); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); const v = parseVariants(f.sizes); if (!v.ok) return setErr(v.error); const a = parseAddOns(f.addons); if (!a.ok) return setErr(a.error);
    const kobo = f.price ? decimalToKobo(f.price.trim()) : 0; if (kobo === null) return setErr("Enter the price in naira, for example 2500 or 2500.50.");
    const body = { name: f.name, categoryId: f.categoryId, description: f.description, basePriceKobo: kobo, variants: v.value, addOnGroups: a.value, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), imageUrl: f.imageUrl || null, imageAlt: f.imageAlt, active: f.active, available: f.available };
    const r = await api(editing ? `/api/admin/menu/${editing}` : "/api/admin/menu", editing ? "PUT" : "POST", body);
    if (!r.ok) return setErr(r.json.error ?? "Could not save."); setMsg(`${f.name} saved.`); setForm(false); setEditing(null); setF(blank); load();
  };
  const patch = async (i: MenuItem, changes: Partial<MenuItem>) => { setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, ...changes } : x))); const r = await api(`/api/admin/menu/${i.id}`, "PUT", { ...i, ...changes }); setMsg(r.ok ? `${i.name} updated.` : r.json.error); load(); };
  return (
    <section aria-labelledby="mh"><div className="bar"><h2 id="mh" className="serif">Menu items</h2><button className="pill sm" onClick={() => { setForm(true); setEditing(null); setF({ ...blank, categoryId: cats[0]?.id ?? "" }); setErr(""); }} disabled={cats.length === 0}>Add item</button></div>
      {cats.length === 0 && <p className="hint">Create a category first.</p>}{msg && <p className="alert" role="status">{msg}</p>}
      {form && <form className="adminform" onSubmit={save}><h3 className="serif">{editing ? "Edit item" : "New item"}</h3>{err && <p className="alert" role="alert">{err}</p>}
        <div className="grid-f"><div className="field"><label htmlFor="n">Name</label><input id="n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="c">Category</label><select id="c" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} required>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="p">Price (₦){f.sizes.trim() ? " (ignored when sizes are set)" : ""}</label><input id="p" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div></div>
        <div className="field"><label htmlFor="d">Description</label><textarea id="d" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid-f2"><div className="field"><label htmlFor="s">Portion sizes (one per line: Name | price)</label><textarea id="s" rows={4} placeholder="Small | 2000" value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} /></div>
          <div className="field"><label htmlFor="a"># Add-on group | min | max, then - Option | price</label><textarea id="a" rows={4} placeholder={"# Extras | 0 | 2\n- Option | 300"} value={f.addons} onChange={(e) => setF({ ...f, addons: e.target.value })} /></div></div>
        <div className="grid-f"><div className="field"><label htmlFor="t">Tags (comma separated)</label><input id="t" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></div>
          <div className="field"><label htmlFor="u">Photo path or URL</label><input id="u" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} /><UploadButton onUploaded={(u) => setF({ ...f, imageUrl: u })} /></div>
          <div className="field"><label htmlFor="al">Photo alt text</label><input id="al" value={f.imageAlt} onChange={(e) => setF({ ...f, imageAlt: e.target.value })} /></div></div>
        <div className="checks"><label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Enabled (visible to customers)</label><label className="check"><input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Available (untick for sold out)</label></div>
        <div className="acts"><button className="pill sm">Save item</button><button type="button" className="pill ghost sm" onClick={() => { setForm(false); setEditing(null); }}>Cancel</button></div></form>}
      {items.length === 0 ? <div className="empty"><p className="serif empty-title">No menu items yet.</p></div> : (
        <table className="atable"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Enabled</th><th>Available</th><th><span className="sr">Actions</span></th></tr></thead><tbody>{items.map((i) => (
          <tr key={i.id}><td><b>{i.name}</b></td><td>{cats.find((c) => c.id === i.categoryId)?.name}</td><td className="tab">{i.variants.length ? `from ${formatNaira(Math.min(...i.variants.map((v) => v.priceKobo)))}` : formatNaira(i.basePriceKobo)}</td>
            <td><label className="check"><input type="checkbox" checked={i.active} onChange={(e) => patch(i, { active: e.target.checked })} aria-label={`${i.name} enabled`} /></label></td><td><label className="check"><input type="checkbox" checked={i.available} onChange={(e) => patch(i, { available: e.target.checked })} aria-label={`${i.name} available`} /></label></td>
            <td className="acts"><button className="linkbtn" onClick={() => edit(i)}>Edit</button><button className="linkbtn" onClick={async () => { if (confirm(`Delete ${i.name}? Past orders keep their copy of it.`)) { await api(`/api/admin/menu/${i.id}`, "DELETE"); load(); } }}>Delete</button></td></tr>))}</tbody></table>)}
    </section>
  );
}

function Categories() {
  const [cats, setCats] = useState<Category[]>([]); const [name, setName] = useState(""); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api("/api/admin/menu"); if (r.ok) setCats(r.json.categories); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => { e.preventDefault(); const r = await api("/api/admin/categories", "POST", { name, sort: cats.length }); setMsg(r.ok ? `${name} added.` : r.json.error); if (r.ok) setName(""); load(); };
  return (
    <section aria-labelledby="ch"><h2 id="ch" className="serif">Categories</h2>{msg && <p className="alert" role="status">{msg}</p>}
      <form className="inl-form" onSubmit={add}><div className="field"><label htmlFor="cn">New category name</label><input id="cn" value={name} onChange={(e) => setName(e.target.value)} required /></div><button className="pill sm">Add category</button></form>
      {cats.length === 0 ? <div className="empty"><p className="serif empty-title">No categories yet.</p></div> : <ul className="catlist">{cats.map((c) => (
        <li key={c.id}><b>{c.name}</b><label className="check"><input type="checkbox" checked={c.active} onChange={async (e) => { setCats((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: e.target.checked } : x))); await api(`/api/admin/categories/${c.id}`, "PUT", { ...c, active: e.target.checked }); load(); }} /> Enabled</label>
          <button className="linkbtn" onClick={async () => { const n = prompt("Rename category", c.name); if (n) { const r = await api(`/api/admin/categories/${c.id}`, "PUT", { ...c, name: n }); setMsg(r.ok ? "Renamed." : r.json.error); load(); } }}>Rename</button>
          <button className="linkbtn" onClick={async () => { if (confirm(`Delete ${c.name}?`)) { const r = await api(`/api/admin/categories/${c.id}`, "DELETE"); setMsg(r.ok ? "Deleted." : r.json.error); load(); } }}>Delete</button></li>))}</ul>}
    </section>
  );
}
