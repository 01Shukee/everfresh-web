import type { Metadata } from "next";
import { RegularView } from "@/components/voc/views";
import { getContent } from "@/server/voc/applications";
import { getRepo } from "@/server/runtime";

export const metadata: Metadata = { title: "Regular Programme (3 years)", description: "The Everfresh Regular vocational programme runs for 3 years. See courses, requirements and how to apply." };
export const dynamic = "force-dynamic";
export default async function RegularPage() {
  const c = await getContent(await getRepo(), "regular-3y");
  return (
    <RegularView c={c} />
  );
}
