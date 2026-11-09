import type { Metadata } from "next";
import { VocLandingView } from "@/components/voc/views";
import { getRepo } from "@/server/runtime";
import { publicVocationalSafe } from "@/server/voc/gate";

export const metadata: Metadata = { title: "Vocational Studies", description: "Explore Everfresh vocational training programmes, practical work and how to apply." };
export const dynamic = "force-dynamic";

export default async function VocationalPage() {
  const pub = await publicVocationalSafe(await getRepo());
  return <VocLandingView pub={pub} />;
}