import Link from "next/link";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Button } from "@/components/ui/Button";
import { Tbc } from "@/components/voc/Bits";
import type { SiteSettings } from "@/server/site/settings";
import { ContactForm } from "./ContactForm";

const Block = ({ title, text, href, cta }: { title: string; text: string | null; href: string; cta: string }) => (
  <article className="abox"><h3 className="serif">{title}</h3><p>{text ?? <Tbc what={`${title} information`} />}</p><Button href={href} tone="ghost" small>{cta}</Button></article>);

export function AboutView({ s }: { s: SiteSettings }) {
  const a = s.about;
  return (
    <>
      <section className="vhero gridbg"><div className="wrap">
        <span className="lab green">About Us</span>
        <h1 className="serif page-title big2">About <em>{s.business.name}.</em></h1>
        <p className="lede">{a.intro ?? s.business.description ?? <Tbc what="Business introduction" />}</p>
      </div></section>
      <section className="sec" aria-labelledby="am"><div className="wrap grid2">
        <div><span className="lab green">Our mission and values</span><h2 id="am" className="serif green">What we stand for.</h2>{a.mission ? <p className="measure">{a.mission}</p> : <p><Tbc what="Mission" /></p>}</div>
        <ul className="list">{a.values.length ? a.values.map((v) => <li className="bn" key={v}><span className="serif">{v}</span></li>) : <li className="bn"><Tbc what="Values" /></li>}</ul>
      </div></section>
      {(a.history || true) && <section className="sec white" aria-labelledby="ah"><div className="wrap"><span className="lab green">Our history</span><h2 id="ah" className="serif ital2">How we got here.</h2>{a.history ? <p className="measure prewrap">{a.history}</p> : <p><Tbc what="Confirmed business history" /></p>}</div></section>}
      <section className="sec" aria-labelledby="as"><div className="wrap"><span className="lab green">What we do</span><h2 id="as" className="serif green">Three ways we serve you.</h2>
        <div className="aboxes"><Block title="Food ordering" text={a.foodInfo} href="/order-food" cta="Order food" /><Block title="Vocational training" text={a.vocationalInfo} href="/vocational-studies" cta="Explore programmes" /><Block title="Event catering" text={a.cateringInfo} href="/event-catering" cta="Request a quote" /></div></div></section>
      {a.credentials.length > 0 && <section className="sec white" aria-labelledby="ac"><div className="wrap"><span className="lab green">Credentials</span><h2 id="ac" className="serif green">Confirmed credentials.</h2><ul className="list">{a.credentials.map((c) => <li className="bn" key={c}><span className="serif">{c}</span></li>)}</ul></div></section>}
      <section className="sec" aria-labelledby="ap"><div className="wrap"><span className="lab green">In pictures</span><h2 id="ap" className="serif ital2">Our kitchen, our people, our work.</h2>
        <ul className="cgal">{a.photos.length ? a.photos.map((p, n) => <li key={p.id} className={`cg cg${n % 5}`}><MediaSlot media={{ src: p.url, alt: p.alt, width: 600, height: 760 }} label={p.alt} shape="arch" className="cg-img" />{p.caption && <p className="small">{p.caption}</p>}</li>) : [0, 1, 2].map((n) => <li key={n} className={`cg cg${n}`}><MediaSlot label="GENUINE PHOTO" shape="arch" className="cg-img" /></li>)}</ul></div></section>
    </>
  );
}

export function ContactView({ s, whatsapp }: { s: SiteSettings; whatsapp: string | null }) {
  const c = s.contact; const tel = c.phone?.replace(/[^\d+]/g, ""); const faqs = s.faqs.filter((f) => f.published).sort((a, b) => a.sort - b.sort);
  return (
    <>
      <section className="vhero gridbg"><div className="wrap"><span className="lab green">Contact Us</span><h1 className="serif page-title big2">Let&rsquo;s <em>talk.</em></h1><p className="lede">Reach us by phone, WhatsApp or the form below.</p></div></section>
      <section className="sec" aria-labelledby="cd"><div className="wrap cgrid">
        <div>
          <h2 id="cd" className="serif green">Get in touch</h2>
          <dl className="dl crows">
            <dt>Phone</dt><dd>{c.phone ? <a href={`tel:${tel}`}>{c.phone}</a> : <Tbc what="Phone" />}</dd>
            <dt>WhatsApp</dt><dd>{whatsapp ? <a href={`https://wa.me/${whatsapp}`} rel="noopener" target="_blank">Chat on WhatsApp (+{whatsapp})</a> : <Tbc what="WhatsApp number" />}</dd>
            <dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <Tbc what="Email" />}</dd>
            <dt>Address</dt><dd>{c.address ? <>{c.address}{c.city ? `, ${c.city}` : ""}{c.mapConfirmed && <><br /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} rel="noopener" target="_blank">View on map</a></>}</> : <Tbc what="Address" />}</dd>
            <dt>Opening hours</dt><dd>{c.hours.length ? c.hours.map((h) => <span key={h} className="block">{h}</span>) : <Tbc what="Opening hours" />}</dd>
            {c.social.length > 0 && <><dt>Follow us</dt><dd>{c.social.map((x) => <a key={x.url} href={x.url} rel="noopener" className="block">{x.label}</a>)}</dd></>}
          </dl>
          <p className="small dim0">Ordering food, applying to study or planning an event? Use <Link href="/order-food">Order Food</Link>, <Link href="/apply">Apply</Link> or <Link href="/event-catering#quote">Request a Quote</Link>.</p>
        </div>
        <div><h2 className="serif green">Send us a message</h2><ContactForm /></div>
      </div></section>
      {faqs.length > 0 && <section className="sec white" aria-labelledby="cf"><div className="wrap"><span className="lab green">FAQs</span><h2 id="cf" className="serif ital2">Common questions.</h2><div className="faqs">{faqs.map((f) => <details key={f.id}><summary className="serif">{f.q}</summary><p className="prewrap">{f.a}</p></details>)}</div></div></section>}
    </>
  );
}
