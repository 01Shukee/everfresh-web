"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decimalToKobo, formatNaira, koboToDecimal } from "@/lib/money";
import type { Category, MenuItem } from "@/server/types";
import { UploadButton, api } from "./shared";
import "./admin-menu.css";

/* ------------------------------------------------------------------ helpers */
const uid = () => Math.random().toString(36).slice(2, 10);
const naira = (k: number) => koboToDecimal(k).replace(/\.00$/, "");
const toKobo = (s: string) => decimalToKobo(s.replace(/[₦,\s]/g, ""));
const PRICE_HELP = "Enter the price in naira, for example 2500 or 2500.50.";
const MAX_SIZES = 8, MAX_GROUPS = 6, MAX_OPTIONS = 20;

type StatusFilter = "all" | "enabled" | "hidden" | "soldout";
const STATUS_LABELS: Record<StatusFilter, string> = { all: "All", enabled: "Enabled", hidden: "Hidden", soldout: "Sold out" };

interface SizeRow { id: string; name: string; price: string }
interface OptionRow { id: string; name: string; price: string; available: boolean }
interface GroupRow { id: string; name: string; min: string; max: string; options: OptionRow[] }
interface Form {
  name: string; categoryId: string; description: string; price: string;
  sizes: SizeRow[]; groups: GroupRow[]; tags: string;
  imageUrl: string; imageAlt: string; active: boolean; available: boolean;
}

const blankOption = (): OptionRow => ({ id: uid(), name: "", price: "", available: true });
const blankGroup = (): GroupRow => ({ id: uid(), name: "", min: "0", max: "1", options: [blankOption()] });

function toForm(i: MenuItem | null, categoryId: string): Form {
  if (!i) return { name: "", categoryId, description: "", price: "", sizes: [], groups: [], tags: "", imageUrl: "", imageAlt: "", active: true, available: true };
  return {
    name: i.name, categoryId: i.categoryId, description: i.description,
    price: i.variants.length ? "" : naira(i.basePriceKobo),
    sizes: i.variants.map((v) => ({ id: v.id, name: v.name, price: naira(v.priceKobo) })),
    groups: i.addOnGroups.map((g) => ({
      id: g.id, name: g.name, min: String(g.min), max: String(g.max),
      options: g.options.map((o) => ({ id: o.id, name: o.name, price: naira(o.priceKobo), available: o.available })),
    })),
    tags: i.tags.join(", "), imageUrl: i.imageUrl ?? "", imageAlt: i.imageAlt, active: i.active, available: i.available,
  };
}

/** Turns the form into the body the API expects, or returns a plain-language error. Server validation still applies. */
function toBody(f: Form): { error: string } | { body: Record<string, unknown> } {
  const name = f.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "The name must be 2 to 80 characters." };
  if (!f.categoryId) return { error: "Choose a category." };

  const variants = [];
  for (const [n, s] of f.sizes.entries()) {
    if (!s.name.trim() && !s.price.trim()) continue; // ignore empty rows
    const k = toKobo(s.price);
    if (!s.name.trim() || k === null || k <= 0) return { error: `Size ${n + 1}: give it a name and a price above zero.` };
    variants.push({ id: s.id, name: s.name.trim(), priceKobo: k });
  }

  let base = 0;
  if (!variants.length) {
    const k = f.price.trim() ? toKobo(f.price) : null;
    if (k === null || k <= 0) return { error: f.price.trim() ? PRICE_HELP : "Enter a price above zero." };
    base = k;
  }

  const addOnGroups = [];
  for (const [n, g] of f.groups.entries()) {
    const opts = g.options.filter((o) => o.name.trim() || o.price.trim());
    if (!g.name.trim() && opts.length === 0) continue; // ignore empty groups
    const label = `Add-on group ${n + 1}`;
    if (!g.name.trim()) return { error: `${label}: give the group a name, for example "Extras".` };
    if (opts.length === 0) return { error: `${label} (${g.name.trim()}): add at least one option.` };
    const min = Number(g.min), max = Number(g.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) return { error: `${label} (${g.name.trim()}): "Customer must pick" and "up to" must be whole numbers, and the first cannot be bigger than the second (up to at least 1).` };
    if (min > opts.length) return { error: `${label} (${g.name.trim()}): customers must pick ${min}, but there are only ${opts.length} options.` };
    const options = [];
    for (const [m, o] of opts.entries()) {
      const k = o.price.trim() ? toKobo(o.price) : 0;
      if (!o.name.trim() || k === null) return { error: `${label} (${g.name.trim()}), option ${m + 1}: give it a name and a price (or leave the price empty for free).` };
      options.push({ id: o.id, name: o.name.trim(), priceKobo: k, available: o.available });
    }
    addOnGroups.push({ id: g.id, name: g.name.trim(), min, max, options });
  }

  return {
    body: {
      name, categoryId: f.categoryId, description: f.description.trim(), basePriceKobo: base, variants, addOnGroups,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      imageUrl: f.imageUrl.trim() || null, imageAlt: f.imageAlt.trim(), active: f.active, available: f.available,
    },
  };
}

/* ------------------------------------------------------------------ switch */
function Switch({ checked, onChange, label, visibleLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; visibleLabel?: string }) {
  return (
    <label className="mm-sw">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="mm-sw-track" aria-hidden="true" />
      {visibleLabel && <span className="mm-sw-text">{visibleLabel}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ main list */
export function AdminMenu() {
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<{ item: MenuItem | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api("/api/admin/menu");
    if (r.ok) { setItems(r.json.items); setCats([...(r.json.categories as Category[])].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t); }, [msg]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(t); }, [flash]);

  const catName = useCallback((id: string) => cats.find((c) => c.id === id)?.name ?? "Unknown category", [cats]);

  /** Saves a quick change from the list. The row updates at once and rolls back if the server refuses. */
  const patch = async (i: MenuItem, changes: Partial<MenuItem>, what: string) => {
    setItems((prev) => prev && prev.map((x) => (x.id === i.id ? { ...x, ...changes } : x)));
    const r = await api(`/api/admin/menu/${i.id}`, "PUT", { ...i, ...changes });
    if (r.ok) { setItems((prev) => prev && prev.map((x) => (x.id === i.id ? (r.json as MenuItem) : x))); setMsg({ ok: true, text: `${i.name}: ${what}.` }); }
    else { setMsg({ ok: false, text: r.json.error ?? `Could not update ${i.name}.` }); load(); }
  };
  const remove = async (i: MenuItem) => {
    if (!confirm(`Delete ${i.name}? Past orders keep their copy of it.`)) return;
    const r = await api(`/api/admin/menu/${i.id}`, "DELETE");
    setMsg(r.ok ? { ok: true, text: `${i.name} deleted.` } : { ok: false, text: r.json.error ?? "Could not delete." }); load();
  };

  const q = query.trim().toLowerCase();
  const matches = useCallback((i: MenuItem) => {
    if (status === "enabled" && !i.active) return false;
    if (status === "hidden" && i.active) return false;
    if (status === "soldout" && i.available) return false;
    return !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q));
  }, [q, status]);

  const all = items ?? [];
  const visible = useMemo(() => all.filter(matches), [all, matches]);
  const countFor = (id: string) => visible.filter((i) => i.categoryId === id).length;
  const shown = catFilter === "all" ? visible : visible.filter((i) => i.categoryId === catFilter);

  // Groups follow the menu order. Items whose category no longer exists are collected at the end instead of being lost.
  const groups = useMemo(() => {
    const known = new Set(cats.map((c) => c.id));
    const out = cats.map((c) => ({ id: c.id, name: c.name, active: c.active, items: shown.filter((i) => i.categoryId === c.id) }));
    const orphans = shown.filter((i) => !known.has(i.categoryId));
    if (orphans.length) out.push({ id: "__none", name: "Unknown category", active: false, items: orphans });
    return out.filter((g) => g.items.length > 0).map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)) }));
  }, [cats, shown]);

  const filtering = !!q || status !== "all" || catFilter !== "all";
  const clearFilters = () => { setQuery(""); setStatus("all"); setCatFilter("all"); };
  const toggleGroup = (id: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section aria-labelledby="mh" className="mm">
      <div className="mm-toolbar">
        <div className="bar">
          <h2 id="mh" className="serif">Menu items</h2>
          <button className="pill sm" onClick={() => setModal({ item: null })} disabled={cats.length === 0}>+ Add item</button>
        </div>
        <div className="mm-search">
          <label className="sr" htmlFor="mm-q">Search menu items</label>
          <input id="mm-q" type="search" placeholder="Search by name, description or tag" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="mm-chips" role="group" aria-label="Filter by category">
          <button type="button" className={catFilter === "all" ? "on" : ""} aria-pressed={catFilter === "all"} onClick={() => setCatFilter("all")}>All <span>{visible.length}</span></button>
          {cats.map((c) => (
            <button type="button" key={c.id} className={`${catFilter === c.id ? "on" : ""} ${countFor(c.id) === 0 ? "zero" : ""}`} aria-pressed={catFilter === c.id} onClick={() => setCatFilter(catFilter === c.id ? "all" : c.id)}>{c.name} <span>{countFor(c.id)}</span></button>
          ))}
        </div>
        <div className="mm-meta">
          <div className="mm-seg" role="group" aria-label="Filter by status">
            {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => <button type="button" key={s} className={status === s ? "on" : ""} aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABELS[s]}</button>)}
          </div>
          <span className="small mm-count" role="status">Showing {shown.length} of {all.length}</span>
          {filtering && <button type="button" className="linkbtn" onClick={clearFilters}>Clear filters</button>}
          {!filtering && groups.length > 1 && <button type="button" className="linkbtn" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.id)))}>{collapsed.size ? "Expand all" : "Collapse all"}</button>}
        </div>
      </div>

      {cats.length === 0 && items && <p className="hint">Create a category first (Categories tab), then add dishes here.</p>}
      <div className="mm-live" aria-live="polite">{msg && <p className={`alert ${msg.ok ? "mm-ok" : ""}`} role="status">{msg.text}</p>}</div>

      {!items ? <p role="status">Loading…</p> : all.length === 0 ? <div className="empty"><p className="serif empty-title">No menu items yet.</p></div> : shown.length === 0 ? (
        <div className="empty"><p className="serif empty-title">Nothing matches.</p><p className="hint">Try a different word, or <button type="button" className="linkbtn" onClick={clearFilters}>clear the filters</button>.</p></div>
      ) : groups.map((g) => {
        const open = filtering || !collapsed.has(g.id);
        return (
          <div className="mm-group" key={g.id}>
            <button type="button" className="mm-ghead" aria-expanded={open} onClick={() => !filtering && toggleGroup(g.id)} aria-disabled={filtering}>
              <span className="mm-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
              <b>{g.name}</b><span className="small">{g.items.length} dish{g.items.length === 1 ? "" : "es"}</span>
              {!g.active && <span className="tag dark">Category hidden</span>}
            </button>
            {open && <ul className="mm-list">{g.items.map((i) => (
              <ItemRow key={i.id} item={i} flash={flash === i.id} onEdit={() => setModal({ item: i })} onDelete={() => remove(i)}
                onToggleActive={(v) => patch(i, { active: v }, v ? "now visible to customers" : "now hidden from customers")}
                onToggleStock={(v) => patch(i, { available: v }, v ? "back in stock" : "marked sold out")}
                onPrice={(k) => patch(i, { basePriceKobo: k }, `price set to ${formatNaira(k)}`)} />
            ))}</ul>}
          </div>
        );
      })}

      {modal && <ItemModal item={modal.item} cats={cats} defaultCategory={catFilter !== "all" ? catFilter : cats[0]?.id ?? ""} onClose={() => setModal(null)}
        onSaved={(saved, isNew) => { setModal(null); setMsg({ ok: true, text: `${saved.name} ${isNew ? "added" : "saved"} in ${catName(saved.categoryId)}.` }); setFlash(saved.id); load(); }} />}
    </section>
  );
}

/* ------------------------------------------------------------------ row */
function ItemRow({ item: i, flash, onEdit, onDelete, onToggleActive, onToggleStock, onPrice }: {
  item: MenuItem; flash: boolean; onEdit: () => void; onDelete: () => void;
  onToggleActive: (v: boolean) => void; onToggleStock: (v: boolean) => void; onPrice: (kobo: number) => void;
}) {
  const [v, setV] = useState(naira(i.basePriceKobo)); const [err, setErr] = useState("");
  useEffect(() => { setV(naira(i.basePriceKobo)); setErr(""); }, [i.basePriceKobo]);
  const commit = () => {
    if (v.trim() === naira(i.basePriceKobo)) return;
    const k = toKobo(v);
    if (k === null || k <= 0) { setErr(PRICE_HELP); return; }
    setErr(""); onPrice(k);
  };
  return (
    <li className={`mm-row ${flash ? "flash" : ""} ${!i.active ? "is-hidden" : ""} ${!i.available ? "is-sold" : ""}`}>
      <div className="mm-thumb" aria-hidden="true">{i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span>{i.name.slice(0, 1).toUpperCase()}</span>}</div>
      <div className="mm-name">
        <button type="button" className="mm-title" onClick={onEdit}>{i.name}</button>
        <span className="small mm-sub">
          {!i.active && <span className="tag dark">Hidden</span>}{i.active && !i.available && <span className="tag">Sold out</span>}
          {i.variants.length > 0 && <span>{i.variants.length} size{i.variants.length === 1 ? "" : "s"}</span>}
          {i.addOnGroups.length > 0 && <span>{i.addOnGroups.length} add-on group{i.addOnGroups.length === 1 ? "" : "s"}</span>}
        </span>
      </div>
      <div className="mm-price">
        {i.variants.length ? (
          <button type="button" className="linkbtn" onClick={onEdit} title="Prices are set per size. Open the item to change them.">from {formatNaira(Math.min(...i.variants.map((x) => x.priceKobo)))}</button>
        ) : (
          <label><span className="sr">Price of {i.name} in naira</span>
            <span className="mm-money"><i aria-hidden="true">₦</i>
              <input inputMode="decimal" value={v} aria-invalid={!!err} onChange={(e) => { setV(e.target.value); setErr(""); }} onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } if (e.key === "Escape") { setV(naira(i.basePriceKobo)); setErr(""); e.currentTarget.blur(); } }} />
            </span>
          </label>
        )}
        {err && <span className="err mm-perr" role="alert">{err}</span>}
      </div>
      <div className="mm-switches">
        <Switch checked={i.active} onChange={onToggleActive} label={`${i.name} visible to customers`} visibleLabel="Visible" />
        <Switch checked={i.available} onChange={onToggleStock} label={`${i.name} in stock`} visibleLabel="In stock" />
      </div>
      <div className="mm-acts"><button type="button" className="pill ghost sm" onClick={onEdit}>Edit</button><button type="button" className="linkbtn mm-del" onClick={onDelete}>Delete</button></div>
    </li>
  );
}

/* ------------------------------------------------------------------ modal */
function ItemModal({ item, cats, defaultCategory, onClose, onSaved }: {
  item: MenuItem | null; cats: Category[]; defaultCategory: string; onClose: () => void; onSaved: (saved: MenuItem, isNew: boolean) => void;
}) {
  const [f, setF] = useState<Form>(() => toForm(item, defaultCategory));
  const initial = useRef(JSON.stringify(f));
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const bodyRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(f) !== initial.current;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const tryClose = useCallback(() => { if (busy) return; if (JSON.stringify(f) !== initial.current && !confirm("Discard your changes to this item?")) return; onClose(); }, [busy, f, onClose]);

  // Lock page scroll behind the pop-up and give focus back to whatever opened it.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  const save = async () => {
    if (busy) return; setErr("");
    const r = toBody(f);
    if ("error" in r) { setErr(r.error); bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    const res = await api(item ? `/api/admin/menu/${item.id}` : "/api/admin/menu", item ? "PUT" : "POST", r.body);
    setBusy(false);
    if (!res.ok) { setErr(res.json.error ?? "Could not save. Please try again."); bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    onSaved(res.json as MenuItem, !item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); tryClose(); return; }
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); return; }
    if (e.key === "Tab" && dialog.current) { // keep keyboard focus inside the pop-up
      const els = Array.from(dialog.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (!els.length) return; const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const hasSizes = f.sizes.some((s) => s.name.trim() || s.price.trim());
  const updSize = (n: number, p: Partial<SizeRow>) => set("sizes", f.sizes.map((s, x) => (x === n ? { ...s, ...p } : s)));
  const updGroup = (n: number, p: Partial<GroupRow>) => set("groups", f.groups.map((g, x) => (x === n ? { ...g, ...p } : g)));
  const updOption = (n: number, m: number, p: Partial<OptionRow>) => updGroup(n, { options: f.groups[n].options.map((o, x) => (x === m ? { ...o, ...p } : o)) });
  const imgOk = f.imageUrl.trim();

  return (
    <div className="mm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <div className="mm-dialog" role="dialog" aria-modal="true" aria-labelledby="mm-title" ref={dialog} onKeyDown={onKeyDown}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }} noValidate>
          <header className="mm-dhead">
            <h3 id="mm-title" className="serif">{item ? `Edit ${item.name}` : "New menu item"}</h3>
            <button type="button" className="mm-x" onClick={tryClose} aria-label="Close">×</button>
          </header>

          <div className="mm-dbody" ref={bodyRef}>
            {err && <p className="alert" role="alert">{err}</p>}

            <fieldset className="mm-sec"><legend>Basics</legend>
              <div className="mm-two">
                <div className="field"><label htmlFor="mm-n">Name</label><input id="mm-n" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoFocus /></div>
                <div className="field"><label htmlFor="mm-c">Category</label><select id="mm-c" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (hidden)"}</option>)}</select></div>
              </div>
              <div className="field"><label htmlFor="mm-d">Description</label><textarea id="mm-d" rows={2} maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} /><p className="hint">{f.description.length}/500</p></div>
              <div className="field"><label htmlFor="mm-t">Tags</label><input id="mm-t" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="spicy, vegetarian" /><p className="hint">Separate tags with commas.</p></div>
            </fieldset>

            <fieldset className="mm-sec"><legend>Photo</legend>
              <div className="mm-photo">
                <div className="mm-pv">{imgOk ? <img src={imgOk} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} /> : <span className="small">No photo</span>}</div>
                <div className="mm-photo-f">
                  <div className="mm-photo-btns"><UploadButton onUploaded={(u) => set("imageUrl", u)} label={imgOk ? "Replace photo" : "Upload photo"} />{imgOk && <button type="button" className="linkbtn" onClick={() => set("imageUrl", "")}>Remove photo</button>}</div>
                  <div className="field"><label htmlFor="mm-u">Photo path or web address</label><input id="mm-u" value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="/uploads/… or https://…" /></div>
                  <div className="field"><label htmlFor="mm-a">Photo description (for screen readers)</label><input id="mm-a" value={f.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} /></div>
                </div>
              </div>
            </fieldset>

            <fieldset className="mm-sec"><legend>Price and sizes</legend>
              <div className="field mm-pricef"><label htmlFor="mm-p">Price (₦)</label><input id="mm-p" inputMode="decimal" value={f.price} disabled={hasSizes} onChange={(e) => set("price", e.target.value)} placeholder="2500" />
                <p className="hint">{hasSizes ? "This dish has sizes, so each size carries its own price." : "One price for the whole dish. Add sizes below only if the dish comes in portions (Small, Large…)."}</p></div>
              {f.sizes.length > 0 && <ul className="mm-rows" aria-label="Sizes">{f.sizes.map((s, n) => (
                <li key={s.id}>
                  <div className="field"><label htmlFor={`mm-sn${n}`}>Size name</label><input id={`mm-sn${n}`} value={s.name} onChange={(e) => updSize(n, { name: e.target.value })} placeholder="Small" /></div>
                  <div className="field"><label htmlFor={`mm-sp${n}`}>Price (₦)</label><input id={`mm-sp${n}`} inputMode="decimal" value={s.price} onChange={(e) => updSize(n, { price: e.target.value })} placeholder="2000" /></div>
                  <button type="button" className="mm-rm" aria-label={`Remove size ${s.name || n + 1}`} onClick={() => set("sizes", f.sizes.filter((_, x) => x !== n))}>Remove</button>
                </li>))}</ul>}
              <button type="button" className="pill ghost sm" disabled={f.sizes.length >= MAX_SIZES} onClick={() => set("sizes", [...f.sizes, { id: uid(), name: "", price: "" }])}>+ Add a size</button>
            </fieldset>

            <fieldset className="mm-sec"><legend>Add-ons</legend>
              <p className="hint mm-first">Optional extras customers can choose, for example “Extra protein” or “Sides”.</p>
              {f.groups.map((g, n) => (
                <div className="mm-gcard" key={g.id}>
                  <div className="mm-ghd">
                    <div className="field"><label htmlFor={`mm-gn${n}`}>Group name</label><input id={`mm-gn${n}`} value={g.name} onChange={(e) => updGroup(n, { name: e.target.value })} placeholder="Extras" /></div>
                    <div className="field mm-num"><label htmlFor={`mm-gmin${n}`}>Must pick at least</label><input id={`mm-gmin${n}`} inputMode="numeric" value={g.min} onChange={(e) => updGroup(n, { min: e.target.value })} /></div>
                    <div className="field mm-num"><label htmlFor={`mm-gmax${n}`}>Up to</label><input id={`mm-gmax${n}`} inputMode="numeric" value={g.max} onChange={(e) => updGroup(n, { max: e.target.value })} /></div>
                    <button type="button" className="mm-rm" aria-label={`Remove group ${g.name || n + 1}`} onClick={() => { if (!g.name.trim() && !g.options.some((o) => o.name.trim()) || confirm(`Remove the “${g.name || "unnamed"}” group and its options?`)) set("groups", f.groups.filter((_, x) => x !== n)); }}>Remove group</button>
                  </div>
                  <p className="hint">{Number(g.min) === 0 ? "Optional" : `Required: pick at least ${g.min}`}{Number(g.max) >= 1 ? `, up to ${g.max}` : ""}.</p>
                  <ul className="mm-rows mm-opts" aria-label={`Options in ${g.name || "group"}`}>{g.options.map((o, m) => (
                    <li key={o.id}>
                      <div className="field"><label htmlFor={`mm-on${n}-${m}`}>Option</label><input id={`mm-on${n}-${m}`} value={o.name} onChange={(e) => updOption(n, m, { name: e.target.value })} placeholder="Grilled chicken" /></div>
                      <div className="field"><label htmlFor={`mm-op${n}-${m}`}>Extra price (₦)</label><input id={`mm-op${n}-${m}`} inputMode="decimal" value={o.price} onChange={(e) => updOption(n, m, { price: e.target.value })} placeholder="0 = free" /></div>
                      <Switch checked={o.available} onChange={(v) => updOption(n, m, { available: v })} label={`${o.name || "Option"} in stock`} visibleLabel="In stock" />
                      <button type="button" className="mm-rm" aria-label={`Remove option ${o.name || m + 1}`} onClick={() => updGroup(n, { options: g.options.filter((_, x) => x !== m) })}>Remove</button>
                    </li>))}</ul>
                  <button type="button" className="pill ghost sm" disabled={g.options.length >= MAX_OPTIONS} onClick={() => updGroup(n, { options: [...g.options, blankOption()] })}>+ Add option</button>
                </div>))}
              <button type="button" className="pill ghost sm" disabled={f.groups.length >= MAX_GROUPS} onClick={() => set("groups", [...f.groups, blankGroup()])}>+ Add an add-on group</button>
            </fieldset>

            <fieldset className="mm-sec"><legend>Visibility</legend>
              <div className="mm-vis">
                <Switch checked={f.active} onChange={(v) => set("active", v)} label="Visible to customers" visibleLabel="Visible to customers" />
                <Switch checked={f.available} onChange={(v) => set("available", v)} label="In stock" visibleLabel="In stock (turn off for sold out)" />
              </div>
            </fieldset>
          </div>

          <footer className="mm-dfoot">
            <span className="small mm-dirty">{dirty ? "Unsaved changes" : "No changes yet"}</span>
            <button type="button" className="pill ghost sm" onClick={tryClose}>Cancel</button>
            <button type="submit" className="pill sm" disabled={busy}>{busy ? "Saving…" : item ? "Save changes" : "Add item"}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}