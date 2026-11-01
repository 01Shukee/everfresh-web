"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNaira } from "@/lib/money";
import { useCart } from "./CartProvider";
import type { OrderingPublic, QuoteIssue, QuoteView } from "./types";

type FErr = Record<string, string>;
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const keyFor = (fp: string) => {   // same checkout content => same idempotency key (double clicks, refreshes); changed content => new key
  const k = `ef-idem-${hash(fp)}`;
  try { let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem(k, v); } return v; } catch { return crypto.randomUUID().replace(/-/g, ""); }
};

/** Declared at module level on purpose: a component created inside the form's render gets a new identity on every keystroke, so React remounts the input and it loses focus. */
function F({ id, label, err, children }: { id: string; label: string; err?: string; children: React.ReactNode }) {
  return (<div className={`field ${err ? "bad" : ""}`}><label htmlFor={id}>{label}</label>{children}{err && <p className="err" id={`${id}-e`}>{err}</p>}</div>);
}

export function CheckoutForm() {
  const { lines, ready, issues: cartIssues } = useCart();
  const [o, setO] = useState<OrderingPublic | null>(null); const [loadErr, setLoadErr] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [type, setType] = useState<"delivery" | "pickup" | "">(""); const [zoneId, setZoneId] = useState(""); const [pickupId, setPickupId] = useState("");
  const [address, setAddress] = useState(""); const [instr, setInstr] = useState(""); const [when, setWhen] = useState<"asap" | "later">("asap"); const [at, setAt] = useState("");
  const [promo, setPromo] = useState(""); const [errs, setErrs] = useState<FErr>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null); const [qIssues, setQIssues] = useState<QuoteIssue[]>([]);
  const summary = useRef<HTMLDivElement>(null); const [tick, setTick] = useState(0);
  useEffect(() => { if (tick) summary.current?.focus(); }, [tick]);

  useEffect(() => { fetch("/api/menu").then((r) => r.json()).then((j) => { setO(j.ordering); setType(j.ordering.pickupLocations.length ? "pickup" : j.ordering.zones.length ? "delivery" : ""); }).catch(() => setLoadErr(true)); }, []);
  useEffect(() => { if (o && !pickupId && o.pickupLocations.length === 1) setPickupId(o.pickupLocations[0].id); }, [o, pickupId]);

  const fulfilment = useMemo(() => (type ? { type, zoneId: type === "delivery" ? zoneId || null : null, pickupLocationId: type === "pickup" ? pickupId || null : null } : undefined), [type, zoneId, pickupId]);
  const cartLines = useMemo(() => lines.map(({ itemId, variantId, addOnIds, qty, note }) => ({ itemId, variantId, addOnIds, qty, note })), [lines]);
  useEffect(() => {
    if (!ready || !cartLines.length || !fulfilment) return; const c = new AbortController();
    const t = setTimeout(async () => { try { const r = await fetch("/api/quote", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: cartLines, fulfilment, promoCode: promo || null }) }); const j = await r.json(); if (r.ok) { setQuote(j); setQIssues([]); } else { setQuote(null); setQIssues(j.errors ?? []); } } catch { /* aborted */ } }, 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [ready, cartLines, fulfilment, promo]);

  if (!ready || (!o && !loadErr)) return <p role="status" className="lab green">Loading checkout&hellip;</p>;
  if (loadErr) return <div className="empty" role="alert"><p className="serif empty-title">We couldn&rsquo;t load checkout.</p><button className="pill sm" onClick={() => location.reload()}>Try again</button></div>;
  if (!lines.length) return <div className="empty"><p className="serif empty-title">Your cart is empty.</p><Link href="/order-food" className="pill sm">Browse the menu</Link></div>;
  if (!o || !type) return <div className="empty" role="status"><p className="serif empty-title">Ordering isn&rsquo;t open yet.</p><p>Delivery areas and pickup locations haven&rsquo;t been set up, so orders can&rsquo;t be placed online right now.</p></div>;

  const minLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setErrs({}); setMsg("");
    const payload = { customer: { name, phone, email }, fulfilment: { type, zoneId: fulfilment?.zoneId, pickupLocationId: fulfilment?.pickupLocationId, address: type === "delivery" ? address : null, instructions: instr || null, scheduledFor: when === "later" && at ? new Date(at).toISOString() : null }, lines: cartLines, promoCode: promo || null };
    setBusy(true);
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: keyFor(JSON.stringify(payload)) }) });
      const j = await r.json();
      if (r.ok) { location.assign(j.checkoutUrl ?? `/order/${j.orderNumber}/${j.token}`); return; }
      if (j.fieldErrors) { setErrs(j.fieldErrors); setMsg("Please check the highlighted fields."); }
      else setMsg(j.error ?? "Something went wrong. Nothing was charged.");
      if (j.errors) setQIssues(j.errors);
      setBusy(false); setTick((n) => n + 1);
    } catch { setMsg("We couldn't reach the server. Nothing was charged. Please try again."); setBusy(false); setTick((n) => n + 1); }
  };
  const total = quote?.totalKobo; const blocked = qIssues.length > 0 || cartIssues.length > 0 || !quote;

  return (
    <form className="checkout" onSubmit={submit} noValidate>
      <div className="co-main">
        {msg && <div ref={summary} tabIndex={-1} className="alert" role="alert">{msg}{Object.entries(errs).length > 0 && <ul>{Object.entries(errs).map(([k, v]) => <li key={k}>{v}</li>)}</ul>}</div>}
        <fieldset><legend className="serif">1. Your details</legend>
          <F id="name" label="Full name" err={errs.name}><input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errs.name} aria-describedby={errs.name ? "name-e" : undefined} required /></F>
          <F id="phone" label="Phone number" err={errs.phone}><input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errs.phone} aria-describedby={errs.phone ? "phone-e" : undefined} required /></F>
          <F id="email" label="Email address (for your receipt)" err={errs.email}><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errs.email} aria-describedby={errs.email ? "email-e" : undefined} required /></F>
        </fieldset>
        <fieldset><legend className="serif">2. Delivery or pickup</legend>
          <div className="seg" role="radiogroup" aria-label="Fulfilment">
            {o.zones.length > 0 && <label className={type === "delivery" ? "on" : ""}><input type="radio" name="ft" checked={type === "delivery"} onChange={() => setType("delivery")} />Delivery</label>}
            {o.pickupLocations.length > 0 && <label className={type === "pickup" ? "on" : ""}><input type="radio" name="ft" checked={type === "pickup"} onChange={() => setType("pickup")} />Pickup</label>}
          </div>
          {type === "delivery" && <>
            <F id="zone" label="Delivery area" err={qIssues.find((x) => x.code === "ZONE_INVALID" || x.code === "MIN_ORDER")?.message}><select id="zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required><option value="">Choose an area</option>{o.zones.map((z) => <option key={z.id} value={z.id}>{z.name} ({formatNaira(z.feeKobo)})</option>)}</select></F>
            <F id="address" label="Delivery address" err={errs.address}><textarea id="address" rows={3} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={!!errs.address} /></F>
            <F id="instr" label="Delivery instructions (optional)"><textarea id="instr" rows={2} maxLength={300} value={instr} onChange={(e) => setInstr(e.target.value)} /></F></>}
          {type === "pickup" && <F id="pickup" label="Pickup location"><select id="pickup" value={pickupId} onChange={(e) => setPickupId(e.target.value)} required><option value="">Choose a location</option>{o.pickupLocations.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.address}</option>)}</select></F>}
          {o.scheduling.enabled && <div className="field"><span className="lab">When</span><div className="seg"><label className={when === "asap" ? "on" : ""}><input type="radio" name="w" checked={when === "asap"} onChange={() => setWhen("asap")} />As soon as possible</label><label className={when === "later" ? "on" : ""}><input type="radio" name="w" checked={when === "later"} onChange={() => setWhen("later")} />Schedule for later</label></div>
            {when === "later" && <><label htmlFor="at" className="sr">Date and time</label><input id="at" type="datetime-local" value={at} min={minLocal(new Date(Date.now() + o.scheduling.leadMinutes * 60000))} max={minLocal(new Date(Date.now() + o.scheduling.maxDaysAhead * 86400000))} onChange={(e) => setAt(e.target.value)} aria-invalid={!!errs.scheduledFor} />{errs.scheduledFor && <p className="err">{errs.scheduledFor}</p>}<p className="hint">At least {o.scheduling.leadMinutes} minutes ahead, up to {o.scheduling.maxDaysAhead} days.</p></>}</div>}
        </fieldset>
      </div>
      <aside className="co-side" aria-label="Order summary">
        <h2 className="serif">Order summary</h2>
        <ul className="cartlines compact">{lines.map((l, i) => <li key={l.key}><span>{l.qty} × {l.name}<span className="small dim0 block">{l.label}</span></span><span className="tab">{quote ? formatNaira(quote.lines[i]?.lineKobo ?? 0) : "..."}</span></li>)}</ul>
        <label className="field promo"><span className="lab">Promo code</span><input value={promo} onChange={(e) => setPromo(e.target.value)} autoComplete="off" /></label>
        <div className="totals" aria-live="polite">
          {qIssues.map((x) => <p key={x.message} className="err" role="alert">{x.message}</p>)}
          <div><span>Subtotal</span><span className="tab">{quote ? formatNaira(quote.subtotalKobo) : "..."}</span></div>
          {quote && quote.discountKobo > 0 && <div><span>Discount</span><span className="tab">-{formatNaira(quote.discountKobo)}</span></div>}
          <div><span>Delivery</span><span className="tab">{type === "pickup" ? "Free (pickup)" : quote ? formatNaira(quote.deliveryFeeKobo) : "Choose an area"}</span></div>
          <div className="grand"><span>Total to pay</span><span className="tab">{total !== undefined ? formatNaira(total) : "..."}</span></div>
        </div>
        <button className="pill block" type="submit" disabled={busy || blocked}>{busy ? "Redirecting to secure payment…" : "Pay securely"}</button>
        <p className="small dim0">You&rsquo;ll pay on Bachs&rsquo; secure page. Your order is confirmed only after the payment is verified.</p>
      </aside>
    </form>
  );
}