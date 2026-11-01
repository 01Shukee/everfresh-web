"use client";
import Link from "next/link";
import { useState } from "react";
import { doors } from "@/content/home";
import { showPlaceholders } from "@/config/site";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Ring } from "@/components/ui/Ring";
import { Ph } from "@/components/ui/Placeholder";

const stage = {
  food: { cls: "hero-food", shape: "circle" as const, ring: 100, label: "HERO FOOD PHOTO", cap: "Food photo: bright natural light, overhead or 45\u00b0." },
  studies: { cls: "hero-studies", shape: "rect" as const, ring: 200, label: "HERO TRAINING PHOTO", cap: "Training photo: workshop in use." },
  catering: { cls: "hero-catering", shape: "arch" as const, ring: 280, label: "HERO EVENT PHOTO", cap: "Event photo: a laid table or live service." },
};

type HI = { url: string; alt: string } | null;
export function Hero({ contact, heroImages }: { contact: { hours: string[]; city: string | null }; heroImages: { food: HI; studies: HI; catering: HI } }) {
  const [i, setI] = useState(0);
  const d = doors[i], s = stage[d.key], hi = heroImages[d.key], m = hi ? { src: hi.url, alt: hi.alt, width: 800, height: s.shape === "circle" ? 800 : 1000 } : null;
  return (
    <section className="wrap hero" aria-labelledby="h1">
      <div className="rise">
        <span className="lab green">Opening hours <Ph k="HOURS" value={contact.hours[0] ?? null} /> &middot; <Ph k="CITY" value={contact.city} /></span>
        <h1 id="h1" className="serif">Everyday food, <em>made fresh.</em></h1>
        <p className="lede">Order a meal, learn a craft, or plan an event. Pick a door.</p>
        <ul className="doors">
          {doors.map((x, n) => (
            <li key={x.key}>
              <Link href={x.href} className={n === i ? "door on" : "door"} onMouseEnter={() => setI(n)} onFocus={() => setI(n)}>
                <span className="serif lab green">0{n + 1}</span>
                <span><b className="serif">{x.title}</b><span className="d">{x.desc}</span></span>
                <span className="dot" aria-hidden="true">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="tagline serif">Always Fresh&hellip;</p>
      </div>
      <div className="stage" aria-live="polite">
        <div key={d.key} className="rise">
          <Ring rotate={s.ring} />
          <MediaSlot media={m} label={s.label} shape={s.shape} className={s.cls} priority />
          {!m && showPlaceholders && <span className="cap">{s.cap} Genuine Everfresh photo needed.</span>}
        </div>
      </div>
    </section>
  );
}
