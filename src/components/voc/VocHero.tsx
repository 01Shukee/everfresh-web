import Link from "next/link";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Ring } from "@/components/ui/Ring";
import { Tag } from "@/components/ui/Tag";
import type { PortfolioItem } from "@/server/voc/model";

export function VocHero({ items }: { items: PortfolioItem[] }) {
  const pick = (k: PortfolioItem["kind"][]) => items.find((i) => k.includes(i.kind));
  const tiles = [{ it: pick(["project"]), label: "COMPLETED PROJECT", cap: "Completed project" }, { it: pick(["instructor"]), label: "INSTRUCTOR DEMONSTRATION", cap: "Instructor demonstration" }, { it: pick(["facility", "student"]), label: "TRAINING FACILITY", cap: "Training facility" }];
  return (
    <section className="vhero gridbg" aria-labelledby="vh">
      <div className="wrap vhero-in">
        <div className="rise">
          <span className="lab green">Vocational Studies</span>
          <h1 id="vh" className="serif">Turn Your Passion into a <em>Practical Skill.</em></h1>
          <p className="lede">Explore our vocational training programmes, see our practical work, and find the learning pathway that suits your goals.</p>
          <div className="acts"><Link href="#programmes" className="pill">Explore Programmes <span className="dot" aria-hidden="true">&rarr;</span></Link><Link href="#work" className="pill ghost">View Our Work</Link></div>
        </div>
        <div className="vmosaic" aria-label="Training photography">
          <Ring rotate={200} />
          {tiles.map((t, n) => (
            <figure key={n} className={`vt vt${n}`}>
              <MediaSlot media={t.it ? { src: t.it.imageUrl, alt: t.it.imageAlt, width: 600, height: 700 } : null} label={t.label} className="vt-img" priority={n === 0} />
              <figcaption><Tag>{t.it ? t.it.title : t.cap}</Tag></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
