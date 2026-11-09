"use client";
import { useState } from "react";
import "@/components/voc/testimonials.css";

export interface TestimonialItem { id: string; quote: string; name: string; relation: string }

const LONG = 170; // messages longer than this get a "Read more" button

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function Comment({ t, tone }: { t: TestimonialItem; tone: number }) {
  const [open, setOpen] = useState(false);
  const long = t.quote.length > LONG;
  return (
    <li>
      <article className="tcm">
        <span className={`tcm-av tone${tone}`} aria-hidden="true">{initials(t.name)}</span>
        <div className="tcm-bubble">
          <header className="tcm-head"><b className="tcm-name">{t.name}</b>{t.relation && <span className="tcm-rel">{t.relation}</span>}</header>
          <p className={`tcm-text${long && !open ? " clamp" : ""}`} id={`tcm-home-${t.id}`}>{t.quote}</p>
          {long && <button type="button" className="tcm-more" aria-expanded={open} aria-controls={`tcm-home-${t.id}`} onClick={() => setOpen(!open)}>{open ? "Show less" : "Read more"}</button>}
        </div>
      </article>
    </li>
  );
}

/** Renders nothing until genuine, permissioned testimonials are published in the admin. */
export function Testimonials({ items }: { items: TestimonialItem[] }) {
  if (!items.length) return null;
  return (
    <section className="sec white" aria-labelledby="home-tm">
      <div className="wrap">
        <span className="lab green">In their words</span>
        <h2 id="home-tm" className="serif green">What our students say.</h2>
        <ul className="tcm-list">{items.map((t, n) => <Comment key={t.id} t={t} tone={n % 3} />)}</ul>
      </div>
    </section>
  );
}