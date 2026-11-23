"use client";
import { useCallback, useEffect, useState } from "react";
import { formatNaira } from "@/lib/money";
import type { Category, MenuItem, Order } from "@/server/types";
import { AdminVoc } from "./AdminVoc";
import { AdminVip } from "./AdminVip";
import { AdminCatering } from "./AdminCatering";
import { AdminSite, AdminInbox } from "./AdminSite";
import { AdminTeam, AdminAccount } from "./AdminTeam";
import { AdminFoodSettings } from "./AdminFoodSettings";
import { AdminMenu } from "./AdminMenu";
import { can, type Role } from "@/lib/permissions";
import "./admin-categories.css";

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
      {tab === "orders" && <Orders />}{tab === "menu" && <AdminMenu />}{tab === "categories" && <Categories />}{tab === "delivery" && <AdminFoodSettings />}{tab === "vip" && <AdminVip />}{tab === "vocational" && <AdminVoc />}{tab === "catering" && <AdminCatering />}
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

function Categories() {
  const [cats, setCats] = useState<Category[]>([]); const [items, setItems] = useState<MenuItem[]>([]); const [name, setName] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api("/api/admin/menu");
    if (r.ok) { setCats([...(r.json.categories as Category[])].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))); setItems(r.json.items); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const dishes = (id: string) => items.filter((i) => i.categoryId === id && i.active).length;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/admin/categories", "POST", { name, sort: Math.max(0, ...cats.map((c) => c.sort)) + 1 });
    setMsg(r.ok ? `${name} added at the end of the menu. Use Up or Top to move it.` : r.json.error); if (r.ok) setName(""); load();
  };
  const setActive = async (c: Category, active: boolean) => {
    setCats((prev) => prev.map((x) => (x.id === c.id ? { ...x, active } : x)));
    await api(`/api/admin/categories/${c.id}`, "PUT", { name: c.name, sort: c.sort, active }); load();
  };
  /** Moves one category to a new position, renumbers the list 1..n and saves only the categories whose number changed. */
  const move = async (from: number, to: number) => {
    if (busy || from === to || to < 0 || to >= cats.length) return;
    const next = [...cats]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    const numbered = next.map((c, i) => ({ ...c, sort: i + 1 }));
    const changed = numbered.filter((c) => cats.find((o) => o.id === c.id)?.sort !== c.sort);
    setCats(numbered); setBusy(true); setMsg("");
    const results = await Promise.all(changed.map((c) => api(`/api/admin/categories/${c.id}`, "PUT", { name: c.name, sort: c.sort, active: c.active })));
    const bad = results.find((r) => !r.ok);
    setMsg(bad ? (bad.json.error ?? "The new order could not be saved. Please try again.") : `${moved.name} is now number ${to + 1} on the menu.`);
    setBusy(false); load();
  };
  return (
    <section aria-labelledby="ch"><h2 id="ch" className="serif">Categories</h2>
      <p className="hint">The order here is the order customers see on the menu page. The first four enabled categories that have dishes also appear as buttons on the home page.</p>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form className="inl-form" onSubmit={add}><div className="field"><label htmlFor="cn">New category name</label><input id="cn" value={name} onChange={(e) => setName(e.target.value)} required /></div><button className="pill sm">Add category</button></form>
      {cats.length === 0 ? <div className="empty"><p className="serif empty-title">No categories yet.</p></div> : (
        <ol className="catlist" aria-label="Menu categories in display order">{cats.map((c, i) => {
          const n = dishes(c.id); const hiddenWithDishes = !c.active && n > 0;
          return (
            <li key={c.id} className={hiddenWithDishes ? "cl-warn" : ""}>
              <span className="cl-pos" aria-hidden="true">{i + 1}</span>
              <span className="cl-name"><b>{c.name}</b>
                <span className="small dim0">{n} dish{n === 1 ? "" : "es"}{!c.active ? ", hidden from customers" : ""}</span>
                {hiddenWithDishes && <span className="err">Switched off, but it still has dishes. Customers cannot see them.</span>}</span>
              <span className="cl-move" role="group" aria-label={`Move ${c.name}`}>
                <button type="button" onClick={() => move(i, 0)} disabled={busy || i === 0} aria-label={`Move ${c.name} to the top`}>Top</button>
                <button type="button" onClick={() => move(i, i - 1)} disabled={busy || i === 0} aria-label={`Move ${c.name} up one place`}><span aria-hidden="true">&uarr;</span> Up</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={busy || i === cats.length - 1} aria-label={`Move ${c.name} down one place`}><span aria-hidden="true">&darr;</span> Down</button>
              </span>
              <label className="check"><input type="checkbox" checked={c.active} onChange={(e) => setActive(c, e.target.checked)} /> Enabled</label>
              <button className="linkbtn" onClick={async () => { const nm = prompt("Rename category", c.name); if (nm) { const r = await api(`/api/admin/categories/${c.id}`, "PUT", { name: nm, sort: c.sort, active: c.active }); setMsg(r.ok ? "Renamed." : r.json.error); load(); } }}>Rename</button>
              <button className="linkbtn" onClick={async () => { if (confirm(`Delete ${c.name}?`)) { const r = await api(`/api/admin/categories/${c.id}`, "DELETE"); setMsg(r.ok ? "Deleted." : r.json.error); load(); } }}>Delete</button>
            </li>);
        })}</ol>)}
    </section>
  );
}