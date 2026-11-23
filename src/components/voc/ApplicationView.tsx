import Link from "next/link";
import { vocConfig } from "@/config/vocational";
import { formatNaira } from "@/lib/money";
import type { FormSummary } from "@/server/voc/form";
import type { OwnerViewGated } from "@/server/voc/gate";
import { ApplicationActions } from "./ApplicationActions";
import { Kv } from "./Bits";
import "./admission-form.css";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }) + " (WAT)" : "\u2014");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" }) : "");
const STATUS: Record<string, string> = { draft: "Not submitted", awaiting_payment: "Not submitted", submitted: "Received, awaiting review", under_review: "Under review", admitted: "Accepted", not_admitted: "Not admitted", waitlisted: "Waitlisted", withdrawn: "Withdrawn" };
const INV: Record<string, string> = { unpaid: "Unpaid", part_paid: "Part paid", paid: "Paid in full" };

function formLine(f: FormSummary | null): string {
  if (!f || f.status === "not_started") return "Complete your admission form";
  if (f.status === "draft") return f.staffNote ? "Correct your admission form" : "Finish your admission form";
  if (f.status === "submitted") return `Admission form received${f.submittedAt ? ` on ${day(f.submittedAt)}` : ""}`;
  return `Admission form signed by the school${f.schoolSignedAt ? ` on ${day(f.schoolSignedAt)}` : ""}`;
}

/** The admission form card: shown once the application-form fee is paid. */
function FormPanel({ refNo, token, form, admitted }: { refNo: string; token: string; form: FormSummary | null; admitted: boolean }) {
  const st = form?.status ?? "not_started"; const formUrl = `/application/${refNo}/${token}/form`; const pdf = `/api/applications/${refNo}/form/pdf?t=${encodeURIComponent(token)}`;
  const done = st === "submitted" || st === "school_signed";
  return (
    <div className="formcard">
      <h2 className="serif">{done ? "Admission form" : "Next: complete your admission form"}</h2>
      {st === "not_started" && <p>Fill it in and sign on this website, or print it, sign it and upload a photo or scan. Either way works. You will need a passport photograph, and your parent or guardian and your lawyer must sign.</p>}
      {st === "draft" && form?.staffNote && <div className="alert" role="alert"><b>We sent your form back:</b> {form.staffNote}</div>}
      {st === "draft" && !form?.staffNote && <p>You have started your form. Continue where you stopped.</p>}
      {done && <p>{st === "school_signed" ? "The school has signed your form." : "We have received your form."} {admitted ? "" : "Now wait for our email confirming your acceptance."}</p>}
      <div className="acts">
        {!done && <Link className="pill" href={formUrl}>{st === "not_started" ? "Start your admission form" : st === "draft" && form?.staffNote ? "Correct your form" : "Continue your form"}</Link>}
        {!done && <a className="pill ghost" href={`${pdf}&blank=1`} target="_blank" rel="noopener">Download printable form (PDF)</a>}
        {done && form?.mode !== "print" && <a className="pill ghost" href={pdf} target="_blank" rel="noopener">Download a copy (PDF)</a>}
      </div>
      <ol className="steps" aria-label="What happens next">
        <li>&#10003; Application-form fee paid</li><li>{done ? "\u2713 " : ""}{formLine(form)}</li>
        <li>{admitted ? "\u2713 You have been accepted" : "Wait for our email confirming your acceptance"}</li><li>Pay your school fees (after you are accepted)</li>
      </ol>
    </div>
  );
}

export function ApplicationView({ v, refNo, token, form, contact }: { v: OwnerViewGated; refNo: string; token: string; form: FormSummary | null; contact: string | null }) {
  const paid = v.payment.status === "paid"; const admitted = v.admitted; const ref = refNo; const base = `/api/applications/${ref}`; const q = `?t=${encodeURIComponent(token)}`;
  const mode = paid ? "paid" : v.payment.status === "pending" ? "pending" : v.payment.status === "needs_review" ? "review" : "pay";
  const open = admitted ? v.invoices.find((i) => i.state !== "paid" && i.outstandingKobo > 0) : undefined;
  const step = paid ? 5 : 3;
  return (
    <section className="wrap sec appview">
      <span className="lab green">{paid ? "Step 5 · Confirmation" : "Step 3 · Review and pay"}</span>
      <h1 className="serif page-title">{paid ? (admitted ? "You have been accepted." : "Application received.") : "Review your application."}</h1>
      <ol className="stepper2" aria-label="Application progress">{["Programme", "Your details", "Review", "Payment", "Confirmation"].map((s, n) => <li key={s} className={step === n + 1 ? "cur" : step > n + 1 ? "done" : ""}><span>{n + 1}</span>{s}</li>)}</ol>
      {paid ? (admitted
        ? <div className="paybox ok" role="status"><b className="serif">Congratulations, you have been accepted</b><span>Your programme invoice is below. Pay your school fees to secure your place. The application-form fee you paid has already been deducted.</span></div>
        : <div className="paybox ok" role="status"><b className="serif">Payment verified</b><span>Your application-form fee has been received. <b>Next: complete your admission form below</b>, then wait for our email confirming your acceptance. This is not an offer of admission, and school fees can be paid only after you are accepted.</span></div>)
        : mode === "pending" ? <div className="paybox wait" role="status"><b className="serif">Waiting for payment confirmation</b><span>If you have just paid, this page updates by itself once the payment is verified. If you left without paying, continue below.</span>
            <ol><li>Finish the payment on the secure payment page.</li><li>The payment provider tells us (card and bank payments: usually within a minute; crypto payments can take longer).</li><li>This page then shows your receipt and your next step, and we email you.</li></ol></div>
        : mode === "review" ? <div className="paybox wait" role="status"><b className="serif">We&rsquo;re reviewing your payment</b><span>We received a payment that we need to check before confirming it. You do not need to pay again. If you do not hear from us, contact us{contact ? ` on ${contact}` : ""} and quote {ref}.</span></div>
        : (v.payment.status === "failed" || v.payment.status === "expired") ? <div className="paybox bad" role="alert"><b className="serif">Payment didn&rsquo;t go through</b><span>Nothing was charged for that attempt. You can try again.</span></div> : null}
      <div className="co-grid">
        <div>
          <h2 className="serif">Application</h2>
          <dl className="dl"><Kv k="Applicant">{v.details.fullName}</Kv><Kv k="Reference"><b className="ordnum">{v.ref}</b></Kv><Kv k="Programme">{v.programme}</Kv><Kv k="Duration">{v.duration}</Kv>{v.courses.length > 0 ? <Kv k={v.courses.length > 1 ? "Courses" : "Course"}>{v.courses.join(", ")}</Kv> : v.course && <Kv k="Course">{v.course}</Kv>}{v.accommodation && <Kv k="Student type">{v.accommodation === "hostel" ? "Hostel student" : "Day student"}</Kv>}
            <Kv k="Status">{STATUS[v.status]}</Kv>
            {!paid && <><Kv k="Phone">{v.details.phone}</Kv><Kv k="Email">{v.details.email}</Kv>{v.details.dob && <Kv k="Date of birth">{v.details.dob}</Kv>}{v.details.address && <Kv k="Address">{v.details.address}</Kv>}{v.details.education && <Kv k="Education">{v.details.education}</Kv>}{v.details.emergencyName && <Kv k="Emergency contact">{v.details.emergencyName}, {v.details.emergencyPhone}</Kv>}{v.details.additional && <Kv k="Additional">{v.details.additional}</Kv>}</>}</dl>
          {!paid && (v.status === "draft" || v.status === "awaiting_payment") && <p><Link className="linkbtn" href={`/apply/${ref}/${token}`}>Edit details</Link></p>}
        </div>
        <div>
          <h2 className="serif">Charges</h2>
          <table className="ftable"><tbody><tr><th scope="row">Application-form fee<span className="small dim0 block">{vocConfig.applicationFee.creditedToTuition ? "Non-refundable. Deducted from your school fees once you are accepted." : "Non-refundable. Separate from tuition."}</span></th><td className="tab">{formatNaira(v.feeKobo)}</td></tr><tr><th scope="row">Other charges at application</th><td>None</td></tr></tbody></table>
          {paid ? <dl className="dl"><Kv k="Payment status">Verified, paid</Kv><Kv k="Transaction ref">{v.payment.transactionRef}</Kv><Kv k="Payment date">{when(v.payment.paidAt)}</Kv><Kv k="Receipt no.">{v.payment.receiptNumber}</Kv></dl>
            : <div className="totals"><div className="grand"><span>Total to pay now</span><span className="tab">{formatNaira(v.feeKobo)}</span></div></div>}
          {v.payment.status === "failed" && v.lastAttemptError && <p className="err">{v.lastAttemptError}</p>}
          <ApplicationActions refNo={ref} token={token} payStatus={v.payment.status} mode={mode} contact={contact} invoice={open ? { number: open.number, outstanding: formatNaira(open.outstandingKobo), awaiting: open.awaitingPayment } : null} />
          {paid && <div className="acts"><a className="pill" href={`${base}/confirmation${q}`} target="_blank" rel="noopener">Download confirmation (PDF)</a><a className="pill ghost" href={`${base}/receipt${q}`} target="_blank" rel="noopener">Download receipt (PDF)</a></div>}
          {admitted && v.invoices.length === 0 && <p className="small">Your school-fee invoice is being prepared. We will contact you shortly.</p>}
        </div>
      </div>
      {paid && <FormPanel refNo={ref} token={token} form={form} admitted={admitted} />}
      {paid && v.curriculum.length > 0 && <div className="invs"><h2 className="serif">Programme curriculum</h2><ol className="vlist num">{v.curriculum.map((m) => <li key={m.title}><b>{m.title}</b>{m.topics.length > 0 && <ul>{m.topics.map((t) => <li key={t}>{t}</li>)}</ul>}</li>)}</ol></div>}
      {admitted && v.invoices.length > 0 && <div className="invs"><h2 className="serif">Programme invoices</h2>{v.invoices.map((i) => (
        <article key={i.number} className="inv"><header><b>{i.number}</b><span className={`tag ${i.state === "paid" ? "pay-paid" : ""}`}>{INV[i.state] ?? i.state}</span></header>
          <p className="small"><b>This is an invoice, not a receipt.</b> Only a payment receipt is proof of payment.</p>
          <table className="ftable"><tbody>{i.lines.map((l) => <tr key={l.id}><th scope="row">{l.label}<span className="small dim0 block">{l.kind}</span></th><td className="tab">{l.kind === "discount" ? "-" : ""}{formatNaira(l.amountKobo)}</td></tr>)}
            <tr className="tot"><th scope="row">Total programme cost</th><td className="tab">{formatNaira(i.totalKobo)}</td></tr><tr><th scope="row">Amount paid</th><td className="tab">{formatNaira(i.paidKobo)}</td></tr><tr className="tot"><th scope="row">Outstanding balance</th><td className="tab">{formatNaira(i.outstandingKobo)}</td></tr></tbody></table>
          <p className="small">Payment terms: {i.paymentTerms ?? "[PAYMENT TERMS: to be supplied by the institution]"}{i.dueDate ? ` · Due ${i.dueDate}` : ""}</p>
          <div className="acts"><a className="pill ghost sm" href={`${base}/invoice${q}&inv=${i.number}`} target="_blank" rel="noopener">Download invoice (PDF)</a>{i.payments.map((p) => <a key={p.receiptNumber} className="linkbtn" href={`${base}/receipt${q}&n=${p.receiptNumber}`} target="_blank" rel="noopener">Receipt {p.receiptNumber} ({formatNaira(p.amountKobo)})</a>)}</div></article>))}</div>}
    </section>
  );
}