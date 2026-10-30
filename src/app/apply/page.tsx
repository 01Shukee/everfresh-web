import type { Metadata } from "next";
import { ApplyWizard } from "@/components/voc/ApplyWizard";
import { VARIANTS } from "@/config/vocational";
import { loadOptions } from "@/server/voc/options";

export const metadata: Metadata = { title: "Apply", description: "Apply for an Everfresh vocational programme.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const sp = await searchParams; const variant = VARIANTS.find((v) => v.id === sp.variant)?.id ?? null;
  return <section className="wrap sec"><span className="lab green">Apply</span><h1 className="serif page-title">Start your application.</h1><ApplyWizard options={await loadOptions()} initialVariant={variant} /></section>;
}
