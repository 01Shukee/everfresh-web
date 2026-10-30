import { showPlaceholders } from "@/config/site";
import { Tag } from "@/components/ui/Tag";
import type { Testimonial, VariantContent } from "@/server/voc/model";

export function VocBenefits({ content }: { content: Record<string, VariantContent> }) {
  const all = [...new Set(Object.values(content).filter((c) => c.published).flatMap((c) => c.benefits))];
  if (!all.length && !showPlaceholders) return null;
  return (
    <section className="sec" aria-labelledby="hb2"><div className="wrap"><span className="lab green">Programme benefits</span><h2 id="hb2" className="serif green">What you gain.</h2>
      <ul className="list">{all.length ? all.map((b) => <li className="bn" key={b}><span className="serif">{b}</span></li>) : [1, 2, 3].map((n) => <li className="bn" key={n}><span className="serif">[BENEFIT {n}]</span><Tag>Unverified &middot; do not publish</Tag></li>)}</ul></div></section>
  );
}
export function VocTestimonials({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;
  return <section className="sec white" aria-label="Testimonials"><div className="wrap">{items.map((t) => <figure key={t.id} className="quote"><blockquote className="serif">&ldquo;{t.quote}&rdquo;</blockquote><figcaption className="lab">{t.name}{t.relation ? ` · ${t.relation}` : ""}</figcaption></figure>)}</div></section>;
}
