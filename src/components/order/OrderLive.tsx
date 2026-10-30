"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";

/** Polls the server (never trusts the redirect) while the payment is pending; clears the cart once paid; offers a safe retry. */
export function OrderLive({ number, token, paymentStatus, canRetry }: { number: string; token: string; paymentStatus: string; canRetry: boolean }) {
  const router = useRouter(); const { clear } = useCart(); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (paymentStatus === "paid") clear(); }, [paymentStatus, clear]);
  useEffect(() => { if (paymentStatus !== "pending") return; let n = 0; const t = setInterval(() => { if (++n > 60) clearInterval(t); else router.refresh(); }, 4000); return () => clearInterval(t); }, [paymentStatus, router]);
  const retry = async () => {
    setBusy(true); setErr("");
    try { const r = await fetch(`/api/orders/${number}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const j = await r.json(); if (r.ok && j.checkoutUrl) location.assign(j.checkoutUrl); else { setErr(j.error ?? "Could not restart payment."); setBusy(false); } }
    catch { setErr("Could not reach the server."); setBusy(false); }
  };
  if (!canRetry) return null;
  return <div><button className="pill" onClick={retry} disabled={busy}>{busy ? "Starting payment…" : "Try payment again"}</button>{err && <p className="err" role="alert">{err}</p>}</div>;
}
