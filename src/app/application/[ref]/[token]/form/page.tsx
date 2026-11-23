import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdmissionFormView } from "@/components/voc/AdmissionFormView";
import { getVocDeps } from "@/server/runtime";
import { getFormView } from "@/server/voc/form";

export const metadata: Metadata = { title: "Admission form", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function AdmissionFormPage({ params }: { params: Promise<{ ref: string; token: string }> }) {
  const { ref, token } = await params; const r = await getFormView(await getVocDeps(), ref, token);
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <section className="wrap sec"><span className="lab green">Admission form</span><h1 className="serif page-title">Not open yet.</h1><p className="lede">{r.message}</p><Link className="pill" href={`/application/${ref}/${token}`}>Back to your application</Link></section>;
  }
  return <section className="wrap sec"><span className="lab green">Application {ref}</span><h1 className="serif page-title">Admission form.</h1><p className="lede">{r.view.programme}</p><AdmissionFormView refNo={ref} token={token} initial={r.view} /></section>;
}