import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationView } from "@/components/voc/ApplicationView";
import { site } from "@/config/site";
import { getVocDeps } from "@/server/runtime";
import { formSummary } from "@/server/voc/form";
import { ownerViewGated } from "@/server/voc/gate";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function ApplicationPage({ params }: { params: Promise<{ ref: string; token: string }> }) {
  const { ref, token } = await params; const deps = await getVocDeps(); const v = await ownerViewGated(deps, ref, token); if (!v) notFound();
  const form = v.payment.status === "paid" ? await formSummary(deps.repo, ref) : null;
  return <ApplicationView v={v} refNo={ref} token={token} form={form} contact={String(site.contact.vocationalPhone ?? "") || null} />;
}