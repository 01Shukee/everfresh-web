import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CartProvider } from "@/components/order/CartProvider";
import { CartDrawer } from "@/components/order/CartDrawer";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { getSettings } from "@/server/site/settings";
import "./globals.css";
import "./footer.css";

// latin-ext and vietnamese subsets cover the Naira sign and Igbo dot-below letters; verify with the Type check page in the design preview and in generated PDFs.
const display = Fraunces({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-display", display: "swap", axes: ["opsz"] });
const body = Nunito_Sans({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-body", display: "swap" });

export const dynamic = "force-dynamic";
/** Organisation data from confirmed settings only (address is included only when supplied). "<" is escaped so content can never close the script tag. */
function jsonLd(s: Awaited<ReturnType<typeof getSettings>>) {
  const o: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Organization", name: s.business.name, legalName: s.business.legalName };
  if (s.contact.phone) o.telephone = s.contact.phone; if (s.contact.email) o.email = s.contact.email;
  if (s.contact.address) o.address = { "@type": "PostalAddress", streetAddress: s.contact.address, addressLocality: s.contact.city ?? undefined };
  if (s.contact.social.length) o.sameAs = s.contact.social.map((x) => x.url);
  return JSON.stringify(o).replace(/</g, "\\u003c");
}
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "Everfresh | Everyday food, made fresh", template: "%s | Everfresh" },
  description: "Order food, study a vocational programme, or plan an event with Everfresh.",
  openGraph: { type: "website", siteName: "Everfresh", title: "Everfresh | Everyday food, made fresh", description: "Order food, study a vocational programme, or plan an event with Everfresh." },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepo(); const [s, whatsapp] = await Promise.all([getSettings(repo), whatsappDigitsFor(repo)]);
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />
        <a href="#main" className="skip">Skip to content</a>
        <CartProvider>
          <SiteHeader brand={{ name: s.business.name, emblemUrl: s.brand.emblemUrl }} />
          <main id="main">{children}</main>
          <SiteFooter s={s} whatsapp={whatsapp} />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}