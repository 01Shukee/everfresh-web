export interface TestimonialItem { id: string; quote: string; name: string; relation: string }
/** Renders nothing until genuine, permissioned testimonials are published in the admin. */
export function Testimonials({ items }: { items: TestimonialItem[] }) {
  if (!items.length) return null;
  return (
    <section className="sec white" aria-label="Testimonials">
      <div className="wrap">{items.map((t) => (<figure key={t.id} className="quote"><blockquote className="serif">&ldquo;{t.quote}&rdquo;</blockquote><figcaption className="lab">{t.name}{t.relation ? ` · ${t.relation}` : ""}</figcaption></figure>))}</div>
    </section>
  );
}
