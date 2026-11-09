import Link from "next/link";
import { vocConfig } from "@/config/vocational";
import { formatNaira } from "@/lib/money";
import type { OwnerViewGated } from "@/server/voc/gate";
import { ApplicationActions } from "./ApplicationActions";
import { Kv } from "./Bits";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }) + " (WAT)" : "\u2014");
const STATUS: Record<string, string> = { draft: "Not submitted", awaiting_payment: "Not submitted", submitted: "Received, awaiting review", under_review: "Under review", admitted: "Accepted", not_admitted: "Not admitted", waitlisted: "Waitlisted", withdrawn: "Withdrawn" };
const INV: Record<string, string> = { unpaid: "Unpaid", part_paid: "Part paid", paid: "Paid in full" };

export function ApplicationView({ v, refNo, token }: { v: OwnerViewGated; refNo: string; token: string }) {
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
        : <div className="paybox ok" role="status"><b className="serif">Payment verified</b><span>Your application-form fee has been received and your application is awaiting review. <b>This is not an offer of admission.</b> Wait for our acceptance email: school fees can be paid only after you are accepted.</span></div>)
        : mode === "pending" ? <div className="paybox wait" role="status"><b className="serif">Waiting for payment confirmation</b><span>This page updates by itself once the payment is verified.</span></div>
        : mode === "review" ? <div className="paybox wait" role="status"><b className="serif">We&rsquo;re reviewing your payment</b><span>Please contact us before paying again.</span></div>
        : (v.payment.status === "failed" || v.payment.status === "expired") ? <div className="paybox bad" role="alert"><b className="serif">Payment didn&rsquo;t go through</b><span>Nothing was charged for that attempt. You can try again.</span></div> : null}
      <div className="co-grid">
        <div>
          <h2 className="serif">Application</h2>
          <dl className="dl"><Kv k="Applicant">{v.details.fullName}</Kv><Kv k="Reference"><b className="ordnum">{v.ref}</b></Kv><Kv k="Programme">{v.programme}</Kv><Kv k="Duration">{v.duration}</Kv>{v.courses.length > 0 ? <Kv k={v.courses.length > 1 ? "Courses" : "Course"}>{v.courses.join(", ")}</Kv> : v.course && <Kv k="Course">{v.course}</Kv>}{v.accommodation && <Kv k="Student type">{v.accommodation === "hostel" ? "Hostel student" : "Day student"}</Kv>}
            <Kv k="Status">{STATUS[v.status]}</Kv>
            {!paid && <><Kv k="Phone">{v.details.phone}</Kv><Kv k="Email">{v.details.email}</Kv>{v.details.dob && <Kv k="Date of birth">{v.details.dob}</Kv>}<Kv k="Address">{v.details.address}</Kv>{v.details.education && <Kv k="Education">{v.details.education}</Kv>}{v.details.emergencyName && <Kv k="Emergency contact">{v.details.emergencyName}, {v.details.emergencyPhone}</Kv>}{v.details.additional && <Kv k="Additional">{v.details.additional}</Kv>}</>}</dl>
          {!paid && (v.status === "draft" || v.status === "awaiting_payment") && <p><Link className="linkbtn" href={`/apply/${ref}/${token}`}>Edit details</Link></p>}
        </div>
        <div>
          <h2 className="serif">Charges</h2>
          <table className="ftable"><tbody><tr><th scope="row">Application-form fee<span className="small dim0 block">{vocConfig.applicationFee.creditedToTuition ? "Non-refundable. Deducted from your school fees once you are accepted." : "Non-refundable. Separate from tuition."}</span></th><td className="tab">{formatNaira(v.feeKobo)}</td></tr><tr><th scope="row">Other charges at application</th><td>None</td></tr></tbody></table>
          {paid ? <dl className="dl"><Kv k="Payment status">Verified, paid</Kv><Kv k="Transaction ref">{v.payment.transactionRef}</Kv><Kv k="Payment date">{when(v.payment.paidAt)}</Kv><Kv k="Receipt no.">{v.payment.receiptNumber}</Kv></dl>
            : <div className="totals"><div className="grand"><span>Total to pay now</span><span className="tab">{formatNaira(v.feeKobo)}</span></div></div>}
          {v.payment.status === "failed" && v.lastAttemptError && <p className="err">{v.lastAttemptError}</p>}
          <ApplicationActions refNo={ref} token={token} payStatus={v.payment.status} mode={mode} invoice={open ? { number: open.number, outstanding: formatNaira(open.outstandingKobo), awaiting: open.awaitingPayment } : null} />
          {paid && <div className="acts"><a className="pill" href={`${base}/confirmation${q}`} target="_blank" rel="noopener">Download confirmation (PDF)</a><a className="pill ghost" href={`${base}/receipt${q}`} target="_blank" rel="noopener">Download receipt (PDF)</a></div>}
          {paid && <><h3 className="lab green">Next steps</h3><p>{admitted ? "You have been accepted. Pay your school fees from the invoice below to secure your place." : v.nextSteps ?? "Wait for an email from us confirming your acceptance. School fees can be paid only after you are accepted."}</p></>}
          {admitted && v.invoices.length === 0 && <p className="small">Your school-fee invoice is being prepared. We will contact you shortly.</p>}
        </div>
      </div>
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