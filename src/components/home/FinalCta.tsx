import Link from "next/link";
import { site } from "@/config/site";
import { waHref } from "@/lib/contact";

export function FinalCta() {
  return (
    <section className="sec white" aria-label="Get started">
      <div className="wrap">
        <p className="cta serif">
          <span className="mk">I&rsquo;d like to</span>{" "}
          <Link href="/order-food">order food</Link>,{" "}
          <Link href="/vocational-studies">apply to study</Link> or{" "}
          <Link href="/event-catering">plan an event</Link>.
        </p>

        <p className="lab ctasub">
          Contact us on WhatsApp:
        </p>

        <p className="ctasub">
          <strong>Everfresh Creations:</strong>{" "}
          <a
            href={waHref(site.contact.whatsappDigits!)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {site.contact.phone}
          </a>
        </p>

        <p className="ctasub">
          <strong>Vocational Institute:</strong>{" "}
          <a
            href={waHref(site.contact.vocationalWhatsappDigits!)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {site.contact.vocationalPhone}
          </a>
        </p>
      </div>
    </section>
  );
}