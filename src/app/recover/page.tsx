import type { Metadata } from "next";
import { RecoverForm } from "@/components/site/RecoverForm";
export const metadata: Metadata = { title: "Find my order or application", robots: { index: false } };
export default function RecoverPage() { return <section className="wrap sec"><span className="lab green">Lost your link?</span><h1 className="serif page-title">Find my order, application or request.</h1><p className="measure">Enter the email address you used. We will email you the private links to your orders, applications and catering requests.</p><RecoverForm /></section>; }
