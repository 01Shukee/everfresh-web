import Link from "next/link";
import { HeroPhoto } from "@/components/ui/HeroPhoto";
import { ProgrammeCards } from "./ProgrammeCards";
import { VocHero } from "./VocHero";
import { VocBenefits, VocTestimonials } from "./VocExtras";
import { VocVideos } from "./VocVideos";
import { WorkGallery } from "./WorkGallery";
import { VariantBody } from "./VariantBody";
import { IntensiveCompare } from "./IntensiveCompare";
import type { VariantContent } from "@/server/voc/model";
import type { publicVocational } from "@/server/voc/admin";
import type { ownerView } from "@/server/voc/applications";

export type Pub = Awaited<ReturnType<typeof publicVocational>>;
export type OwnerView = NonNullable<Awaited<ReturnType<typeof ownerView>>>;

export function VocLandingView({ pub }: { pub: Pub }) {
  return (
    <>
      <VocHero items={pub.portfolio} />
      <ProgrammeCards content={pub.content} />
      <WorkGallery items={pub.portfolio} />
      <VocVideos videos={pub.videos} />
      <VocBenefits content={pub.content} />
      <VocTestimonials items={pub.testimonials} />
      <section className="sec white" aria-label="Apply"><div className="wrap cta serif"><span className="mk">Ready?</span> <Link href="#programmes">Choose a programme</Link> and apply.</div></section>
    </>
  );
}

export function RegularView({ c, photo }: { c: VariantContent; photo?: { src: string; alt: string } | null }) {
  return (
    <>
      <section className="vhero gridbg"><div className={`wrap phero ${photo ? "has-photo" : ""}`}><div>
        <span className="lab green">Vocational Studies &middot; Regular Programme</span>
        <h1 className="serif page-title big2">Three years of <em>practical training.</em></h1>
        <p className="lede">The Regular Programme runs for 3 years.</p>
      </div><HeroPhoto photo={photo} /></div></section>
      <section className="sec gridbg"><div className="wrap">{c.published ? <VariantBody c={c} /> : <div className="empty"><p className="serif empty-title">Programme details are being prepared.</p><p>Course information, admission requirements and fees will appear here once the institution confirms them.</p></div>}</div></section>
    </>
  );
}

export function IntensiveView({ content, photo }: { content: Record<string, VariantContent>; photo?: { src: string; alt: string } | null }) {
  return (
    <>
      <section className="vhero gridbg"><div className={`wrap phero ${photo ? "has-photo" : ""}`}><div>
        <span className="lab green">Vocational Studies &middot; Intensive Programme</span>
        <h1 className="serif page-title big2">Focused training from <em>1 month to 1 year.</em></h1>
        <p className="lede">Compare the options side by side. Each has its own course information, fees and application.</p>
      </div><HeroPhoto photo={photo} /></div></section>
      <IntensiveCompare content={content} />
    </>
  );
}