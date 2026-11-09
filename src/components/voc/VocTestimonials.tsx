"use client";
import { useState } from "react";
import type { Testimonial } from "@/server/voc/model";
import "./testimonials.css";

const LONG = 170;   // messages longer than this get a "Read more" button

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** One comment. Defined outside VocTestimonials on purpose: a component defined inside another one is rebuilt on every render. */
function Comment({ t, tone }: { t: Testimonial; tone: number }) {
  const [open, setOpen] = useState(false);
  const long = t.quote.length > LONG;
  return (
    <li>
      <article className="tcm">
        <span className={`tcm-av tone${tone}`} aria-hidden="true">{initials(t.name)}</span>
        <div className="tcm-bubble">
          <header className="tcm-head"><b className="tcm-name">{t.name}</b>{t.relation && <span className="tcm-rel">{t.relation}</span>}</header>
          <p className={`tcm-text${long && !open ? " clamp" : ""}`} id={`tcm-${t.id}`}>{t.quote}</p>
          {long && <button type="button" className="tcm-more" aria-expanded={open} aria-controls={`tcm-${t.id}`} onClick={() => setOpen(!open)}>{open ? "Show less" : "Read more"}</button>}
        </div>
      </article>
    </li>
  );
}

/** Student and graduate testimonials, shown like comments. Only published testimonials with recorded permission reach this component. */
export function VocTestimonials({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;
  return (
    <section className="sec" aria-labelledby="htm"><div className="wrap">
      <span className="lab green">In their words</span>
      <h2 id="htm" className="serif green">What our students say.</h2>
      <ul className="tcm-list">{items.map((t, n) => <Comment key={t.id} t={t} tone={n % 3} />)}</ul>
    </div></section>
  );
}