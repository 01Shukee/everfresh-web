import type { DeliveryZone, PickupLocation, PromoCode } from "../server/types";

// PLACEHOLDERS: the business has not supplied delivery zones, fees, pickup locations or scheduling rules.
// Delivery and pickup stay unavailable until these are filled in (or moved to the database/admin later).
export const ordering = {
  currency: "NGN" as const,
  limits: { maxQtyPerLine: 20, maxLines: 30, maxNoteLen: 140, maxInstructionsLen: 300 },
  scheduling: {
    enabled: true,        // business: scheduled orders are allowed
    leadMinutes: 60,      // PLACEHOLDER until the business supplies lead time
    maxDaysAhead: 7,      // PLACEHOLDER
    hours: null as null | { open: string; close: string }, // "HH:MM" Africa/Lagos; null = not restricted until supplied
  },
  zones: [] as DeliveryZone[],            // PLACEHOLDER: [{ id, name, feeKobo, minOrderKobo, active }]
  pickupLocations: [] as PickupLocation[], // PLACEHOLDER: [{ id, name, address, active }]
  promos: [] as PromoCode[],              // none defined
};
export type OrderingConfig = typeof ordering;
