import type { OrderingConfig } from "../config/ordering";

export interface CheckoutInput {
  idempotencyKey: string;
  customer: { name: string; phone: string; email: string };
  fulfilment: { type: "delivery" | "pickup"; zoneId: string | null; pickupLocationId: string | null; address: string | null; instructions: string | null; scheduledFor: string | null };
  lines: unknown[]; promoCode: string | null;
}
export type ValidationResult = { ok: true; value: CheckoutInput } | { ok: false; fieldErrors: Record<string, string> };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() : "");

export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s\-().]/g, "");
  const m = /^(?:\+234|234|0)([789][01]\d{8})$/.exec(s);
  return m ? `+234${m[1]}` : null;
}

/** Hour/minute in Africa/Lagos (UTC+1, no daylight saving). */
function lagosMinutes(d: Date) { const t = new Date(d.getTime() + 3600_000); return t.getUTCHours() * 60 + t.getUTCMinutes(); }
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function validateCheckout(raw: unknown, now: Date, cfg: OrderingConfig): ValidationResult {
  const e: Record<string, string> = {};
  if (!isRec(raw)) return { ok: false, fieldErrors: { form: "Invalid request." } };
  const c = isRec(raw.customer) ? raw.customer : {};
  const f = isRec(raw.fulfilment) ? raw.fulfilment : {};

  const key = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) e.idempotencyKey = "Missing or invalid request key.";
  const name = clean(c.name);
  if (name.length < 2 || name.length > 80) e.name = "Enter your full name (2 to 80 characters).";
  const phone = normalisePhone(c.phone);
  if (!phone) e.phone = "Enter a valid Nigerian mobile number, for example 0803 123 4567.";
  const email = clean(c.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) e.email = "Enter a valid email address for your receipt.";

  const type = f.type === "delivery" || f.type === "pickup" ? f.type : null;
  if (!type) e.fulfilmentType = "Choose delivery or pickup.";
  let address: string | null = null;
  if (type === "delivery") {
    address = clean(f.address);
    if (address.length < 10 || address.length > 250) e.address = "Enter your full delivery address (10 to 250 characters).";
  }
  const instructions = clean(f.instructions).slice(0, cfg.limits.maxInstructionsLen) || null;

  let scheduledFor: string | null = null;
  if (f.scheduledFor !== undefined && f.scheduledFor !== null && f.scheduledFor !== "") {
    const d = typeof f.scheduledFor === "string" ? new Date(f.scheduledFor) : new Date(NaN);
    const s = cfg.scheduling;
    if (!s.enabled) e.scheduledFor = "Scheduled orders are not available.";
    else if (Number.isNaN(d.getTime())) e.scheduledFor = "Choose a valid date and time.";
    else if (d.getTime() < now.getTime() + s.leadMinutes * 60_000) e.scheduledFor = `Choose a time at least ${s.leadMinutes} minutes from now.`;
    else if (d.getTime() > now.getTime() + s.maxDaysAhead * 86_400_000) e.scheduledFor = `Orders can be scheduled up to ${s.maxDaysAhead} days ahead.`;
    else if (s.hours && (lagosMinutes(d) < hm(s.hours.open) || lagosMinutes(d) > hm(s.hours.close))) e.scheduledFor = `Choose a time between ${s.hours.open} and ${s.hours.close}.`;
    else scheduledFor = d.toISOString();
  }
  if (!Array.isArray(raw.lines)) e.lines = "Your cart is empty.";
  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return {
    ok: true,
    value: {
      idempotencyKey: key, customer: { name, phone: phone!, email },
      fulfilment: { type: type!, zoneId: typeof f.zoneId === "string" ? f.zoneId : null, pickupLocationId: typeof f.pickupLocationId === "string" ? f.pickupLocationId : null, address, instructions, scheduledFor },
      lines: raw.lines as unknown[], promoCode: typeof raw.promoCode === "string" && raw.promoCode.trim() ? raw.promoCode.trim() : null,
    },
  };
}
