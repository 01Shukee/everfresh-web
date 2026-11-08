import { HomeView } from "@/components/home/HomeView";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { publicVocational } from "@/server/voc/admin";
import { getSettings } from "@/server/site/settings";
import { loadHomeMenu } from "@/server/home";
import { publicCatering } from "@/server/catering/service";
import { VARIANTS } from "@/config/vocational";
import { tuitionText } from "@/lib/voc-view";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  const repo = await getRepo(); const [settings, pub, whatsapp, menu] = await Promise.all([getSettings(repo), publicVocational(repo), whatsappDigitsFor(repo), loadHomeMenu(repo)]);
  // Photos for the Studies and Catering intro sections come from the admin-managed Vocational photos and Catering gallery.
  const gallery = (await publicCatering(repo, null)).gallery; const photo = (g: (typeof gallery)[number]) => ({ src: g.imageUrl, alt: g.imageAlt, title: g.title });
  const project = pub.portfolio.find((i) => i.kind === "project");
  const ints = VARIANTS.filter((v) => v.programme === "intensive").map((v) => tuitionText(pub.content[v.id])).filter((t): t is string => !!t); const intensiveFrom = ints.length ? (ints.length === 1 ? ints[0] : `From ${ints.map((t) => t.replace(/^From /, "")).sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")))[0]}`) : null;
  return <HomeView d={{ menu, settings, whatsapp, testimonials: pub.testimonials, videos: pub.videos, fees: { regular: tuitionText(pub.content["regular-3y"]), intensive: intensiveFrom }, studentProject: project ? { src: project.imageUrl, alt: project.imageAlt, title: project.title } : null, cateringPhotos: { food: gallery.filter((g) => g.kind === "food").map(photo), event: gallery.filter((g) => g.kind === "event").map(photo) } }} />;
}
