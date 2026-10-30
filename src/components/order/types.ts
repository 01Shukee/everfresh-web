import type { MenuItem } from "@/server/types";
export type PublicItem = Omit<MenuItem, "active" | "createdAt" | "updatedAt" | "sort">;
export interface OrderingPublic {
  zones: { id: string; name: string; feeKobo: number; minOrderKobo: number }[];
  pickupLocations: { id: string; name: string; address: string }[];
  scheduling: { enabled: boolean; leadMinutes: number; maxDaysAhead: number; hours: { open: string; close: string } | null };
  limits: { maxQtyPerLine: number; maxNoteLen: number };
}
export interface QuoteView { lines: { itemId: string; qty: number; unitKobo: number; lineKobo: number }[]; subtotalKobo: number; deliveryFeeKobo: number; discountKobo: number; promoCode: string | null; totalKobo: number }
export interface QuoteIssue { code: string; message: string; line?: number }
