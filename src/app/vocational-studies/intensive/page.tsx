import type { Metadata } from "next";
import { IntensiveView } from "@/components/voc/views";
import { publicVocational } from "@/server/voc/admin";
import { getRepo } from "@/server/runtime";

export const metadata: Metadata = { title: "Intensive Programme (1 month to 1 year)", description: "Compare the 1-month, 3-month and 6-month Everfresh Intensive programmes and apply." };
export const dynamic = "force-dynamic";
export default async function IntensivePage() {
  const { content, portfolio } = await publicVocational(await getRepo());
  const p = portfolio.find((i) => i.kind === "project");
  return (
    <IntensiveView content={content} photo={p ? { src: p.imageUrl, alt: p.imageAlt } : null} />
  );
}
