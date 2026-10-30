import type { Metadata } from "next";
import { IntensiveView } from "@/components/voc/views";
import { publicVocational } from "@/server/voc/admin";
import { getRepo } from "@/server/runtime";

export const metadata: Metadata = { title: "Intensive Programme (1, 3 or 6 months)", description: "Compare the 1-month, 3-month and 6-month Everfresh Intensive programmes and apply." };
export const dynamic = "force-dynamic";
export default async function IntensivePage() {
  const { content } = await publicVocational(await getRepo());
  return (
    <IntensiveView content={content} />
  );
}
