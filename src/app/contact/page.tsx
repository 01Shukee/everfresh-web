import type { Metadata } from "next";
import { ContactView } from "@/components/site/views";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { getSettings } from "@/server/site/settings";
export const metadata: Metadata = { title: "Contact Us", description: "Contact Everfresh by phone, WhatsApp or the contact form." };
export const dynamic = "force-dynamic";
export default async function ContactPage() { const repo = await getRepo(); return <ContactView s={await getSettings(repo)} whatsapp={await whatsappDigitsFor(repo)} />; }
