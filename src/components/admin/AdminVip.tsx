"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { decimalToKobo, formatNaira, koboToDecimal } from "@/lib/money";
import { qrSvg } from "@/lib/qr";
import { UploadButton, api, when } from "./shared";

type Sub = "menu" | "settings" | "qr" | "orders";
interface Cat { id: string; name: string; sort: number; active: boolean }
interface Item { id: string; categoryId: string; name: string; description: string; priceKobo: number; imageUrl: string | null; imageAlt: string; available: boolean; active: boolean; sort: number }
interface Settings { enabled: boolean; mode: "static" | "whatsapp"; whatsapp: string | null; title: string; intro: string | null; tableLabel: string }
const blank = { name: "", categoryId: "", price: "", description: "", imageUrl: "", imageAlt: "", available: true, active: true, sort: "0" };

export function AdminVip() {
  const [sub, setSub] = useState<Sub>("menu");
  return (
    <section aria-labelledby="vh"><h2 id="vh" className="serif">VIP menu</h2>
      <p className="hint">A separate menu for VIP guests, opened from a QR code at their table. It never appears in the regular menu.</p>
      <nav className="admin-tabs sub" aria-label="VIP sections">{([["menu", "Items and categories"], ["settings", "Ordering and settings"], ["qr", "QR codes"], ["orders", "VIP orders"]] as [Sub, string][]).map(([id, l]) => <button key={id} className={sub === id ? "cat on" : "cat"} onClick={() => setSub(id)}>{l}</button>)}</nav>
      {sub === "menu" && <VipMenuAdmin />}{sub === "settings" && <VipSettings />}{sub === "qr" && <VipQr />}{sub === "orders" && <VipOrders />}
    </section>
  );
}

function VipMenuAdmin() {
  const [cats, setCats] = useState<Cat[]>([]); const [items, setItems] = useState<Item[]>([]); const [f, setF] = useState(blank); const [editing, setEditing] = useState<string | null>(null); const [form, setForm] = useState(false);
  const [catName, setCatName] = useState(""); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await api("/api/admin/vip/menu"); if (r.ok) { setCats(r.json.categories); setItems(r.json.items); } }, []);
  useEffect(() => { load(); }, [load]);
  const addCat = async (e: React.FormEvent) => { e.preventDefault(); const r = await api("/api/admin/vip/categories", "POST", { name: catName, sort: cats.length }); if (!r.ok) return setErr(r.json.error ?? "Could not add the category."); setCatName(""); setErr(""); load(); };
  const renameCat = async (c: Cat) => { const name = window.prompt("Category name", c.name); if (name === null) return; const r = await api(`/api/admin/vip/categories/${c.id}`, "PUT", { ...c, name }); setMsg(r.ok ? "Category updated." : r.json.error); load(); };
  const toggleCat = async (c: Cat) => { await api(`/api/admin/vip/categories/${c.id}`, "PUT", { ...c, active: !c.active }); load(); };
  const delCat = async (c: Cat) => { if (!window.confirm(`Delete the category "${c.name}"?`)) return; const r = await api(`/api/admin/vip/categories/${c.id}`, "DELETE"); setMsg(r.ok ? "Category deleted." : r.json.error); load(); };
  const edit = (i: Item) => { setEditing(i.id); setForm(true); setErr(""); setF({ name: i.name, categoryId: i.categoryId, price: koboToDecimal(i.priceKobo).replace(/\.00$/, ""), description: i.description, imageUrl: i.imageUrl ?? "", imageAlt: i.imageAlt, available: i.available, active: i.active, sort: String(i.sort) }); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); const kobo = decimalToKobo(f.price.trim()); if (!kobo) return setErr("Enter the price in naira, for example 2500.");
    const r = await api(editing ? `/api/admin/vip/items/${editing}` : "/api/admin/vip/items", editing ? "PUT" : "POST", { name: f.name, categoryId: f.categoryId, description: f.description, priceKobo: kobo, imageUrl: f.imageUrl || null, imageAlt: f.imageAlt, available: f.available, active: f.active, sort: Number(f.sort) || 0 });
    if (!r.ok) return setErr(r.json.error ?? "Could not save."); setMsg(`${f.name} saved.`); setForm(false); setEditing(null); setF(blank); load();
  };
  const patch = async (i: Item, ch: Partial<Item>) => { const r = await api(`/api/admin/vip/items/${i.id}`, "PUT", { ...i, ...ch }); setMsg(r.ok ? `${i.name} updated.` : r.json.error); load(); };
  const del = async (i: Item) => { if (!window.confirm(`Delete "${i.name}" from the VIP menu?`)) return; await api(`/api/admin/vip/items/${i.id}`, "DELETE"); setMsg(`${i.name} deleted.`); load(); };
  const catName_ = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
  return (
    <div>
      {msg && <p className="alert" role="status">{msg}</p>}
      <h3 className="serif">Categories</h3>
      <form className="adminform inline" onSubmit={addCat}><div className="field"><label htmlFor="vcn">New category</label><input id="vcn" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="For example: Mains" required /></div><button className="pill sm">Add category</button></form>
      {err && !form && <p className="alert" role="alert">{err}</p>}
      <ul className="vip-cats">{cats.map((c) => <li key={c.id}><b>{c.name}</b>{!c.active && <span className="tag dark">Hidden</span>}<span className="acts"><button className="linkbtn" onClick={() => renameCat(c)}>Rename</button><button className="linkbtn" onClick={() => toggleCat(c)}>{c.active ? "Hide" : "Show"}</button><button className="linkbtn" onClick={() => delCat(c)}>Delete</button></span></li>)}</ul>
      <div className="bar"><h3 className="serif">Items</h3><button className="pill sm" onClick={() => { setForm(true); setEditing(null); setF({ ...blank, categoryId: cats[0]?.id ?? "" }); setErr(""); }} disabled={!cats.length}>Add item</button></div>
      {!cats.length && <p className="hint">Add a category first.</p>}
      {form && (
        <form className="adminform" onSubmit={save}><h3 className="serif">{editing ? "Edit item" : "New item"}</h3>{err && <p className="alert" role="alert">{err}</p>}
          <div className="grid-f"><div className="field"><label htmlFor="vn">Name</label><input id="vn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div className="field"><label htmlFor="vc">Category</label><select id="vc" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} required>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="vp">Price (₦)</label><input id="vp" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></div></div>
          <div className="field"><label htmlFor="vd">Description</label><textarea id="vd" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid-f2"><div className="field"><label htmlFor="vi">Photo (path or https link)</label><input id="vi" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} /><UploadButton onUploaded={(u) => setF({ ...f, imageUrl: u })} /></div>
            <div className="field"><label htmlFor="va">Photo description (for screen readers)</label><input id="va" value={f.imageAlt} onChange={(e) => setF({ ...f, imageAlt: e.target.value })} /></div></div>
          <div className="grid-f"><label className="check"><input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Available now</label><label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Shown on the VIP menu</label>
            <div className="field"><label htmlFor="vs">Order (0 first)</label><input id="vs" type="number" min={0} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></div></div>
          <div className="acts"><button className="pill sm">Save item</button><button type="button" className="linkbtn" onClick={() => { setForm(false); setEditing(null); }}>Cancel</button></div></form>)}
      <div className="tablewrap"><table className="atable"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Available</th><th>Shown</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.id}><td>{i.imageUrl && <img src={i.imageUrl} alt="" width={36} height={36} className="thumb" />} <b>{i.name}</b></td><td>{catName_(i.categoryId)}</td><td className="tab">{formatNaira(i.priceKobo)}</td>
          <td><input type="checkbox" checked={i.available} onChange={(e) => patch(i, { available: e.target.checked })} aria-label={`${i.name} available`} /></td><td><input type="checkbox" checked={i.active} onChange={(e) => patch(i, { active: e.target.checked })} aria-label={`${i.name} shown`} /></td>
          <td><button className="linkbtn" onClick={() => edit(i)}>Edit</button> <button className="linkbtn" onClick={() => del(i)}>Delete</button></td></tr>)}</tbody></table></div>
      {!items.length && cats.length > 0 && <p className="hint">No items yet. Use Add item.</p>}
    </div>
  );
}

function VipSettings() {
  const [s, setS] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/admin/vip/settings").then((r) => setS({ ...r.json, whatsapp: r.json.whatsapp ?? "", intro: r.json.intro ?? "" })); }, []);
  if (!s) return <p role="status">Loading…</p>;
  const save = async (e: React.FormEvent) => { e.preventDefault(); const r = await api("/api/admin/vip/settings", "PUT", s); setMsg(r.ok ? "Saved." : r.json.error ?? "Could not save."); if (r.ok) setS({ ...r.json, whatsapp: r.json.whatsapp ?? "", intro: r.json.intro ?? "" }); };
  return (
    <form className="adminform" onSubmit={save}>
      {msg && <p className="alert" role="status">{msg}</p>}
      <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /><span>The VIP menu page is switched on</span></label>
      <fieldset><legend className="lab">How guests order</legend>
        <label className="check"><input type="radio" name="vm" checked={s.mode === "static"} onChange={() => setS({ ...s, mode: "static" })} /><span><b>Static menu:</b> guests only read the menu. The waiter takes the order.</span></label>
        <label className="check"><input type="radio" name="vm" checked={s.mode === "whatsapp"} onChange={() => setS({ ...s, mode: "whatsapp" })} /><span><b>WhatsApp ordering:</b> guests choose items and send the order to the restaurant on WhatsApp.</span></label></fieldset>
      <div className="field"><label htmlFor="vw">VIP ordering WhatsApp number</label><input id="vw" value={s.whatsapp} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} placeholder="+2348012345678" /><p className="hint">Leave empty to use the business WhatsApp number from Website &gt; Business and contact.</p></div>
      <div className="grid-f2"><div className="field"><label htmlFor="vt">Page title</label><input id="vt" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></div><div className="field"><label htmlFor="vtl">Word for a table</label><input id="vtl" value={s.tableLabel} onChange={(e) => setS({ ...s, tableLabel: e.target.value })} /><p className="hint">For example Table, Room or Booth.</p></div></div>
      <div className="field"><label htmlFor="vin">Short welcome note (optional)</label><textarea id="vin" rows={2} value={s.intro} onChange={(e) => setS({ ...s, intro: e.target.value })} /></div>
      <button className="pill sm">Save settings</button>
    </form>
  );
}

function VipQr() {
  const [base, setBase] = useState(""); const [tables, setTables] = useState("1, 2, 3");
  useEffect(() => { setBase(`${window.location.origin}/vip`); }, []);
  const labels = useMemo(() => tables.split(/[\n,]+/).map((t) => t.trim().replace(/[^\w \-]/g, "")).filter(Boolean).slice(0, 60), [tables]);
  const urlFor = (t: string) => (t ? `${base}?t=${encodeURIComponent(t)}` : base);
  const svgOf = (t: string) => { try { return qrSvg(urlFor(t), { size: 220 }); } catch { return ""; } };
  const download = (t: string) => { const blob = new Blob([qrSvg(urlFor(t), { size: 1024 })], { type: "image/svg+xml" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `vip-qr-${t || "menu"}.svg`; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div>
      <p className="hint">Each code opens the VIP menu and tells the waiter which table the order is from. Print them and place one at each table.</p>
      <div className="grid-f2"><div className="field"><label htmlFor="qb">Menu address</label><input id="qb" value={base} onChange={(e) => setBase(e.target.value.trim())} /></div>
        <div className="field"><label htmlFor="qt">Tables (separate with commas or new lines)</label><textarea id="qt" rows={2} value={tables} onChange={(e) => setTables(e.target.value)} placeholder="1, 2, 3, VIP 1" /></div></div>
      <div className="acts"><button className="pill sm" onClick={() => window.print()}>Print all</button></div>
      <ul className="qrsheet">
        <li className="qrcard"><div dangerouslySetInnerHTML={{ __html: svgOf("") }} /><b>VIP Menu</b><span className="small dim0">General code (no table)</span><button className="linkbtn noprint" onClick={() => download("")}>Download SVG</button></li>
        {labels.map((t) => <li key={t} className="qrcard"><div dangerouslySetInnerHTML={{ __html: svgOf(t) }} /><b>Table {t}</b><span className="small dim0">Scan to view the VIP menu</span><button className="linkbtn noprint" onClick={() => download(t)}>Download SVG</button></li>)}
      </ul>
    </div>
  );
}

function VipOrders() {
  const [orders, setOrders] = useState<any[] | null>(null);
  useEffect(() => { api("/api/admin/vip/orders").then((r) => setOrders(r.ok ? r.json.orders : [])); }, []);
  if (!orders) return <p role="status">Loading…</p>;
  if (!orders.length) return <p className="hint">No VIP orders yet. When guests send orders on WhatsApp they are listed here with their reference.</p>;
  return <ul className="vip-orders">{orders.map((o) => <li key={o.ref}><div className="bar"><b className="tab">{o.ref}</b><span className="small dim0">{when(o.createdAt)}{o.table ? ` · Table ${o.table}` : ""}</span><b className="tab">{formatNaira(o.totalKobo)}</b></div><ul>{o.lines.map((l: any, i: number) => <li key={i}>{l.qty} × {l.name} <span className="tab">({formatNaira(l.unitKobo)})</span>{l.note && <em> — {l.note}</em>}</li>)}</ul>{o.note && <p className="small">Note: {o.note}</p>}</li>)}</ul>;
}
