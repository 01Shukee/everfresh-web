import type { Metadata } from "next";
import { RegularView } from "@/components/voc/views";
import { getContent } from "@/server/voc/applications";
import { publicVocationalSafe } from "@/server/voc/gate";
import { getRepo } from "@/server/runtime";

export const metadata: Metadata = { title: "Regular Programme (3 years)", description: "The Everfresh Regular vocational programme runs for 3 years. See courses, requirements and how to apply." };
export const dynamic = "force-dynamic";
export default async function RegularPage() {
  const repo = await getRepo(); const c = { ...(await getContent(repo, "regular-3y")), curriculum: [] };   // curriculum unlocks after the application-form fee
  const p = (await publicVocationalSafe(repo)).portfolio.find((i) => i.kind === "student");
  return <RegularView c={c} photo={p ? { src: p.imageUrl, alt: p.imageAlt } : null} />;
}