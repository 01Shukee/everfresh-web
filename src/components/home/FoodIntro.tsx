import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Ph } from "@/components/ui/Placeholder";
import type { HomeMenu } from "@/server/home";

/** Shows real menu items and prices from the database. Until the menu has items, clearly marked placeholders are shown instead. */
export function FoodIntro({ menu }: { menu: HomeMenu }) {
  const empty = menu.items.length === 0;
  return (
    <section className="sec dark food" aria-labelledby="hf">
      <div className="wrap">
        <span className="lab chipl">Order Food</span>
        <h2 id="hf" className="serif big">Hot, ripe, <span className="mk">just-made.</span></h2>
        <p className="panelp">Browse the menu, choose delivery or pickup, and order now or schedule for later.</p>
        <div className="chips">{menu.categories.length ? menu.categories.map((c) => <Link key={c} href="/order-food" className="chip">{c}</Link>) : [1, 2, 3, 4].map((n) => <span key={n} className="chip"><Ph k={`CATEGORY ${n}`} /></span>)}</div>
        <div className="band" tabIndex={0} role="region" aria-label="Menu highlights, scroll sideways">
          {empty
            ? Array.from({ length: 6 }, (_, n) => (<div className="plate" key={n}><MediaSlot label={`MENU ITEM ${n + 1}`} shape="circle" className="plate-img" /><div className="plate-cap"><span className="chip sm"><Ph k={`MENU ITEM ${n + 1}`} /></span></div></div>))
            : menu.items.map((it) => (<Link href="/order-food" className="plate" key={it.id}><MediaSlot media={it.imageUrl ? { src: it.imageUrl, alt: it.imageAlt, width: 400, height: 400 } : null} label={it.name.toUpperCase()} shape="circle" className="plate-img" /><div className="plate-cap"><span className="chip sm">{it.name}</span><span className="platep">{it.price}</span></div></Link>))}
        </div>
        <Button href="/order-food" tone="cream">Order now</Button>
      </div>
    </section>
  );
}
