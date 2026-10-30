import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnquiryConfirmation } from "@/components/catering/EnquiryConfirmation";
import { getCateringDeps } from "@/server/runtime";
import { publicEnquiry } from "@/server/catering/service";

export const metadata: Metadata = { title: "Your catering request", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ ref: string; token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { ref, token } = await params; const v = await publicEnquiry(await getCateringDeps(), ref, token); if (!v) notFound();
  return <section className="wrap sec"><span className="lab green">Event Catering</span><h1 className="serif page-title">Thank you, {v.name.split(" ")[0]}.</h1><EnquiryConfirmation v={v} token={token} auto={(await searchParams).new === "1"} /></section>;
}
