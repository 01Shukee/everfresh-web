export type EnqStatus = "new" | "contacted" | "quote_in_progress" | "quote_sent" | "confirmed" | "on_hold" | "lost" | "completed";
export const ENQ_STATUSES: EnqStatus[] = ["new", "contacted", "quote_in_progress", "quote_sent", "confirmed", "on_hold", "lost", "completed"];
export interface Enquiry {
  ref: string; token: string; idempotencyKey: string;
  name: string; phone: string; email: string | null; eventType: string; eventDate: string; location: string; guests: number;
  style: string | null; menu: string | null; dietary: string | null; budgetKobo: number | null; additional: string | null;
  status: EnqStatus;
  /** We can only know the message was PREPARED and the button pressed. WhatsApp never tells us if Send was pressed. */
  whatsapp: { preparedAt: string | null; openedAt: string | null; openedCount: number; staffConfirmedAt: string | null };
  notes: { id: string; at: string; text: string }[];
  contacts: { id: string; at: string; method: "call" | "whatsapp" | "email" | "visit" | "other"; direction: "outbound" | "inbound"; summary: string }[];
  quotes: { id: string; at: string; status: "draft" | "sent" | "accepted" | "declined"; amountKobo: number | null; note: string }[];
  history: { at: string; status: EnqStatus; note: string | null }[];
  createdAt: string; updatedAt: string;
}
export interface CateringContent {
  categories: { id: string; name: string; description: string | null; published: boolean }[];
  services: { id: string; name: string; description: string; published: boolean }[];
  styles: string[];
}
export interface GalleryItem { id: string; kind: "food" | "event"; title: string; caption: string; imageUrl: string; imageAlt: string; published: boolean; sort: number }
export const emptyCateringContent = (): CateringContent => ({ categories: [], services: [], styles: [] });
