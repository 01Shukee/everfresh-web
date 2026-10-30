import { normalisePhone } from "../validation";

export interface EnquiryInput {
  name: string; phone: string; email: string | null; eventType: string; eventDate: string; location: string; guests: number;
  style: string | null; menu: string | null; dietary: string | null; budgetKobo: number | null; additional: string | null;
}
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const multi = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");

/** Today's date in Africa/Lagos (UTC+1, no daylight saving) as YYYY-MM-DD. */
export const lagosToday = (now: Date) => new Date(now.getTime() + 3600_000).toISOString().slice(0, 10);
export function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false; const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
export function parseBudget(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).replace(/[\u20A6,\s]|NGN|N(?=\d)/gi, ""); if (s === "") return null;
  if (!/^\d{1,10}$/.test(s)) return "invalid"; return Number(s) * 100;
}
/** eventTypes: the categories the business serves. When none are configured, any non-empty event type is accepted. */
export function validateEnquiry(raw: unknown, now: Date, eventTypes: string[] | null): { ok: true; value: EnquiryInput } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {}; const r = isRec(raw) ? raw : {};
  const name = oneLine(r.name, 80); if (name.length < 2) e.name = "Enter your full name.";
  const phone = normalisePhone(r.phone); if (!phone) e.phone = "Enter a valid Nigerian mobile number, for example 0803 123 4567.";
  const email = oneLine(r.email, 120).toLowerCase(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Enter a valid email address, or leave it blank.";
  const eventType = oneLine(r.eventType, 80); if (!eventType) e.eventType = "Choose or enter the type of event."; else if (eventTypes && eventTypes.length && !eventTypes.includes(eventType)) e.eventType = "Choose one of the listed event types.";
  const eventDate = oneLine(r.eventDate, 40);
  if (!eventDate) e.eventDate = "Enter the event date."; else if (!validDate(eventDate)) e.eventDate = "Enter a valid date."; else {
    const today = lagosToday(now); const lim = new Date(today + "T00:00:00Z"); lim.setUTCFullYear(lim.getUTCFullYear() + 3); const max = lim.toISOString().slice(0, 10);
    if (eventDate < today) e.eventDate = "The event date can't be in the past."; else if (eventDate > max) e.eventDate = "Please choose a date within the next 3 years.";
  }
  const location = oneLine(r.location, 200); if (location.length < 3) e.location = "Enter where the event will take place.";
  const gRaw = typeof r.guests === "string" ? r.guests.replace(/[,\s]/g, "") : r.guests; const guests = typeof gRaw === "number" ? gRaw : /^\d{1,6}$/.test(String(gRaw ?? "")) ? Number(gRaw) : NaN;
  if (!Number.isInteger(guests) || guests < 1 || guests > 100_000) e.guests = "Enter the estimated number of guests (1 to 100,000).";
  const budget = parseBudget(r.budget); if (budget === "invalid") e.budget = "Enter the budget in naira as a whole number, for example 500000, or leave it blank.";
  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return { ok: true, value: { name, phone: phone!, email: email || null, eventType, eventDate, location, guests, style: oneLine(r.style, 80) || null, menu: multi(r.menu, 500) || null, dietary: multi(r.dietary, 500) || null, budgetKobo: budget === "invalid" ? null : budget, additional: multi(r.additional, 1500) || null } };
}
