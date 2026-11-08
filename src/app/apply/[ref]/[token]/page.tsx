import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplyWizard } from "@/components/voc/ApplyWizard";
import { getVocDeps } from "@/server/runtime";
import { ownerView } from "@/server/voc/applications";
import { loadOptions } from "@/server/voc/options";

export const metadata: Metadata = { title: "Edit application", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function EditApplication({ params }: { params: Promise<{ ref: string; token: string }> }) {
  const { ref, token } = await params; const v = await ownerView(await getVocDeps(), ref, token); if (!v) notFound();
  if (!["draft", "awaiting_payment"].includes(v.status) || v.payment.status === "paid") notFound();
  const d = v.details;
  return <section className="wrap sec"><span className="lab green">Application {v.ref}</span><h1 className="serif page-title">Correct your details.</h1>
    <ApplyWizard options={await loadOptions()} initialVariant={v.variantId} resume={{ ref, token }} initial={{ variantId: v.variantId, course: v.course, courses: v.courses, accommodation: v.accommodation, details: { fullName: d.fullName, phone: d.phone, email: d.email, dob: d.dob ?? "", address: d.address, education: d.education ?? "", emergencyName: d.emergencyName ?? "", emergencyPhone: d.emergencyPhone ?? "", additional: d.additional ?? "" } }} /></section>;
}
