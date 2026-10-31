import { site } from "@/config/site";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "@/components/ui/MediaSlot";
import { Tag } from "@/components/ui/Tag";

const programmes = [
  { name: "Regular programme", length: "3 years", fee: "regular" as const },
  { name: "Intensive programme", length: "1 month, 3 months or 6 months", fee: "intensive" as const },
];

/** photo: the first published "project" photo from Admin > Vocational studies > Photos. Without one, the labelled placeholder shows as before. */
export function StudiesIntro({ photo, fees }: { photo?: { src: string; alt: string; title: string } | null; fees?: { regular: string | null; intensive: string | null } }) {
  return (
    <section className="sec gridbg" aria-labelledby="hs">
      <div className="wrap grid2">
        <div>
          <span className="lab green">02 &middot; Vocational Studies</span>
          <h2 id="hs" className="serif green">Learn it by making it.</h2>
          <p className="measure">Practical training with projects you can show. Choose a programme that fits your time.</p>
          <div className="ledger">
            {programmes.map((p) => (
              <div className="row" key={p.name}>
                <span><b className="serif">{p.name}</b><br />{p.length}</span>
                <Tag>{fees?.[p.fee] ? `Tuition: ${fees[p.fee]}` : "Fees: to be confirmed"}</Tag>
              </div>
            ))}
          </div>
          <p className="small dim">Application form fee: &#8358;{site.applicationFeeNaira.toLocaleString("en-NG")}, non-refundable and separate from tuition.</p>
          <Button href="/vocational-studies">Explore programmes</Button>
        </div>
        <figure className="plate-wide">
          <MediaSlot media={photo ? { src: photo.src, alt: photo.alt, width: 800, height: 600 } : null} label="WORKSHOP / STUDENT PROJECT PHOTO" className="tall" />
          <figcaption><Tag>Student project: {photo ? photo.title : "[PROJECT NAME]"}</Tag></figcaption>
        </figure>
      </div>
    </section>
  );
}
