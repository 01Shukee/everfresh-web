import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationView } from "@/components/voc/views";
import { getVocDeps } from "@/server/runtime";
import { ownerView } from "@/server/voc/applications";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function ApplicationPage({ params }: { params: Promise<{ ref: string; token: string }> }) {
  const { ref, token } = await params; const v = await ownerView(await getVocDeps(), ref, token); if (!v) notFound();
  return <ApplicationView v={v} refNo={ref} token={token} />;
}
