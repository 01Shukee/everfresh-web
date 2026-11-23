"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { vocConfig } from "@/config/vocational";

/** Pay the application-form fee (with non-refundable acknowledgement), continue or restart an unfinished payment, pay an issued invoice, and keep the page up to date while a payment is being confirmed. */
export function ApplicationActions({ refNo, token, payStatus, mode, invoice, contact }: { refNo: string; token: string; payStatus: string; mode: "pay" | "pending" | "paid" | "review"; invoice?: { number: string; outstanding: string; awaiting: boolean } | null; contact?: string | null }) {
  const router = useRouter(); const [ack, setAck] = useState(false); const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [stale, setStale] = useState(false);
  const watching = mode === "pending" || !!invoice?.awaiting;   // a payment is waiting for the provider's confirmation
  useEffect(() => { if (payStatus === "paid") try { localStorage.removeItem("ef-app-draft"); sessionStorage.removeItem("ef-apply-selection"); } catch { /* ignore */ } }, [payStatus]);
  useEffect(() => { if (!watching) return; let n = 0; const t = setInterval(() => { if (++n > 60) { clearInterval(t); setStale(true); } else router.refresh(); }, 4000); return () => clearInterval(t); }, [watching, router]);
  const go = async (url: string, body: object, tag: string) => {
    setBusy(tag); setErr("");
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) }); const j = await r.json(); if (r.ok && j.checkoutUrl) location.assign(j.checkoutUrl); else if (r.ok) router.refresh(); else { setErr(j.error ?? "Something went wrong."); setBusy(""); } }
    catch { setErr("We couldn't reach the server. Nothing was charged."); setBusy(""); }
  };
  /** Closes the unfinished payment and opens a new one. Asks first, because paying twice would need a refund. */
  const startNew = (url: string, body: object, tag: string) => {
    if (window.confirm("Start a new payment? Only do this if the earlier payment page no longer works, or you did not pay. If you have just paid, wait a moment instead: this page updates by itself.")) go(url, { ...body, fresh: true }, tag);
  };
  const payUrl = `/api/applications/${refNo}/pay`; const invUrl = `/api/applications/${refNo}/invoice/pay`;
  return (
    <div className="actions">
      {mode === "pay" && <>
        <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand the application-form fee of &#8358;5,000 is non-refundable{vocConfig.applicationFee.creditedToTuition ? ", and that it is deducted from my school fees once I am accepted" : " and separate from tuition"}.</label>
        <button className="pill" disabled={!ack || !!busy} onClick={() => go(payUrl, { acknowledged: ack }, "fee")}>{busy === "fee" ? "Redirecting to secure payment\u2026" : payStatus === "failed" || payStatus === "expired" ? "Try payment again" : "Pay application-form fee"}</button></>}
      {mode === "pending" && <>
        <p className="small">Left the payment page without paying? Continue where you stopped. If you have just paid, wait a moment: this page updates by itself.</p>
        <button className="pill" disabled={!!busy} onClick={() => go(payUrl, { acknowledged: true }, "resume")}>{busy === "resume" ? "Opening secure payment\u2026" : "Continue to payment"}</button>
        <button type="button" className="linkbtn" disabled={!!busy} onClick={() => startNew(payUrl, { acknowledged: true }, "fresh")}>Payment page not working? Start a new payment</button></>}
      {invoice && <>
        {invoice.awaiting && <p className="small">A school-fee payment is waiting for confirmation. If you have just paid, wait a moment: this page updates by itself. If you left without paying, continue below.</p>}
        <button className="pill" disabled={!!busy} onClick={() => go(invUrl, { invoice: invoice.number }, "inv")}>{busy === "inv" ? "Redirecting\u2026" : invoice.awaiting ? "Continue to payment" : `Pay outstanding ${invoice.outstanding}`}</button>
        {invoice.awaiting && <button type="button" className="linkbtn" disabled={!!busy} onClick={() => startNew(invUrl, { invoice: invoice.number }, "invfresh")}>Payment page not working? Start a new payment</button>}</>}
      {stale && watching && <p className="alert" role="status">We have not received confirmation of your payment yet. Card and bank payments are usually confirmed within a minute; crypto payments can take longer. If you were charged, contact us{contact ? ` on ${contact}` : ""} and quote the reference <b>{refNo}</b>. You do not need to pay again.</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}