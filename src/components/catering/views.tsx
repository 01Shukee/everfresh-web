import Link from "next/link";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Ring } from "@/components/ui/Ring";
import { Tbc } from "@/components/voc/Bits";
import type { publicCatering } from "@/server/catering/service";
import { CateringGallery } from "./CateringGallery";
import { QuoteForm } from "./QuoteForm";

export type CatPub = Awaited<ReturnType<typeof publicCatering>>;

export function CateringLandingView({ pub }: { pub: CatPub }) {
  const imgs = pub.gallery.slice(0, 3);
  return (
    <>
      <section className="chero" aria-labelledby="ch1"><div className="wrap chero-in">
        <div className="chero-copy rise">
          <span className="lab green">Event Catering</span>
          <h1 id="ch1" className="serif">Exceptional Catering for <em>Every Occasion.</em></h1>
          <p className="lede">Tell us about your event, your guests, and your catering needs. We will use your information to prepare a suitable quotation.</p>
          <Link href="#quote" className="pill">Request a Catering Quote <span className="dot" aria-hidden="true">&rarr;</span></Link>
        </div>
        <div className="cframe" aria-label="Catering photography"><Ring rotate={280} />
          {[0, 1, 2].map((n) => <figure key={n} className={`cf cf${n}`}><MediaSlot media={imgs[n] ? { src: imgs[n].imageUrl, alt: imgs[n].imageAlt, width: 600, height: 760 } : null} label={n === 1 ? "EVENT PHOTO" : "FOOD PHOTO"} shape="arch" className="cf-img" priority={n === 0} /></figure>)}</div>
      </div></section>
      <CateringGallery items={pub.gallery} />
      <section className="sec white" aria-labelledby="cc"><div className="wrap">
        <span className="lab green">Events we cater</span><h2 id="cc" className="serif ital2">The occasions we serve.</h2>
        {pub.categories.length ? <ul className="ccats">{pub.categories.map((c) => <li key={c.id} className="ccat"><h3 className="serif">{c.name}</h3>{c.description && <p>{c.description}</p>}</li>)}</ul> : <p><Tbc what="Event categories" /></p>}
      </div></section>
      <section className="sec" aria-labelledby="cs"><div className="wrap grid2">
        <div><span className="lab green">Our catering services</span><h2 id="cs" className="serif ital2">What we provide.</h2></div>
        <ul className="list">{pub.services.length ? pub.services.map((s) => <li className="bn svc" key={s.id}><span className="serif">{s.name}</span><span className="small">{s.description}</span></li>) : <li className="bn"><Tbc what="Catering services" /></li>}</ul>
      </div></section>
      <section className="sec white" aria-labelledby="hw3"><div className="wrap"><span className="lab green">How it works</span><h2 id="hw3" className="serif ital2">Three simple steps.</h2>
        <ol className="beats"><li><b className="serif">1</b><span>Tell us about your event: date, place, guests and what you need.</span></li><li><b className="serif">2</b><span>Your request is saved and opens in WhatsApp. Press Send so it reaches us.</span></li><li><b className="serif">3</b><span>We use your information to prepare a suitable quotation.</span></li></ol></div></section>
      <section id="quote" className="sec chero" aria-labelledby="hq"><div className="wrap qwrap"><div><span className="lab green">Request a quote</span><h2 id="hq" className="serif ital2">Tell us about your event.</h2>
        {!pub.whatsappConfigured && <p className="alert" role="note">WhatsApp isn&rsquo;t configured on this site yet. You can still save your request.</p>}</div>
        <QuoteForm categories={pub.categories.map((c) => c.name)} styles={pub.styles} /></div></section>
    </>
  );
}
