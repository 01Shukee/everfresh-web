"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNaira } from "@/lib/money";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { ItemDialog } from "./ItemDialog";
import { CartBar } from "./CartBar";
import { useCart } from "./CartProvider";
import type { OrderingPublic, PublicItem } from "./types";

const priceOf = (i: PublicItem) => (i.variants.length ? Math.min(...i.variants.map((v) => v.priceKobo)) : i.basePriceKobo);
/** Height of everything stuck to the top of the screen (site header + menu bar). */
const topOffset = (bar: HTMLElement | null) => ((document.querySelector(".nav") as HTMLElement | null)?.offsetHeight ?? 72) + (bar?.offsetHeight ?? 0);

export function MenuBrowser({ categories, items, ordering }: { categories: { id: string; name: string }[]; items: PublicItem[]; ordering: OrderingPublic }) {
  const [q, setQ] = useState(""); const [avail, setAvail] = useState(false); const [tag, setTag] = useState(""); const [fopen, setFopen] = useState(false);
  const [sel, setSel] = useState<PublicItem | null>(null); const { add, lines, setQty, remove } = useCart();
  const [active, setActive] = useState(""); const bar = useRef<HTMLDivElement>(null); const rail = useRef<HTMLDivElement>(null);
  const tags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return items.filter((i) => (!avail || i.available) && (!tag || i.tags.includes(tag)) && (!s || `${i.name} ${i.description} ${i.tags.join(" ")}`.toLowerCase().includes(s))); }, [items, q, avail, tag]);
  const groups = categories.map((c) => ({ c, list: shown.filter((i) => i.categoryId === c.id) })).filter((g) => g.list.length);
  const ids = groups.map((g) => g.c.id).join(",");
  const filterCount = (avail ? 1 : 0) + (tag ? 1 : 0);

  // Highlight the category you are currently reading, and keep its chip in view.
  useEffect(() => {
    const list = ids ? ids.split(",") : []; if (!list.length) return; let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const off = topOffset(bar.current) + 24; let cur = list[0]; for (const id of list) { const el = document.getElementById(`sec-${id}`); if (el && el.getBoundingClientRect().top <= off) cur = id; } setActive(cur); }); };
    run(); window.addEventListener("scroll", run, { passive: true }); window.addEventListener("resize", run);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", run); window.removeEventListener("resize", run); };
  }, [ids]);
  useEffect(() => { const r = rail.current; const b = r?.querySelector<HTMLElement>('[aria-current="true"]'); if (r && b) r.scrollTo({ left: Math.max(0, b.offsetLeft - 16), behavior: "smooth" }); }, [active]);
  const go = (id: string) => { const el = document.getElementById(`sec-${id}`); if (!el) return; setFopen(false); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topOffset(bar.current) - 8, behavior: "smooth" }); setActive(id); };

  const inCart = (id: string) => lines.filter((l) => l.itemId === id).reduce((s, l) => s + l.qty, 0);
  const plainLine = (id: string) => lines.find((l) => l.itemId === id && !l.variantId && l.addOnIds.length === 0 && !l.note.trim());
  const quick = (i: PublicItem) => add({ itemId: i.id, variantId: null, addOnIds: [], qty: 1, note: "", name: i.name, label: "Standard", estKobo: i.basePriceKobo });
  const clear = () => { setQ(""); setAvail(false); setTag(""); };
  if (!items.length) return <div className="empty"><p className="serif empty-title">The menu is being prepared.</p><p>Please check back soon, or contact us to order.</p></div>;
  return (
    <>
      <div className="menubar" ref={bar}>
        <div className="mb-row">
          <label className="search"><span className="sr">Search the menu</span><input type="search" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button type="button" className={`pill ghost sm filterbtn ${filterCount ? "has" : ""}`} aria-expanded={fopen} aria-controls="filterpanel" onClick={() => setFopen(!fopen)}>Filters{filterCount > 0 && <span className="cartn" aria-label={`${filterCount} active`}>{filterCount}</span>}</button>
        </div>
        <div className="catrail" ref={rail} role="group" aria-label="Jump to category">
          {groups.map(({ c, list }) => <button key={c.id} type="button" className={active === c.id ? "cat on" : "cat"} aria-current={active === c.id ? "true" : undefined} onClick={() => go(c.id)}>{c.name} <span>{list.length}</span></button>)}
        </div>
        {fopen && (
          <div id="filterpanel" className="filterpanel">
            <div className="filters">
              <label className="check"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> Available now</label>
              {tags.map((t) => <button key={t} type="button" className={tag === t ? "chip on" : "chip"} aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>)}
            </div>
            <div className="fp-foot"><button type="button" className="linkbtn" onClick={clear} disabled={!filterCount && !q}>Clear all</button><button type="button" className="pill sm" onClick={() => setFopen(false)}>Show {shown.length} dish{shown.length === 1 ? "" : "es"}</button></div>
          </div>
        )}
      </div>
      <p className="sr" role="status" aria-live="polite">{shown.length} item{shown.length === 1 ? "" : "s"} shown</p>
      {shown.length === 0 && <div className="empty"><p className="serif empty-title">Nothing matches your search.</p><button className="pill sm" onClick={clear}>Clear filters</button></div>}
      {groups.map(({ c, list }) => (
        <section key={c.id} id={`sec-${c.id}`} aria-labelledby={`cat-${c.id}`} className="menusec">
          <h2 id={`cat-${c.id}`} className="serif">{c.name}</h2>
          <ul className="dishes">
            {list.map((i, n) => {
              const complex = i.variants.length > 0 || i.addOnGroups.length > 0; const count = inCart(i.id); const pl = !complex ? plainLine(i.id) : undefined;
              return (
                <li key={i.id} className={`dish ${!i.available ? "soldout" : ""} ${n === 0 ? "feature" : ""}`}>
                  <MediaSlot media={i.imageUrl ? { src: i.imageUrl, alt: i.imageAlt, width: 400, height: 400 } : null} label={i.name.toUpperCase()} shape="circle" className="dish-img" />
                  <div className="dish-body"><h3 className="serif">{i.name}</h3>{i.description && <p>{i.description}</p>}
                    <div className="dish-meta"><span className="price tab">{i.variants.length ? "From " : ""}{formatNaira(priceOf(i))}</span>{!i.available && <span className="tag dark">Sold out</span>}{complex && count > 0 && <span className="incart">{count} in cart</span>}</div></div>
                  {!i.available ? <button className="pill sm addbtn" disabled aria-label={`${i.name} is sold out`}><span className="addlab">Sold out</span></button>
                    : pl ? (
                      <div className="stepper qstep" role="group" aria-label={`${i.name} quantity`}>
                        <button type="button" onClick={() => (pl.qty <= 1 ? remove(pl.key) : setQty(pl.key, pl.qty - 1))} aria-label={pl.qty <= 1 ? `Remove ${i.name}` : `Decrease ${i.name} quantity`}>&minus;</button>
                        <output aria-live="polite">{pl.qty}</output>
                        <button type="button" onClick={() => setQty(pl.key, pl.qty + 1)} disabled={pl.qty >= ordering.limits.maxQtyPerLine} aria-label={`Increase ${i.name} quantity`}>+</button>
                      </div>
                    ) : <button type="button" className="pill sm addbtn" onClick={() => (complex ? setSel(i) : quick(i))} aria-label={`${complex ? "Choose options for" : "Add"} ${i.name}`}><span className="addlab">{complex ? "Choose" : "Add to cart"}</span><span className="plus" aria-hidden="true">+</span></button>}
                </li>);
            })}
          </ul>
        </section>))}
      <ItemDialog item={sel} onClose={() => setSel(null)} maxQty={ordering.limits.maxQtyPerLine} />
      <CartBar />
    </>
  );
}
