import type { Metadata } from "next";
import { VipMenu } from "@/components/vip/VipMenu";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { publicVip } from "@/server/vip/service";
import "./vip.css";

// Unlisted on purpose: guests reach it from the QR code at their table, so it is kept out of search results and the site menu.
export const metadata: Metadata = { title: "VIP Menu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VipPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const repo = await getRepo(); const data = await publicVip(repo, await whatsappDigitsFor(repo)); const t = (await searchParams).t; const table = (Array.isArray(t) ? t[0] : t ?? "").replace(/[^\w \-]/g, "").slice(0, 20);
  if (!data.enabled) return <section className="wrap sec"><span className="lab green">VIP</span><h1 className="serif page-title">VIP menu</h1><p className="lede">The VIP menu is not available right now. Please ask your waiter.</p></section>;
  if (!data.categories.length) return <section className="wrap sec"><span className="lab green">VIP</span><h1 className="serif page-title">{data.title}</h1><p className="lede">The menu is being prepared. Please ask your waiter.</p></section>;
  return <section className="wrap sec vip"><VipMenu data={data} table={table} /></section>;
}