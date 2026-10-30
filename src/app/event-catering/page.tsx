import type { Metadata } from "next";
import { CateringLandingView } from "@/components/catering/views";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { publicCatering } from "@/server/catering/service";

export const metadata: Metadata = { title: "Event Catering", description: "Request a catering quotation from Everfresh for your event." };
export const dynamic = "force-dynamic";
export default async function EventCateringPage() { return <CateringLandingView pub={await publicCatering(await getRepo(), await whatsappDigitsFor(await getRepo()))} />; }
