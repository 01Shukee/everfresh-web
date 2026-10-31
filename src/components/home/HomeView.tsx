import { Benefits } from "./Benefits";
import { CateringIntro } from "./CateringIntro";
import { FeaturedWork } from "./FeaturedWork";
import { FinalCta } from "./FinalCta";
import { FoodIntro } from "./FoodIntro";
import { Hero } from "./Hero";
import { StudiesIntro } from "./StudiesIntro";
import { Testimonials } from "./Testimonials";
import { VideoShowcase } from "./VideoShowcase";
import type { HomeMenu } from "@/server/home";
import type { SiteSettings } from "@/server/site/settings";

type HomePhoto = { src: string; alt: string; title: string };
export interface HomeData { menu: HomeMenu; settings: SiteSettings; whatsapp: string | null; testimonials: { id: string; quote: string; name: string; relation: string }[]; videos: { id: string; title: string; src: string; poster: string | null; captions: string | null }[]; studentProject?: HomePhoto | null; fees?: { regular: string | null; intensive: string | null }; cateringPhotos?: { food: HomePhoto[]; event: HomePhoto[] } }
export function HomeView({ d }: { d: HomeData }) {
  const h = d.settings.homepage;
  return (
    <>
      <Hero contact={d.settings.contact} heroImages={h.heroImages} />
      <FoodIntro menu={d.menu} />
      <StudiesIntro photo={d.studentProject} fees={d.fees} />
      <CateringIntro food={d.cateringPhotos?.food} event={d.cateringPhotos?.event} />
      <FeaturedWork items={h.featured} />
      <VideoShowcase videos={d.videos.map((v) => ({ id: v.id, name: v.title, src: v.src, poster: v.poster, captions: v.captions }))} />
      <Benefits items={h.benefits} />
      <Testimonials items={d.testimonials} />
      <FinalCta whatsappDigits={d.whatsapp} />
    </>
  );
}
