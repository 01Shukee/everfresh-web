import type { Metadata } from "next";
import { AboutView } from "@/components/site/views";
import { getRepo } from "@/server/runtime";
import { getSettings } from "@/server/site/settings";
export const metadata: Metadata = { title: "About Us", description: "About Everfresh: our food, vocational training and event catering." };
export const dynamic = "force-dynamic";
export default async function AboutPage() { return <AboutView s={await getSettings(await getRepo())} />; }
