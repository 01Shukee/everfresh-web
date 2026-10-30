"use client";
import { useEffect, useState } from "react";
import { decimalToKobo, koboToDecimal } from "@/lib/money";
import { parseLines } from "@/lib/voc-text";
import { api } from "./shared";

const n = (k: number) => koboToDecimal(k).replace(/\.00$/, "");
const yes = (b: boolean) => (b ? "yes" : "no");
export function AdminFoodSettings() {
  const [f, setF] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/admin/food/settings").then((r) => { if (!r.ok) return; const c = r.json; setF({
    zones: c.zones.map((z: any) => `${z.name} | ${n(z.feeKobo)} | ${n(z.minOrderKobo)} | ${yes(z.active)}`).join("\n"), pickups: c.pickupLocations.map((p: any) => `${p.name} | ${p.address} | ${yes(p.active)}`).join("\n"),
    promos: c.promos.map((p: any) => `${p.code} | ${p.type} | ${p.type === "fixed" ? n(p.value) : p.value} | ${n(p.minOrderKobo)} | ${p.maxDiscountKobo ? n(p.maxDiscountKobo) : ""} | ${p.expiresAt ? p.expiresAt.slice(0, 10) : ""} | ${yes(p.active)}`).join("\n"),
    enabled: c.scheduling.enabled, lead: String(c.scheduling.leadMinutes), days: String(c.scheduling.maxDaysAhead), open: c.scheduling.hours?.open ?? "", close: c.scheduling.hours?.close ?? "" }); }); }, []);
  if (!f) return <p role="status">Loading…</p>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const bad = (m: string) => setMsg(m); const k = (s: string) => decimalToKobo((s ?? "").replace(/[₦,\s]/g, ""));
    const zones = []; for (const l of parseLines(f.zones)) { const [name, fee, min, act] = l.split("|").map((x: string) => x.trim()); const a = k(fee), b = k(min || "0"); if (!name || a === null || b === null) return bad(`Delivery line "${l}": use "Name | fee in ₦ | minimum order in ₦ | yes/no".`); zones.push({ name, feeKobo: a, minOrderKobo: b, active: (act ?? "yes").toLowerCase() !== "no" }); }
    const pickupLocations = []; for (const l of parseLines(f.pickups)) { const [name, address, act] = l.split("|").map((x: string) => x.trim()); if (!name || !address) return bad(`Pickup line "${l}": use "Name | address | yes/no".`); pickupLocations.push({ name, address, active: (act ?? "yes").toLowerCase() !== "no" }); }
    const promos = []; for (const l of parseLines(f.promos)) { const [code, type, val, min, max, exp, act] = l.split("|").map((x: string) => x.trim()); const v = type === "fixed" ? k(val) : /^\d+$/.test(val ?? "") ? Number(val) : null; const m = k(min || "0"); const mx = max ? k(max) : null; if (!code || !["percent", "fixed"].includes(type) || v === null || m === null || (max && mx === null)) return bad(`Promo line "${l}": use "CODE | percent or fixed | value | minimum order ₦ | max discount ₦ (optional) | expires YYYY-MM-DD (optional) | yes/no".`); promos.push({ code, type, value: v, minOrderKobo: m, ...(mx ? { maxDiscountKobo: mx } : {}), ...(exp ? { expiresAt: exp } : {}), active: (act ?? "yes").toLowerCase() !== "no" }); }
    const r = await api("/api/admin/food/settings", "PUT", { zones, pickupLocations, promos, scheduling: { enabled: f.enabled, leadMinutes: Number(f.lead), maxDaysAhead: Number(f.days), hours: f.open && f.close ? { open: f.open, close: f.close } : null } });
    setMsg(r.ok ? "Saved. Checkout now uses these settings." : r.json.error);
  };
  const T = (k: string, label: string, rows: number, hint?: string) => <div className="field"><label htmlFor={`fs-${k}`}>{label}</label><textarea id={`fs-${k}`} rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <p className="hint">{hint}</p>}</div>;
  return (
    <form className="adminform" onSubmit={save} aria-label="Delivery and pickup settings"><h2 className="serif">Delivery and pickup</h2>{msg && <p className="alert" role="status">{msg}</p>}
      <p className="hint">Customers can only choose delivery if at least one area is active, and pickup if at least one location is active. Nothing is assumed: add only what Everfresh really offers.</p>
      {T("zones", "Delivery areas (Name | delivery fee ₦ | minimum order ₦ | yes/no)", 4)}{T("pickups", "Pickup locations (Name | address | yes/no)", 3)}
      <fieldset><legend className="lab">Scheduled orders</legend><label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Allow customers to schedule orders for later</label>
        <div className="grid-f"><div className="field"><label htmlFor="fs-lead">Minimum notice (minutes)</label><input id="fs-lead" inputMode="numeric" value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} /></div><div className="field"><label htmlFor="fs-days">How many days ahead</label><input id="fs-days" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></div>
          <div className="field"><label htmlFor="fs-open">Order times: from (HH:MM, optional)</label><input id="fs-open" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} placeholder="09:00" /></div><div className="field"><label htmlFor="fs-close">to (HH:MM)</label><input id="fs-close" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} placeholder="20:00" /></div></div></fieldset>
      {T("promos", "Promo codes (CODE | percent or fixed | value | minimum order ₦ | max discount ₦ | expires YYYY-MM-DD | yes/no). Leave empty for none.", 3)}
      <button className="pill sm">Save</button></form>
  );
}
