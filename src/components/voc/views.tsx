import Link from "next/link";
import { HeroPhoto } from "@/components/ui/HeroPhoto";
import { formatNaira } from "@/lib/money";
import { ProgrammeCards } from "./ProgrammeCards";
import { VocHero } from "./VocHero";
import { VocBenefits, VocTestimonials } from "./VocExtras";
import { VocVideos } from "./VocVideos";
import { WorkGallery } from "./WorkGallery";
import { VariantBody } from "./VariantBody";
import { IntensiveCompare } from "./IntensiveCompare";
import { ApplicationActions } from "./ApplicationActions";
import { Kv } from "./Bits";
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
        <h1 className="serif page-title big2">Focused training in <em>1, 3 or 6 months.</em></h1>
        <p className="lede">Compare the three durations side by side. Each has its own course information, fees and application.</p>
      </div><HeroPhoto photo={photo} /></div></section>
      <IntensiveCompare content={content} />
    </>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }) + " (WAT)" : "—");
const STATUS: Record<string, string> = { draft: "Not submitted", awaiting_payment: "Not submitted", submitted: "Received, awaiting review", under_review: "Under review", admitted: "Admitted", not_admitted: "Not admitted", waitlisted: "Waitlisted", withdrawn: "Withdrawn" };
const INV: Record<string, string> = { unpaid: "Unpaid", part_paid: "Part paid", paid: "Paid in full" };

export function ApplicationView({ v, refNo, token }: { v: OwnerView; refNo: string; token: string }) {
  const paid = v.payment.status === "paid"; const ref = refNo; const base = `/api/applications/${ref}`; const q = `?t=${encodeURIComponent(token)}`;
  const mode = paid ? "paid" : v.payment.status === "pending" ? "pending" : v.payment.status === "needs_review" ? "review" : "pay";
  const open = v.invoices.find((i) => i.state !== "paid" && i.outstandingKobo > 0);
  return (
    <section className="wrap sec appview">
      <span className="lab green">{paid ? "Step 5 · Confirmation" : "Step 3 · Review and pay"}</span>
      <h1 className="serif page-title">{paid ? "Application received." : "Review your application."}</h1>
      <ol className="stepper2" aria-label="Application progress">{["Programme", "Your details", "Review", "Payment", "Confirmation"].map((s, n) => <li key={s} className={(paid ? 5 : 3) === n + 1 ? "cur" : (paid ? 5 : 3) > n + 1 ? "done" : ""}><span>{n + 1}</span>{s}</li>)}</ol>
      {paid ? <div className="paybox ok" role="status"><b className="serif">Payment verified</b><span>Your application-form fee has been received. Your application is now awaiting review. <b>This is not an offer of admission.</b></span></div>
        : mode === "pending" ? <div className="paybox wait" role="status"><b className="serif">Waiting for payment confirmation</b><span>This page updates by itself once the payment is verified.</span></div>
        : mode === "review" ? <div className="paybox wait" role="status"><b className="serif">We&rsquo;re reviewing your payment</b><span>Please contact us before paying again.</span></div>
        : (v.payment.status === "failed" || v.payment.status === "expired") ? <div className="paybox bad" role="alert"><b className="serif">Payment didn&rsquo;t go through</b><span>Nothing was charged for that attempt. You can try again.</span></div> : null}
      <div className="co-grid">
        <div>
          <h2 className="serif">Application</h2>
          <dl className="dl"><Kv k="Applicant">{v.details.fullName}</Kv><Kv k="Reference"><b className="ordnum">{v.ref}</b></Kv><Kv k="Programme">{v.programme}</Kv><Kv k="Duration">{v.duration}</Kv>{v.course && <Kv k="Course">{v.course}</Kv>}
            <Kv k="Status">{STATUS[v.status]}</Kv>
            {!paid && <><Kv k="Phone">{v.details.phone}</Kv><Kv k="Email">{v.details.email}</Kv>{v.details.dob && <Kv k="Date of birth">{v.details.dob}</Kv>}<Kv k="Address">{v.details.address}</Kv>{v.details.education && <Kv k="Education">{v.details.education}</Kv>}{v.details.emergencyName && <Kv k="Emergency contact">{v.details.emergencyName}, {v.details.emergencyPhone}</Kv>}{v.details.additional && <Kv k="Additional">{v.details.additional}</Kv>}</>}</dl>
          {!paid && (v.status === "draft" || v.status === "awaiting_payment") && <p><Link className="linkbtn" href={`/apply/${ref}/${token}`}>Edit details</Link></p>}
        </div>
        <div>
          <h2 className="serif">Charges</h2>
          <table className="ftable"><tbody><tr><th scope="row">Application-form fee<span className="small dim0 block">Non-refundable. Separate from tuition.</span></th><td className="tab">{formatNaira(v.feeKobo)}</td></tr><tr><th scope="row">Other charges at application</th><td>None</td></tr></tbody></table>
          {paid ? <dl className="dl"><Kv k="Payment status">Verified, paid</Kv><Kv k="Transaction ref">{v.payment.transactionRef}</Kv><Kv k="Payment date">{when(v.payment.paidAt)}</Kv><Kv k="Receipt no.">{v.payment.receiptNumber}</Kv></dl>
            : <div className="totals"><div className="grand"><span>Total to pay now</span><span className="tab">{formatNaira(v.feeKobo)}</span></div></div>}
          {v.payment.status === "failed" && v.lastAttemptError && <p className="err">{v.lastAttemptError}</p>}
          <ApplicationActions refNo={ref} token={token} payStatus={v.payment.status} mode={mode} invoice={open ? { number: open.number, outstanding: formatNaira(open.outstandingKobo), awaiting: open.awaitingPayment } : null} />
          {paid && <div className="acts"><a className="pill" href={`${base}/confirmation${q}`} target="_blank" rel="noopener">Download confirmation (PDF)</a><a className="pill ghost" href={`${base}/receipt${q}`} target="_blank" rel="noopener">Download receipt (PDF)</a></div>}
          {paid && <><h3 className="lab green">Next steps</h3><p>{v.nextSteps ?? "[NEXT STEPS: to be supplied by the institution]"}</p></>}
        </div>
      </div>
      {v.invoices.length > 0 && <div className="invs"><h2 className="serif">Programme invoices</h2>{v.invoices.map((i) => (
        <article key={i.number} className="inv"><header><b>{i.number}</b><span className={`tag ${i.state === "paid" ? "pay-paid" : ""}`}>{INV[i.state] ?? i.state}</span></header>
          <p className="small"><b>This is an invoice, not a receipt.</b> Only a payment receipt is proof of payment.</p>
          <table className="ftable"><tbody>{i.lines.map((l) => <tr key={l.id}><th scope="row">{l.label}<span className="small dim0 block">{l.kind}</span></th><td className="tab">{l.kind === "discount" ? "-" : ""}{formatNaira(l.amountKobo)}</td></tr>)}
            <tr className="tot"><th scope="row">Total programme cost</th><td className="tab">{formatNaira(i.totalKobo)}</td></tr><tr><th scope="row">Amount paid</th><td className="tab">{formatNaira(i.paidKobo)}</td></tr><tr className="tot"><th scope="row">Outstanding balance</th><td className="tab">{formatNaira(i.outstandingKobo)}</td></tr></tbody></table>
          <p className="small">Payment terms: {i.paymentTerms ?? "[PAYMENT TERMS: to be supplied by the institution]"}{i.dueDate ? ` · Due ${i.dueDate}` : ""}</p>
          <div className="acts"><a className="pill ghost sm" href={`${base}/invoice${q}&inv=${i.number}`} target="_blank" rel="noopener">Download invoice (PDF)</a>{i.payments.map((p) => <a key={p.receiptNumber} className="linkbtn" href={`${base}/receipt${q}&n=${p.receiptNumber}`} target="_blank" rel="noopener">Receipt {p.receiptNumber} ({formatNaira(p.amountKobo)})</a>)}</div></article>))}</div>}
    </section>
  );
}
