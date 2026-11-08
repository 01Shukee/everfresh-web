"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { formatNaira } from "@/lib/money";

interface Item { id: string; name: string; description: string; priceKobo: number; imageUrl: string | null; imageAlt: string; available: boolean }
export interface VipData { title: string; intro: string | null; tableLabel: string; orderable: boolean; categories: { id: string; name: string; items: Item[] }[] }
type Done = { ref: string; url: string | null; totalKobo: number };

/** The VIP menu. In static mode it is a read-only menu. When ordering is on, guests pick items, review them, and send the order to the restaurant on WhatsApp. */
export function VipMenu({ data, table: tableFromQr }: { data: VipData; table: string }) {
  const [qty, setQty] = useState<Record<string, number>>({}); const [notes, setNotes] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [table, setTable] = useState(tableFromQr);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState<Done | null>(null); const [active, setActive] = useState(data.categories[0]?.id ?? "");
  const sheet = useRef<HTMLDialogElement>(null); const bar = useRef<HTMLDivElement>(null);
  const all = useMemo(() => data.categories.flatMap((c) => c.items), [data]); const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const chosen = all.filter((i) => (qty[i.id] ?? 0) > 0); const count = chosen.reduce((s, i) => s + qty[i.id], 0); const total = chosen.reduce((s, i) => s + qty[i.id] * i.priceKobo, 0);
  const set = (id: string, n: number) => setQty((q) => { const next = { ...q }; if (n <= 0) delete next[id]; else next[id] = Math.min(n, 20); return next; });

  useEffect(() => { // highlight the category being read
    const ids = data.categories.map((c) => c.id); let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const off = ((document.querySelector(".nav") as HTMLElement | null)?.offsetHeight ?? 72) + (bar.current?.offsetHeight ?? 0) + 24; let cur = ids[0]; for (const id of ids) { const el = document.getElementById(`vip-${id}`); if (el && el.getBoundingClientRect().top <= off) cur = id; } setActive(cur); }); };
    run(); window.addEventListener("scroll", run, { passive: true }); return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", run); };
  }, [data]);
  const go = (id: string) => { const el = document.getElementById(`vip-${id}`); if (!el) return; const off = ((document.querySelector(".nav") as HTMLElement | null)?.offsetHeight ?? 72) + (bar.current?.offsetHeight ?? 0) + 8; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" }); setActive(id); };

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
    <>
      <header className="vip-head"><span className="lab green">VIP</span><h1 className="serif">{data.title}</h1>{tableFromQr && <p className="vip-table">{data.tableLabel} {tableFromQr}</p>}{data.intro && <p className="lede">{data.intro}</p>}
        {!data.orderable && <p className="vip-note">Browse the menu and tell your waiter what you would like.</p>}</header>
      <div className="menubar" ref={bar}><div className="catrail" role="group" aria-label="Jump to category">{data.categories.map((c) => <button key={c.id} type="button" className={active === c.id ? "cat on" : "cat"} aria-current={active === c.id ? "true" : undefined} onClick={() => go(c.id)}>{c.name}</button>)}</div></div>
      {data.categories.map((c) => (
        <section key={c.id} id={`vip-${c.id}`} className="menusec" aria-labelledby={`vh-${c.id}`}>
          <h2 id={`vh-${c.id}`} className="serif">{c.name}</h2>
          <ul className="dishes">
            {c.items.map((i) => { const n = qty[i.id] ?? 0; return (
              <li key={i.id} className={`dish vip-dish ${!i.available ? "soldout" : ""}`}>
                <MediaSlot media={i.imageUrl ? { src: i.imageUrl, alt: i.imageAlt, width: 400, height: 400 } : null} label={i.name.toUpperCase()} shape="circle" className="dish-img" />
                <div className="dish-body"><h3 className="serif">{i.name}</h3>{i.description && <p>{i.description}</p>}<div className="dish-meta"><span className="price tab">{formatNaira(i.priceKobo)}</span>{!i.available && <span className="tag dark">Not available</span>}</div></div>
                {data.orderable && i.available && (n > 0
                  ? <div className="stepper qstep" role="group" aria-label={`${i.name} quantity`}><button type="button" onClick={() => set(i.id, n - 1)} aria-label={`Remove one ${i.name}`}>&minus;</button><output aria-live="polite">{n}</output><button type="button" onClick={() => set(i.id, n + 1)} disabled={n >= 20} aria-label={`Add one more ${i.name}`}>+</button></div>
                  : <button type="button" className="pill sm addbtn" onClick={() => set(i.id, 1)} aria-label={`Add ${i.name}`}><span className="addlab">Add</span><span className="plus" aria-hidden="true">+</span></button>)}
              </li>); })}
          </ul>
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
          <div className="vipsheet-foot"><div className="vl-total"><span>Total</span><b className="tab">{formatNaira(total)}</b></div><button type="button" className="pill wa" onClick={send} disabled={busy || !chosen.length}>{busy ? "Sending…" : "Send order on WhatsApp"}</button></div>
        </div>
      </dialog>
    </>
  );
}
