"use client";
import { useMemo, useState } from "react";
import { formatNaira } from "@/lib/money";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { ItemDialog } from "./ItemDialog";
import { useCart } from "./CartProvider";
import type { OrderingPublic, PublicItem } from "./types";

const priceOf = (i: PublicItem) => (i.variants.length ? Math.min(...i.variants.map((v) => v.priceKobo)) : i.basePriceKobo);

export function MenuBrowser({ categories, items, ordering }: { categories: { id: string; name: string }[]; items: PublicItem[]; ordering: OrderingPublic }) {
  const [q, setQ] = useState(""); const [cat, setCat] = useState("all"); const [avail, setAvail] = useState(false); const [tag, setTag] = useState("");
  const [sel, setSel] = useState<PublicItem | null>(null); const { add, setOpen } = useCart();
  const tags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; items.forEach((i) => (m[i.categoryId] = (m[i.categoryId] ?? 0) + 1)); return m; }, [items]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return items.filter((i) => (cat === "all" || i.categoryId === cat) && (!avail || i.available) && (!tag || i.tags.includes(tag)) && (!s || `${i.name} ${i.description} ${i.tags.join(" ")}`.toLowerCase().includes(s))); }, [items, q, cat, avail, tag]);
  const groups = categories.map((c) => ({ c, list: shown.filter((i) => i.categoryId === c.id) })).filter((g) => g.list.length);

  const quick = (i: PublicItem) => { add({ itemId: i.id, variantId: null, addOnIds: [], qty: 1, note: "", name: i.name, label: "Standard", estKobo: i.basePriceKobo }); setOpen(true); };
  if (!items.length) return <div className="empty"><p className="serif empty-title">The menu is being prepared.</p><p>Please check back soon, or contact us to order.</p></div>;
  return (
    <>
      <div className="menubar">
        <label className="search"><span className="sr">Search the menu</span><input type="search" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="catrail" role="group" aria-label="Categories">
          <button className={cat === "all" ? "cat on" : "cat"} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All <span>{items.length}</span></button>
          {categories.filter((c) => counts[c.id]).map((c) => <button key={c.id} className={cat === c.id ? "cat on" : "cat"} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name} <span>{counts[c.id]}</span></button>)}
        </div>
        <div className="filters">
          <label className="check"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> Available now</label>
          {tags.map((t) => <button key={t} className={tag === t ? "chip on" : "chip"} aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>)}
        </div>
      </div>
      <p className="sr" role="status" aria-live="polite">{shown.length} item{shown.length === 1 ? "" : "s"} shown</p>
      {shown.length === 0 && <div className="empty"><p className="serif empty-title">Nothing matches your search.</p><button className="pill sm" onClick={() => { setQ(""); setCat("all"); setAvail(false); setTag(""); }}>Clear filters</button></div>}
      {groups.map(({ c, list }) => (
        <section key={c.id} aria-labelledby={`cat-${c.id}`} className="menusec">
          <h2 id={`cat-${c.id}`} className="serif">{c.name}</h2>
          <ul className="dishes">
            {list.map((i, n) => {
              const complex = i.variants.length > 0 || i.addOnGroups.length > 0;
              return (
                <li key={i.id} className={`dish ${!i.available ? "soldout" : ""} ${n === 0 ? "feature" : ""}`}>
                  <MediaSlot media={i.imageUrl ? { src: i.imageUrl, alt: i.imageAlt, width: 400, height: 400 } : null} label={i.name.toUpperCase()} shape="circle" className="dish-img" />
                  <div className="dish-body"><h3 className="serif">{i.name}</h3>{i.description && <p>{i.description}</p>}
                    <div className="dish-meta"><span className="price tab">{i.variants.length ? "From " : ""}{formatNaira(priceOf(i))}</span>{!i.available && <span className="tag dark">Sold out</span>}</div></div>
                  <button className="pill sm" disabled={!i.available} onClick={() => (complex ? setSel(i) : quick(i))} aria-label={i.available ? `${complex ? "Choose options for" : "Add"} ${i.name}` : `${i.name} is sold out`}>{!i.available ? "Sold out" : complex ? "Choose" : "Add to cart"}</button>
                </li>);
            })}
          </ul>
        </section>))}
      <ItemDialog item={sel} onClose={() => setSel(null)} maxQty={ordering.limits.maxQtyPerLine} />
    </>
  );
}
