"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNaira } from "@/lib/money";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { useCart } from "./CartProvider";
import { Stepper } from "./Stepper";
import type { PublicItem } from "./types";

export function ItemDialog({ item, onClose, maxQty }: { item: PublicItem | null; onClose: () => void; maxQty: number }) {
  const ref = useRef<HTMLDialogElement>(null); const { add, setOpen } = useCart();
  const [variant, setVariant] = useState<string | null>(null); const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1); const [note, setNote] = useState("");
  useEffect(() => { const d = ref.current; if (!d) return; if (item && !d.open) { setVariant(null); setPicked({}); setQty(1); setNote(""); d.showModal(); } if (!item && d.open) d.close(); }, [item]);

  const problems = useMemo(() => {
    if (!item) return [] as string[]; const p: string[] = [];
    if (item.variants.length && !variant) p.push("Choose a size.");
    for (const g of item.addOnGroups) { const n = (picked[g.id] ?? []).length; if (n < g.min) p.push(`Choose ${g.min > 1 ? `at least ${g.min}` : "one"} for ${g.name}.`); }
    return p;
  }, [item, variant, picked]);
  if (!item) return <dialog ref={ref} className="itemdlg" />;

  const addOnIds = Object.values(picked).flat();
  const base = item.variants.length ? item.variants.find((v) => v.id === variant)?.priceKobo ?? 0 : item.basePriceKobo;
  const extras = item.addOnGroups.flatMap((g) => g.options).filter((o) => addOnIds.includes(o.id)).reduce((s, o) => s + o.priceKobo, 0);
  const unit = base + extras;
  const toggle = (gid: string, oid: string, max: number) => setPicked((p) => {
    const cur = p[gid] ?? []; if (cur.includes(oid)) return { ...p, [gid]: cur.filter((x) => x !== oid) };
    return { ...p, [gid]: max === 1 ? [oid] : cur.length < max ? [...cur, oid] : cur };
  });
  const submit = () => {
    if (problems.length) return;
    const names = item.addOnGroups.flatMap((g) => g.options).filter((o) => addOnIds.includes(o.id)).map((o) => o.name);
    const vname = item.variants.find((v) => v.id === variant)?.name;
    add({ itemId: item.id, variantId: variant, addOnIds, qty, note: note.trim(), name: item.name, label: [vname, ...names].filter(Boolean).join(" · ") || "Standard", estKobo: unit });
    onClose();
    // Phones: the floating cart bar confirms the add, so go back to the menu. Larger screens keep opening the cart.
    if (!window.matchMedia("(max-width: 720px)").matches) setOpen(true);
  };
  return (
    <dialog ref={ref} className="itemdlg" aria-labelledby="item-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <button type="button" className="dlg-x" onClick={onClose} aria-label="Close">&times;</button>
      <div className="itemdlg-in">
        <MediaSlot media={item.imageUrl ? { src: item.imageUrl, alt: item.imageAlt, width: 600, height: 600 } : null} label={item.name.toUpperCase()} shape="circle" className="dlg-img" />
        <div>
          <h2 id="item-title" className="serif">{item.name}</h2><p>{item.description}</p>
          {item.variants.length > 0 && <fieldset><legend className="lab">Size</legend><div className="opts">{item.variants.map((v) => (
            <label key={v.id} className={`opt ${variant === v.id ? "on" : ""}`}><input type="radio" name="size" checked={variant === v.id} onChange={() => setVariant(v.id)} />{v.name}<span className="tab">{formatNaira(v.priceKobo)}</span></label>))}</div></fieldset>}
          {item.addOnGroups.map((g) => { const n = (picked[g.id] ?? []).length; return (
            <fieldset key={g.id}><legend className="lab">{g.name} <span className="dim0">({g.min ? `choose ${g.min === g.max ? g.min : `${g.min} to ${g.max}`}` : `optional, up to ${g.max}`})</span></legend>
              <div className="opts">{g.options.map((o) => { const on = (picked[g.id] ?? []).includes(o.id); const lock = !on && g.max > 1 && n >= g.max; return (
                <label key={o.id} className={`opt ${on ? "on" : ""} ${!o.available || lock ? "off" : ""}`}><input type={g.max === 1 ? "radio" : "checkbox"} name={g.id} checked={on} disabled={!o.available || lock} onChange={() => toggle(g.id, o.id, g.max)} onClick={() => { if (g.max === 1 && on && g.min === 0) toggle(g.id, o.id, 1); }} />
                  {o.name}{!o.available && " (unavailable)"}<span className="tab">{o.priceKobo ? `+${formatNaira(o.priceKobo)}` : "Free"}</span></label>); })}</div></fieldset>); })}
          <label className="field"><span className="lab">Note for the kitchen (optional)</span><input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="dlg-foot"><Stepper value={qty} onChange={setQty} max={maxQty} label="quantity" />
            <button className="pill" onClick={submit} disabled={problems.length > 0}>{problems.length > 0 ? problems[0].replace(/\.$/, "") : `Add to cart · ${formatNaira(unit * qty)}`}</button></div>
          {problems.length > 0 && <p className="hint" role="status">{problems[0]}</p>}
          <button className="linkbtn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </dialog>
  );
}
