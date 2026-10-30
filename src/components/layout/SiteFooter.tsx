import Link from "next/link";
import { nav } from "@/config/site";
import { Ph } from "@/components/ui/Placeholder";
import type { SiteSettings } from "@/server/site/settings";

export function SiteFooter({ s }: { s: Pick<SiteSettings, "business" | "contact" | "brand"> }) {
  const c = s.contact;
  return (
    <footer className="foot dark" id="contact-details">
      <div className="wrap">
        <div className="fg">
          <div>
            <div className="logo panel"><img className="mark" src={s.brand.emblemUrl ?? "/brand/everfresh-emblem-reference.jpg"} alt="" width={40} height={40} /><span className="serif wm">{s.business.name}</span></div>
            {!s.brand.emblemUrl && <p className="small">Temporary logo from the supplied reference image. Vector artwork needed.</p>}
          </div>
          <div><b className="lab">Services</b>{nav.slice(1, 4).map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}</div>
          <div><b className="lab">Company</b><Link href="/about">About Us</Link><Link href="/contact">Contact Us</Link><Link href="/recover">Find my order or application</Link></div>
          <div>
            <b className="lab">Contact</b>
            <span className="line"><Ph k="ADDRESS" value={c.address} /></span>
            <span className="line">{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : <Ph k="PHONE" />} &middot; {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <Ph k="EMAIL" />}</span>
            <span className="line">{c.hours.length ? c.hours.map((h) => <span key={h} className="block">{h}</span>) : <Ph k="OPENING HOURS" />}</span>
            <span className="line">{c.social.length ? c.social.map((x) => <a key={x.url} href={x.url} rel="noopener">{x.label}</a>) : <Ph k="SOCIAL LINKS" />}</span>
          </div>
        </div>
        <p className="signoff"><span className="tagline serif">{s.business.tagline}</span><span className="small">&copy; {s.business.legalName}</span></p>
      </div>
    </footer>
  );
}
