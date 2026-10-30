import { formatNaira } from "../../lib/money";
import type { Enquiry } from "./model";

/** Digits-only international number for wa.me. Accepts "+234 803 123 4567", "0803 123 4567", "2348031234567". Returns null if not plausible. */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null; let d = raw.replace(/[\s\-().+]/g, ""); if (!/^\d+$/.test(d)) return null;
  if (/^0[789]\d{9}$/.test(d)) d = "234" + d.slice(1);       // Nigerian local format
  if (d.startsWith("0")) return null;                          // wa.me needs the country code, no leading zero
  return d.length >= 8 && d.length <= 15 ? d : null;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

export const WA_MAX_ENCODED = 1800; // keep the whole wa.me link comfortably short for every browser/app

const fields = (e: Enquiry, trim: number): [string, string | null][] => {
  const cut = (v: string | null, n: number) => (v && v.length > n ? v.slice(0, n).trimEnd() + "\u2026" : v);
  return [
    ["Enquiry Reference", e.ref], ["Customer Name", e.name], ["Phone Number", e.phone], ["Email", e.email], ["Event Type", e.eventType], ["Event Date", longDate(e.eventDate)],
    ["Event Location", e.location], ["Number of Guests", String(e.guests)], ["Catering Style", e.style], ["Preferred Menu", cut(e.menu, trim)], ["Dietary Requirements", cut(e.dietary, trim)],
    ["Estimated Budget", e.budgetKobo === null ? null : formatNaira(e.budgetKobo)], ["Additional Information", cut(e.additional, trim)],
  ];
};
/** The approved message structure. Only fields the customer supplied are included. */
export function buildMessage(e: Enquiry, trim = 4000): string {
  return "NEW CATERING QUOTATION REQUEST\n\n" + fields(e, trim).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
}
export interface WaLink { message: string; url: string | null; truncated: boolean }
/** Builds the message and the wa.me link. If the encoded link would be too long, free-text fields are shortened in the MESSAGE only (the saved enquiry is never shortened). */
export function buildWhatsApp(e: Enquiry, digits: string | null): WaLink {
  let trim = 4000, msg = buildMessage(e, trim), enc = encodeURIComponent(msg), truncated = false;
  while (enc.length > WA_MAX_ENCODED && trim > 40) { trim = Math.floor(trim * 0.7); msg = buildMessage(e, trim); enc = encodeURIComponent(msg); truncated = true; }
  if (enc.length > WA_MAX_ENCODED) { msg = buildMessage({ ...e, menu: null, dietary: null, additional: null }, 0) + "\n(Further details are saved under this reference.)"; enc = encodeURIComponent(msg); truncated = true; }
  return { message: msg, url: digits ? `https://wa.me/${digits}?text=${enc}` : null, truncated };
}
