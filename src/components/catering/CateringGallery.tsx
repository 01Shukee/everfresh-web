"use client";
import { useState } from "react";
import { MediaSlot } from "@/components/ui/MediaSlot";
import type { GalleryItem } from "@/server/catering/model";

export function CateringGallery({ items }: { items: GalleryItem[] }) {
  const [k, setK] = useState("all"); const [n, setN] = useState(8); const all = items.filter((i) => k === "all" || i.kind === k); const shown = all.slice(0, n);
  return (
    <section id="gallery" className="sec" aria-labelledby="cg"><div className="wrap">
      <span className="lab green">Food and events</span><h2 id="cg" className="serif ital2">From our tables.</h2>
      <div className="filters" role="group" aria-label="Filter gallery">{[["all", "All"], ["food", "Food"], ["event", "Events"]].map(([id, name]) => <button key={id} className={k === id ? "chip on" : "chip"} aria-pressed={k === id} onClick={() => { setK(id); setN(8); }}>{name}</button>)}</div>
      {items.length === 0 ? <div className="cgal">{["FOOD", "EVENT", "FOOD", "EVENT", "FOOD"].map((x, n) => <figure key={n} className={`cg cg${n}`}><MediaSlot label={`${x} PHOTO`} shape="arch" className="cg-img" /></figure>)}</div>
        : all.length === 0 ? <div className="empty"><p className="serif empty-title">Nothing in this group yet.</p></div>
        : <ul className="cgal">{shown.map((i, x) => <li key={i.id} className={`cg cg${x % 5}`}><MediaSlot media={{ src: i.imageUrl, alt: i.imageAlt, width: 600, height: 760 }} label={i.title} shape="arch" className="cg-img" /><p className="lab">{i.kind === "food" ? "Food" : "Event"} &middot; {i.title}</p>{i.caption && <p className="small">{i.caption}</p>}</li>)}</ul>}
      {all.length > n && <div className="more"><p className="small dim0" role="status">Showing {shown.length} of {all.length}</p><button type="button" className="pill ghost" onClick={() => setN(n + 8)}>Show more photos</button></div>}
    </div></section>
  );
}
