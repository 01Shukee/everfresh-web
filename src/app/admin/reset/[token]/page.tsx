import type { Metadata } from "next";
import { ResetForm } from "@/components/admin/ResetForm";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <section className="wrap sec"><h1 className="serif page-title">Choose a new password.</h1><ResetForm token={token} /></section>; }
