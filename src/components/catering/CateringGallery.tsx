"use client";
import { useState } from "react";
import { MediaSlot } from "@/components/ui/MediaSlot";
import type { GalleryItem } from "@/server/catering/model";

export function CateringGallery({ items }: { items: GalleryItem[] }) {
  const [k, setK] = useState("all"); const shown = items.filter((i) => k === "all" || i.kind === k);
  return (
    <section id="gallery" className="sec" aria-labelledby="cg"><div className="wrap">
      <span className="lab green">Food and events</span><h2 id="cg" className="serif ital2">From our tables.</h2>
      <div className="filters" role="group" aria-label="Filter gallery">{[["all", "All"], ["food", "Food"], ["event", "Events"]].map(([id, n]) => <button key={id} className={k === id ? "chip on" : "chip"} aria-pressed={k === id} onClick={() => setK(id)}>{n}</button>)}</div>
      {items.length === 0 ? <div className="cgal">{["FOOD", "EVENT", "FOOD", "EVENT", "FOOD"].map((x, n) => <figure key={n} className={`cg cg${n}`}><MediaSlot label={`${x} PHOTO`} shape="arch" className="cg-img" /></figure>)}</div>
        : shown.length === 0 ? <div className="empty"><p className="serif empty-title">Nothing in this group yet.</p></div>
        : <ul className="cgal">{shown.map((i, n) => <li key={i.id} className={`cg cg${n % 5}`}><MediaSlot media={{ src: i.imageUrl, alt: i.imageAlt, width: 600, height: 760 }} label={i.title} shape="arch" className="cg-img" /><p className="lab">{i.kind === "food" ? "Food" : "Event"} &middot; {i.title}</p>{i.caption && <p className="small">{i.caption}</p>}</li>)}</ul>}
    </div></section>
  );
}
