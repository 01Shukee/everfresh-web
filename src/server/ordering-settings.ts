import { ordering, type OrderingConfig } from "../config/ordering";
import type { Repo } from "./repo";
import type { DeliveryZone, PickupLocation, PromoCode } from "./types";

/** Delivery, pickup, scheduling and promo settings are stored in the database and edited in Admin > Food > Delivery and pickup. The config file only supplies empty defaults. */
export async function getOrderingConfig(repo: Repo): Promise<OrderingConfig> {
  const s = await repo.docGet<Partial<Pick<OrderingConfig, "zones" | "pickupLocations" | "scheduling" | "promos">>>("settings", "ordering");
  return { ...ordering, zones: s?.zones ?? ordering.zones, pickupLocations: s?.pickupLocations ?? ordering.pickupLocations, scheduling: s?.scheduling ?? ordering.scheduling, promos: s?.promos ?? ordering.promos };
}
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const kobo = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_00 ? v : null);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
const hhmm = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
type R = { ok: true; value: Pick<OrderingConfig, "zones" | "pickupLocations" | "scheduling" | "promos"> } | { ok: false; error: string };

export function validateOrderingSettings(raw: any): R {
  const bad = (error: string): R => ({ ok: false, error }); if (!raw || typeof raw !== "object") return bad("Invalid settings.");
  const zones: DeliveryZone[] = (Array.isArray(raw.zones) ? raw.zones : []).slice(0, 30).map((z: any) => ({ id: slug(t(z?.name, 60)), name: t(z?.name, 60), feeKobo: kobo(z?.feeKobo) ?? -1, minOrderKobo: kobo(z?.minOrderKobo) ?? -1, active: z?.active !== false }));
  if (zones.some((z) => !z.name || z.feeKobo < 0 || z.minOrderKobo < 0)) return bad("Each delivery area needs a name, a delivery fee (0 or more) and a minimum order (0 or more).");
  if (new Set(zones.map((z) => z.id)).size !== zones.length) return bad("Delivery area names must be different.");
  const pickupLocations: PickupLocation[] = (Array.isArray(raw.pickupLocations) ? raw.pickupLocations : []).slice(0, 20).map((p: any) => ({ id: slug(t(p?.name, 60)), name: t(p?.name, 60), address: t(p?.address, 200), active: p?.active !== false }));
  if (pickupLocations.some((p) => !p.name || !p.address)) return bad("Each pickup location needs a name and an address."); if (new Set(pickupLocations.map((p) => p.id)).size !== pickupLocations.length) return bad("Pickup location names must be different.");
  const s = raw.scheduling ?? {}; const lead = Number(s.leadMinutes), days = Number(s.maxDaysAhead); if (!Number.isInteger(lead) || lead < 0 || lead > 10_080 || !Number.isInteger(days) || days < 1 || days > 60) return bad("Lead time must be 0 to 10080 minutes and days ahead 1 to 60.");
  let hours: { open: string; close: string } | null = null; if (s.hours) { const o = hhmm(s.hours.open), c = hhmm(s.hours.close); if (!o || !c || o >= c) return bad("Ordering hours must be HH:MM, with opening before closing."); hours = { open: o, close: c }; }
  const promos: PromoCode[] = (Array.isArray(raw.promos) ? raw.promos : []).slice(0, 30).map((p: any) => ({ code: t(p?.code, 20).toUpperCase(), type: p?.type, value: Number(p?.value), minOrderKobo: kobo(p?.minOrderKobo) ?? -1, ...(p?.maxDiscountKobo ? { maxDiscountKobo: kobo(p.maxDiscountKobo) ?? -1 } : {}), active: p?.active !== false, ...(p?.expiresAt ? { expiresAt: t(p.expiresAt, 10) } : {}) }));
  for (const p of promos) { if (!/^[A-Z0-9]{3,20}$/.test(p.code) || !["percent", "fixed"].includes(p.type) || !Number.isInteger(p.value) || p.value <= 0 || (p.type === "percent" && p.value > 100) || p.minOrderKobo < 0 || (p.maxDiscountKobo !== undefined && p.maxDiscountKobo < 0) || (p.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt))) return bad(`Promo code "${p.code || "?"}" is not valid: use 3 to 20 letters/numbers, a type, a positive value (percent up to 100) and a valid expiry date.`); }
  if (new Set(promos.map((p) => p.code)).size !== promos.length) return bad("Promo codes must be different.");
  return { ok: true, value: { zones, pickupLocations, scheduling: { enabled: s.enabled !== false, leadMinutes: lead, maxDaysAhead: days, hours }, promos: promos.map((p) => (p.expiresAt ? { ...p, expiresAt: `${p.expiresAt}T23:59:59+01:00` } : p)) } };
}
export async function saveOrderingSettings(repo: Repo, raw: unknown) { const v = validateOrderingSettings(raw); if (!v.ok) return v; await repo.docPut("settings", "ordering", v.value); return v; }
