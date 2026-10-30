import type { Metadata } from "next";
import { QuoteForm } from "@/components/catering/QuoteForm";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { publicCatering } from "@/server/catering/service";

export const metadata: Metadata = { title: "Request a Catering Quote", description: "Tell us about your event and request a catering quotation from Everfresh." };
export const dynamic = "force-dynamic";
export default async function QuotePage() {
  const p = await publicCatering(await getRepo(), await whatsappDigitsFor(await getRepo()));
  return <section className="wrap sec"><span className="lab green">Event Catering</span><h1 className="serif page-title">Request a catering quote.</h1><QuoteForm categories={p.categories.map((c) => c.name)} styles={p.styles} /></section>;
}
