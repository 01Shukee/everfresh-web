import { MediaSlot } from "@/components/ui/MediaSlot";

export interface FeaturedItem { id: string; kind: "food" | "project" | "event" | "student"; title: string; caption: string; url: string; alt: string }
const LABEL = { food: "Dish", project: "Project", event: "Event", student: "Student work" } as const;
const fallback = [["Dish", 300, 380], ["Student project", 360, 260], ["Event", 260, 380], ["Dish", 340, 300], ["Student project", 300, 380], ["Event", 360, 260]] as const;

export function FeaturedWork({ items }: { items: FeaturedItem[] }) {
  return (
    <section className="sec" aria-labelledby="hw">
      <div className="wrap">
        <span className="lab green">Featured work</span>
        <h2 id="hw" className="serif green">Made by hand.</h2>
        <div className="band" tabIndex={0} role="region" aria-label="Featured work, scroll sideways">
          {items.length
            ? items.map((w) => (<figure key={w.id} style={{ width: 320 }}><MediaSlot media={{ src: w.url, alt: w.alt, width: 640, height: 480 }} label={w.title} /><figcaption className="lab">{LABEL[w.kind]} &middot; {w.title}{w.caption ? ` · ${w.caption}` : ""}</figcaption></figure>))
            : fallback.map(([kind, w, h], n) => (<figure key={n} style={{ width: w }}><MediaSlot label={kind.toUpperCase()} style={{ height: h }} /><figcaption className="lab">{kind} &middot; [CAPTION]</figcaption></figure>))}
        </div>
      </div>
    </section>
  );
}
