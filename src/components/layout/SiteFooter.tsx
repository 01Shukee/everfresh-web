import Link from "next/link";
import { nav, showPlaceholders, site } from "@/config/site";
import type { SiteSettings } from "@/server/site/settings";
import { EverfreshLocationMap } from "@/components/site/EverfreshLocationMap";
import { telHref, waHref } from "@/lib/contact";

export function SiteFooter({
  s,
}: {
  s: Pick<SiteSettings, "business" | "contact" | "brand">;
  whatsapp?: string | null;
}) {
  const c = s.contact;
  const place = [c.address, c.city].filter(Boolean).join(", ");
  const year = new Date().getFullYear();
  const about =
    s.business.description ??
    `Order food, study a vocational programme, or plan an event with ${s.business.name}.`;

  return (
    <footer className="foot dark" id="contact-details" aria-label="Site footer">
      <div className="wrap">
        <div className="fg">
          <div className="fbrand">
            <div className="logo panel">
              <img
                className="mark"
                src={s.brand.emblemUrl ?? "/brand/everfresh-emblem-reference.jpg"}
                alt=""
                width={40}
                height={40}
              />
              <span className="serif wm">{s.business.name}</span>
            </div>

            <p className="fabout">{about}</p>

            <div className="fcta">
              <a className="pill cream sm" href={telHref(site.contact.phone!)}>
                Call Everfresh
              </a>
              <a
                className="pill cream sm"
                href={waHref(site.contact.whatsappDigits!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp Everfresh
              </a>
            </div>

            {!s.brand.emblemUrl && showPlaceholders && (
              <p className="small">
                Temporary logo from the supplied reference image. Vector
                artwork needed.
              </p>
            )}
          </div>

          <nav className="fcol" aria-label="Our services">
            <b className="lab">Our services</b>
            {nav.slice(1, 4).map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
            <Link href="/apply">Apply to study</Link>
            <Link href="/event-catering#quote">Request a catering quote</Link>
          </nav>

          <nav className="fcol" aria-label="Customer information">
            <b className="lab">Customer information</b>
            <Link href="/about">About Us</Link>
            <Link href="/contact">Contact Us and FAQs</Link>
            <Link href="/recover">Find my order or application</Link>
            <Link href="/order-food">Menu and online ordering</Link>
          </nav>

          <address className="fcol fcontact">
            <b className="lab">Contact</b>

            <span className="line">
              <span className="k">Everfresh Creations — Food and Catering</span>
              <a href={telHref(site.contact.phone!)}>
                {site.contact.phone}
              </a>
              <a
                href={waHref(site.contact.whatsappDigits!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp: {site.contact.phone}
              </a>
            </span>

            <span className="line">
              <span className="k">Everfresh Vocational Institute</span>
              <a href={telHref(site.contact.vocationalPhone!)}>
                {site.contact.vocationalPhone}
              </a>
              <a
                href={waHref(site.contact.vocationalWhatsappDigits!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp: {site.contact.vocationalPhone}
              </a>
            </span>

            <span className="line">
              <span className="k">Email</span>
              <a href={`mailto:${site.contact.email}`}>
                {site.contact.email}
              </a>
            </span>

            {place && (
              <span className="line">
                <span className="k">Address</span>
                {place}
                {c.mapConfirmed && c.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on map
                  </a>
                )}
              </span>
            )}

            {c.hours.length > 0 && (
              <span className="line">
                <span className="k">Opening hours</span>
                {c.hours.map((h) => (
                  <span key={h} className="block">
                    {h}
                  </span>
                ))}
              </span>
            )}

            {c.social.length > 0 && (
              <span className="line">
                <span className="k">Follow us</span>
                <span className="fsocial">
                  {c.social.map((x) => (
                    <a
                      key={x.url}
                      href={x.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {x.label}
                    </a>
                  ))}
                </span>
              </span>
            )}
          </address>
        </div>

        <div className="foot-map">
          <EverfreshLocationMap compact />
        </div>

        <div className="signoff">
          <span className="tagline serif">{s.business.tagline}</span>
          <span className="small">
            &copy; {year} {s.business.legalName}. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}