import Link from "next/link";
import { formatNaira } from "@/lib/money";
import { variantById } from "@/config/vocational";
import type { VariantContent } from "@/server/voc/model";
import { Tbc } from "./Bits";

/** One programme option's course information, requirements and fees. Shows only what the institution has supplied. */
export function VariantBody({ c, compact = false }: { c: VariantContent; compact?: boolean }) {
  const v = variantById(c.variantId)!; const H = compact ? "h4" : "h2";
  return (
    <div className="vbody">
      <section><H className="lab green">Overview</H><p>{c.summary ?? <Tbc what="Overview" />}</p>{c.intakeNote && <p className="small">{c.intakeNote}</p>}</section>
      <section><H className="lab green">Courses</H>{c.courses.length ? <ul className="vlist">{c.courses.map((x) => <li key={x.id}><b>{x.name}</b>{x.description && <span className="small dim0 block">{x.description}</span>}</li>)}</ul> : <Tbc what="Course list" />}</section>
      <section><H className="lab green">Curriculum</H>{c.curriculum.length ? <ol className="vlist num">{c.curriculum.map((m, n) => <li key={n}><b>{m.title}</b>{m.topics.length > 0 && <ul>{m.topics.map((t) => <li key={t}>{t}</li>)}</ul>}</li>)}</ol> : <Tbc what="Curriculum" />}</section>
      <section><H className="lab green">Admission requirements</H>{c.requirements.length ? <ol className="vlist num">{c.requirements.map((r) => <li key={r}>{r}</li>)}</ol> : <Tbc what="Admission requirements" />}</section>
      <section><H className="lab green">Fees</H>
        {c.fees.length ? <table className="ftable"><tbody>{c.fees.map((f) => <tr key={f.id}><th scope="row">{f.label}{f.note && <span className="small dim0 block">{f.note}</span>}</th><td className="tab">{f.amountKobo === null ? <span className="tag">To be confirmed</span> : formatNaira(f.amountKobo)}</td></tr>)}</tbody></table> : <Tbc what="Tuition and fees" />}
        <p className="small">Application-form fee: &#8358;5,000, non-refundable and separate from tuition and other charges.</p></section>
      {(c.accommodation.available !== null) && <section><H className="lab green">Accommodation</H><p>{c.accommodation.available ? "Accommodation is available." : "Accommodation is not offered."}{c.accommodation.note ? ` ${c.accommodation.note}` : ""}</p></section>}
      <div className="acts">{c.open ? <Link href={`/apply?variant=${v.id}`} className="pill">Apply for {v.durationLabel} <span className="dot" aria-hidden="true">&rarr;</span></Link> : <span className="tag">Applications not open yet</span>}</div>
      {compact && null}
    </div>
  );
}
