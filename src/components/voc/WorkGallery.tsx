"use client";
import { useState } from "react";
import { MediaSlot } from "@/components/ui/MediaSlot";
import type { PortfolioItem } from "@/server/voc/model";

const KINDS = [["all", "All"], ["project", "Completed projects"], ["student", "Student work"], ["instructor", "Instructor demonstrations"], ["facility", "Training facilities"]] as const;
export function WorkGallery({ items }: { items: PortfolioItem[] }) {
  const [k, setK] = useState<string>("all"); const [n, setN] = useState(8); const all = items.filter((i) => k === "all" || i.kind === k); const shown = all.slice(0, n);
  return (
    <section id="work" className="sec gridbg" aria-labelledby="hw2"><div className="wrap">
      <span className="lab green">Our work</span><h2 id="hw2" className="serif green">Made by hand, shown in full.</h2>
      <div className="filters" role="group" aria-label="Filter gallery">{KINDS.map(([id, name]) => <button key={id} className={k === id ? "chip on" : "chip"} aria-pressed={k === id} onClick={() => { setK(id); setN(8); }}>{name}</button>)}</div>
      {items.length === 0 ? (
        <div className="gal">{KINDS.slice(1).flatMap(([id, name]) => [0, 1].map((n) => <figure key={id + n} className="gi"><MediaSlot label={name.toUpperCase()} className="gal-img" /><figcaption className="lab">{name} &middot; [CAPTION]</figcaption></figure>))}</div>
      ) : all.length === 0 ? <div className="empty"><p className="serif empty-title">Nothing in this group yet.</p></div> : (
        <ul className="gal">{shown.map((i) => <li key={i.id} className="gi"><MediaSlot media={{ src: i.imageUrl, alt: i.imageAlt, width: 600, height: 450 }} label={i.title} className="gal-img" /><p className="lab">{KINDS.find(([id]) => id === i.kind)![1]}</p><p><b>{i.title}</b>{i.caption ? ` · ${i.caption}` : ""}</p></li>)}</ul>
      )}
      {all.length > n && <div className="more"><p className="small dim0" role="status">Showing {shown.length} of {all.length}</p><button type="button" className="pill ghost" onClick={() => setN(n + 8)}>Show more photos</button></div>}
    </div></section>
  );
}
