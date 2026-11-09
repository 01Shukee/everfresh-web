"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { formatNaira } from "@/lib/money";

interface Item { id: string; name: string; description: string; priceKobo: number; imageUrl: string | null; imageAlt: string; available: boolean }
export interface VipData { title: string; intro: string | null; tableLabel: string; orderable: boolean; categories: { id: string; name: string; items: Item[] }[] }
type Done = { ref: string; url: string | null; totalKobo: number };

/** Favourites live in the guest's own browser (no sign-in needed), so they only follow them on the same phone. */
const FAV_KEY = "ef-vip-favourites";

function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2.5 5 6.2 5c2 0 3.5 1 5.8 3.3C14.3 6 15.8 5 17.8 5 21.5 5 23.5 9 21.5 12.5 19 16.65 12 21 12 21z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One dish card. Defined outside VipMenu on purpose: a component defined inside another one is rebuilt on every render. */
function Dish({ item, fav, qty, orderable, onFav, onSet }: { item: Item; fav: boolean; qty: number; orderable: boolean; onFav: (id: string) => void; onSet: (id: string, n: number) => void }) {
  const sold = !item.available;
  return (
    <li className={`vm-card${sold ? " soldout" : ""}`}>
      <button type="button" className={`vm-heart${fav ? " on" : ""}`} aria-pressed={fav} aria-label={fav ? `Remove ${item.name} from favourites` : `Save ${item.name} to favourites`} onClick={() => onFav(item.id)}><Heart on={fav} /></button>
      <div className="vm-photo">
        <MediaSlot media={item.imageUrl ? { src: item.imageUrl, alt: item.imageAlt, width: 400, height: 400 } : null} label={item.name.toUpperCase()} shape="circle" className="vm-img" />
      </div>
      <div className="vm-body">
        <h3 className="serif">{item.name}</h3>
        {item.description && <p>{item.description}</p>}
        <div className="vm-foot">
          <span className="price tab">{formatNaira(item.priceKobo)}</span>
          {sold ? <span className="tag dark">Not available</span>
            : orderable ? (qty > 0
              ? <div className="stepper qstep" role="group" aria-label={`${item.name} quantity`}><button type="button" onClick={() => onSet(item.id, qty - 1)} aria-label={`Remove one ${item.name}`}>&minus;</button><output aria-live="polite">{qty}</output><button type="button" onClick={() => onSet(item.id, qty + 1)} disabled={qty >= 20} aria-label={`Add one more ${item.name}`}>+</button></div>
              : <button type="button" className="vm-add" onClick={() => onSet(item.id, 1)} aria-label={`Add ${item.name} to your order`}><span aria-hidden="true">+</span></button>)
            : null}
        </div>
      </div>
    </li>
  );
}

/** The VIP menu. Guests can search, filter, heart their favourite dishes and, when ordering is on, send an order to the restaurant on WhatsApp. */
export function VipMenu({ data, table: tableFromQr }: { data: VipData; table: string }) {
  const [qty, setQty] = useState<Record<string, number>>({}); const [notes, setNotes] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [table, setTable] = useState(tableFromQr);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState<Done | null>(null);
  const [favs, setFavs] = useState<string[]>([]); const [tab, setTab] = useState<string>("all"); const [q, setQ] = useState("");
  const sheet = useRef<HTMLDialogElement>(null);
  const all = useMemo(() => data.categories.flatMap((c) => c.items), [data]); const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const chosen = all.filter((i) => (qty[i.id] ?? 0) > 0); const count = chosen.reduce((s, i) => s + qty[i.id], 0); const total = chosen.reduce((s, i) => s + qty[i.id] * i.priceKobo, 0);
  const set = useCallback((id: string, n: number) => setQty((cur) => { const next = { ...cur }; if (n <= 0) delete next[id]; else next[id] = Math.min(n, 20); return next; }), []);

  // Load saved favourites once, forgetting dishes that are no longer on the menu.
  useEffect(() => {
    try { const raw = localStorage.getItem(FAV_KEY); if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) setFavs(arr.filter((x): x is string => typeof x === "string" && byId.has(x))); } } catch { /* storage unavailable: favourites just won't be remembered */ }
  }, [byId]);
  const toggleFav = useCallback((id: string) => setFavs((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (i: Item) => !needle || i.name.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle);
    if (tab === "fav") return [{ id: "fav", name: "Your favourites", items: all.filter((i) => favSet.has(i.id) && hit(i)) }];
    return data.categories.filter((c) => tab === "all" || c.id === tab).map((c) => ({ id: c.id, name: c.name, items: c.items.filter(hit) })).filter((c) => c.items.length);
  }, [q, tab, all, favSet, data]);
  const shown = sections.reduce((s, c) => s + c.items.length, 0);
  const missingFavs = all.filter((i) => favSet.has(i.id) && i.available && !(qty[i.id] > 0));
  const addFavs = () => setQty((cur) => { const next = { ...cur }; for (const i of missingFavs) next[i.id] = 1; return next; });

  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/vip/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, note, lines: chosen.map((i) => ({ itemId: i.id, qty: qty[i.id], note: notes[i.id] ?? "" })) }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error ?? "We could not send your order. Please tell your waiter."); setBusy(false); return; }
      setDone({ ref: j.ref, url: j.whatsappUrl, totalKobo: j.totalKobo }); sheet.current?.close(); setBusy(false);
      if (j.whatsappUrl) window.location.assign(j.whatsappUrl);
    } catch { setErr("We could not reach the server. Check your connection and try again."); setBusy(false); }
  };
  const reset = () => { setQty({}); setNotes({}); setNote(""); setDone(null); setErr(""); window.scrollTo({ top: 0 }); };

  if (done) return (
    <div className="vip-done" role="status">
      <h2 className="serif">Your order is ready to send</h2>
      <p>Reference <b className="tab">{done.ref}</b> &middot; {formatNaira(done.totalKobo)}</p>
      {done.url ? <><p>WhatsApp should open with your order filled in. <b>Press Send</b> so it reaches the kitchen.</p><a className="pill" href={done.url}>Open WhatsApp</a></> : <p>Please tell your waiter your reference.</p>}
      <p><button className="linkbtn" onClick={reset}>Start a new order</button></p>
    </div>
  );
  return (
    <div className="vm">
      <header className="vip-head"><span className="lab green">VIP</span><h1 className="serif">{data.title}</h1>{tableFromQr && <p className="vip-table">{data.tableLabel} {tableFromQr}</p>}{data.intro && <p className="lede">{data.intro}</p>}
        {!data.orderable && <p className="vip-note">Browse the menu and tell your waiter what you would like. Tap the heart to save dishes you love.</p>}</header>

      <div className="vm-bar">
        <div className="vm-search"><SearchIcon /><label className="sr" htmlFor="vm-q">Search the menu</label><input id="vm-q" type="search" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
        <div className="vm-pills" role="group" aria-label="Show">
          <button type="button" className={`vm-pill${tab === "all" ? " on" : ""}`} aria-pressed={tab === "all"} onClick={() => setTab("all")}>All</button>
          <button type="button" className={`vm-pill${tab === "fav" ? " on" : ""}`} aria-pressed={tab === "fav"} onClick={() => setTab("fav")}><span className="hrt" aria-hidden="true">&hearts;</span> Favourites{favs.length > 0 && <span className="n">{favs.length}</span>}</button>
          {data.categories.map((c) => <button key={c.id} type="button" className={`vm-pill${tab === c.id ? " on" : ""}`} aria-pressed={tab === c.id} onClick={() => setTab(c.id)}>{c.name}</button>)}
        </div>
      </div>

      {tab === "fav" && data.orderable && missingFavs.length > 0 && <div className="vm-favbar"><span className="small dim0">Ordering the usual?</span><button type="button" className="pill sm" onClick={addFavs}>Add all to my order ({missingFavs.length})</button></div>}

      {shown === 0
        ? <div className="empty vm-empty">{tab === "fav" && !q.trim()
          ? <><p className="serif empty-title">No favourites yet.</p><p>Tap the heart on any dish to save it here, so you can order it again quickly next time.</p></>
          : <><p className="serif empty-title">Nothing found.</p><p>{q.trim() ? `No dishes match "${q.trim()}".` : "There are no dishes here right now."}</p></>}</div>
        : sections.map((c) => (
          <section key={c.id} className="vm-sec" aria-labelledby={`vm-h-${c.id}`}>
            <h2 id={`vm-h-${c.id}`} className="serif">{c.name}</h2>
            <ul className="vm-grid">{c.items.map((i) => <Dish key={i.id} item={i} fav={favSet.has(i.id)} qty={qty[i.id] ?? 0} orderable={data.orderable} onFav={toggleFav} onSet={set} />)}</ul>
          </section>))}

      {data.orderable && count > 0 && <div className="vipbar"><button type="button" onClick={() => sheet.current?.showModal()}><span className="cb-count" aria-hidden="true">{count}</span><span className="cb-lab">Review order</span><span className="tab">{formatNaira(total)}</span></button></div>}
      <dialog ref={sheet} className="vipsheet" aria-labelledby="vip-rev" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}>
        <div className="vipsheet-in">
          <div className="vipsheet-head"><h2 id="vip-rev" className="serif">Your order</h2><button type="button" className="dlg-x2" onClick={() => sheet.current?.close()} aria-label="Close">&times;</button></div>
          <ul className="viplines">{chosen.map((i) => (
            <li key={i.id}><div className="vl-top"><b>{i.name}</b><span className="tab">{formatNaira(i.priceKobo * qty[i.id])}</span></div>
              <div className="vl-row"><div className="stepper qstep" role="group" aria-label={`${i.name} quantity`}><button type="button" onClick={() => set(i.id, qty[i.id] - 1)} aria-label={`Remove one ${i.name}`}>&minus;</button><output>{qty[i.id]}</output><button type="button" onClick={() => set(i.id, qty[i.id] + 1)} disabled={qty[i.id] >= 20} aria-label={`Add one more ${i.name}`}>+</button></div><span className="small dim0 tab">{formatNaira(i.priceKobo)} each</span></div>
              <label className="sr" htmlFor={`n-${i.id}`}>Special instructions for {i.name}</label><input id={`n-${i.id}`} className="vl-note" placeholder="Special instructions (optional)" maxLength={200} value={notes[i.id] ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} /></li>))}</ul>
          <div className="field"><label htmlFor="vip-table">{data.tableLabel}</label><input id="vip-table" value={table} maxLength={20} onChange={(e) => setTable(e.target.value)} placeholder="Table number or name" /></div>
          <div className="field"><label htmlFor="vip-note">Anything else for the kitchen? <span className="opt-t">(optional)</span></label><textarea id="vip-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {err && <p className="alert" role="alert">{err}</p>}
          <div className="vipsheet-foot"><div className="vl-total"><span>Total</span><b className="tab">{formatNaira(total)}</b></div><button type="button" className="pill wa" onClick={send} disabled={busy || !chosen.length}>{busy ? "Sending\u2026" : "Send order on WhatsApp"}</button></div>
        </div>
      </dialog>
    </div>
  );
}