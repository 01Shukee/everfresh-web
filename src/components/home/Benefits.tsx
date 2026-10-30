import { showPlaceholders } from "@/config/site";
import { Tag } from "@/components/ui/Tag";

/** Items are claims the business has confirmed (entered by staff in Admin > Website > Homepage). Nothing is invented here. */
export function Benefits({ items }: { items: string[] }) {
  if (!items.length && !showPlaceholders) return null;
  return (
    <section className="sec" aria-labelledby="hb">
      <div className="wrap">
        <span className="lab green">Why Everfresh</span>
        <h2 id="hb" className="serif green">What you can count on.</h2>
        <ul className="list">
          {items.length ? items.map((b) => <li className="bn" key={b}><span className="serif">{b}</span></li>) : [1, 2, 3, 4].map((n) => <li className="bn" key={n}><span className="serif">[BENEFIT {n}]</span><Tag>Unverified &middot; do not publish</Tag></li>)}
        </ul>
      </div>
    </section>
  );
}
