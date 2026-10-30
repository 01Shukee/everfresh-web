import { Button } from "@/components/ui/Button";
import { MediaSlot } from "@/components/ui/MediaSlot";

type Ph = { src: string; alt: string; title: string };
const slot = (p: Ph | undefined) => (p ? { src: p.src, alt: p.alt, width: 600, height: 760 } : null);
/** food / event: published photos from Admin > Event catering > Gallery. Without one, the labelled placeholder shows as before. */
export function CateringIntro({ food = [], event = [] }: { food?: Ph[]; event?: Ph[] }) {
  return (
    <section className="sec white" aria-labelledby="hc">
      <div className="wrap tbl">
        <div className="stack"><MediaSlot media={slot(event[0])} label="EVENT 1" shape="arch" style={{ height: 340 }} /><MediaSlot media={slot(food[0])} label="FOOD 1" shape="arch" style={{ height: 220 }} /></div>
        <div className="m">
          <span className="lab green">03 &middot; Event Catering</span>
          <h2 id="hc" className="serif ital">Your table, made generous.</h2>
          <p className="measure c">Tell us the date, the place and the guests. We will come back with a quotation.</p>
          <Button href="/event-catering">Request a quotation</Button>
        </div>
        <div className="stack"><MediaSlot media={slot(food[1])} label="FOOD 2" shape="arch" style={{ height: 220 }} /><MediaSlot media={slot(event[1])} label="EVENT 2" shape="arch" style={{ height: 340 }} /></div>
      </div>
    </section>
  );
}
