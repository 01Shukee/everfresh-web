import Link from "next/link";
import { VARIANTS } from "@/config/vocational";
import { tuitionText } from "@/lib/voc-view";
import type { VariantContent } from "@/server/voc/model";
import { Tbc } from "./Bits";

export function ProgrammeCards({ content }: { content: Record<string, VariantContent> }) {
  const reg = content["regular-3y"]; const ints = VARIANTS.filter((v) => v.programme === "intensive");
  const apply = (id: string, open: boolean, label = "Apply") => open ? <Link href={`/apply?variant=${id}`} className="pill sm">{label}</Link> : <span className="small dim0">Applications not open yet</span>;
  return (
    <section id="programmes" className="sec" aria-labelledby="hp"><div className="wrap">
      <span className="lab green">Choose your pathway</span><h2 id="hp" className="serif green">Find the programme that fits.</h2>
      <div className="progcards">
        <article className="pcard">
          <span className="lab">Regular Programme</span><h3 className="serif">3 years</h3>
          <p>{reg.published && reg.summary ? reg.summary : <Tbc what="Programme summary" />}</p>
          <dl className="mini"><dt>Tuition</dt><dd>{tuitionText(reg) ?? <span className="tag">To be confirmed</span>}</dd></dl>
          <div className="acts"><Link href="/vocational-studies/regular" className="pill">View programme <span className="dot" aria-hidden="true">&rarr;</span></Link>{apply("regular-3y", reg.open)}</div>
        </article>
        <article className="pcard alt">
          <span className="lab">Intensive Programme</span><h3 className="serif">1, 3 or 6 months</h3>
          <ul className="durs">{ints.map((v) => { const c = content[v.id]; return (<li key={v.id}><b className="serif">{v.durationLabel}</b><span className="tab">{tuitionText(c) ?? <span className="tag">Fees to be confirmed</span>}</span>{apply(v.id, c.open)}</li>); })}</ul>
          <div className="acts"><Link href="/vocational-studies/intensive" className="pill">Compare durations <span className="dot" aria-hidden="true">&rarr;</span></Link></div>
        </article>
      </div>
      <p className="small dim0">Application-form fee: &#8358;5,000, non-refundable and separate from tuition.</p>
    </div></section>
  );
}
