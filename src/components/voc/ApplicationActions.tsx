"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { vocConfig } from "@/config/vocational";

/** Pay the application-form fee (with non-refundable acknowledgement), retry, poll while pending, and pay an issued invoice. */
export function ApplicationActions({ refNo, token, payStatus, mode, invoice }: { refNo: string; token: string; payStatus: string; mode: "pay" | "pending" | "paid" | "review"; invoice?: { number: string; outstanding: string; awaiting: boolean } | null }) {
  const router = useRouter(); const [ack, setAck] = useState(false); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (payStatus === "paid") try { localStorage.removeItem("ef-app-draft"); sessionStorage.removeItem("ef-apply-selection"); } catch { /* ignore */ } }, [payStatus]);
  useEffect(() => { if (mode !== "pending") return; let n = 0; const t = setInterval(() => { if (++n > 60) clearInterval(t); else router.refresh(); }, 4000); return () => clearInterval(t); }, [mode, router]);
  const go = async (url: string, body: object, tag: string) => {
    setBusy(tag); setErr("");
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) }); const j = await r.json(); if (r.ok && j.checkoutUrl) location.assign(j.checkoutUrl); else if (r.ok) router.refresh(); else { setErr(j.error ?? "Something went wrong."); setBusy(""); } }
    catch { setErr("We couldn't reach the server. Nothing was charged."); setBusy(""); }
  };
  return (
    <div className="actions">
      {mode === "pay" && <>
        <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand the application-form fee of &#8358;5,000 is non-refundable{vocConfig.applicationFee.creditedToTuition ? ", and that it is deducted from my total fees" : " and separate from tuition"}.</label>
        <button className="pill" disabled={!ack || !!busy} onClick={() => go(`/api/applications/${refNo}/pay`, { acknowledged: ack }, "fee")}>{busy === "fee" ? "Redirecting to secure payment…" : payStatus === "failed" || payStatus === "expired" ? "Try payment again" : "Pay application-form fee"}</button></>}
      {invoice && !invoice.awaiting && <button className="pill" disabled={!!busy} onClick={() => go(`/api/applications/${refNo}/invoice/pay`, { invoice: invoice.number }, "inv")}>{busy === "inv" ? "Redirecting…" : `Pay outstanding ${invoice.outstanding}`}</button>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
