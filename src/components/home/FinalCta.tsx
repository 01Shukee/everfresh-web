import Link from "next/link";
import { Ph } from "@/components/ui/Placeholder";

export function FinalCta({ whatsappDigits: wa }: { whatsappDigits: string | null }) {
  return (
    <section className="sec white" aria-label="Get started">
      <div className="wrap">
        <p className="cta serif"><span className="mk">I&rsquo;d like to</span> <Link href="/order-food">order food</Link>, <Link href="/vocational-studies">apply to study</Link> or <Link href="/event-catering">plan an event</Link>.</p>
        <p className="lab ctasub">Or message us on WhatsApp: {wa ? <a href={`https://wa.me/${wa}`} rel="noopener">+{wa}</a> : <Ph k="WHATSAPP NUMBER" />}</p>
      </div>
    </section>
  );
}
