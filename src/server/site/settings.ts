import { randomUUID } from "node:crypto";
import { site } from "../../config/site";
import { normaliseWhatsAppNumber } from "../catering/whatsapp";
import type { Repo } from "../repo";

export interface Img { url: string; alt: string }
export interface SiteSettings {
  business: { name: string; legalName: string; tagline: string; description: string | null; notifyEmail: string | null };
  contact: { phone: string | null; email: string | null; address: string | null; city: string | null; hours: string[]; whatsapp: string | null; mapConfirmed: boolean; social: { label: string; url: string }[] };
  about: { intro: string | null; mission: string | null; values: string[]; history: string | null; foodInfo: string | null; vocationalInfo: string | null; cateringInfo: string | null; credentials: string[]; photos: { id: string; url: string; alt: string; caption: string }[] };
  homepage: { benefits: string[]; heroImages: { food: Img | null; studies: Img | null; catering: Img | null }; featured: { id: string; kind: "food" | "project" | "event" | "student"; title: string; caption: string; url: string; alt: string }[] };
  brand: { logoUrl: string | null; logoAlt: string; emblemUrl: string | null; faviconUrl: string | null };
  faqs: { id: string; q: string; a: string; published: boolean; sort: number }[];
}
export const SECTIONS = ["business", "contact", "about", "homepage", "brand", "faqs"] as const;
export type Section = (typeof SECTIONS)[number];
export const defaultSettings = (): SiteSettings => ({
  business: { name: site.name, legalName: site.legalName, tagline: site.tagline, description: null, notifyEmail: null },
  contact: { phone: site.contact.phone, email: site.contact.email, address: site.contact.address, city: site.contact.city, hours: site.contact.hours ? [site.contact.hours] : [], whatsapp: site.contact.whatsappDigits, mapConfirmed: false, social: [] },
  about: { intro: null, mission: null, values: [], history: null, foodInfo: null, vocationalInfo: null, cateringInfo: null, credentials: [], photos: [] },
  homepage: { benefits: [], heroImages: { food: null, studies: null, catering: null }, featured: [] },
  brand: { logoUrl: null, logoAlt: "Everfresh logo", emblemUrl: null, faviconUrl: null },
  faqs: [],
});
/** Stored sections override the defaults; a section that was never saved keeps its default. */
export async function getSettings(repo: Repo): Promise<SiteSettings> { const st = (await repo.docGet<Partial<SiteSettings>>("site", "main")) ?? {}; const d = defaultSettings(); return { ...d, ...Object.fromEntries(SECTIONS.filter((k) => st[k] !== undefined).map((k) => [k, st[k]])) } as SiteSettings; }
export const whatsappFrom = (s: SiteSettings) => normaliseWhatsAppNumber(s.contact.whatsapp);

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const lines = (v: unknown, n: number, m: number) => (Array.isArray(v) ? v.map((x) => t(x, m)).filter(Boolean).slice(0, n) : []);
export const imgOk = (v: unknown): string | null => { const x = t(v, 400); return /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s]+)$/.test(x) ? x : null; };
const isRec = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const img = (v: any): R<Img | null> => { if (!v || !isRec(v) || !t(v.url, 400)) return { ok: true, value: null }; const u = imgOk(v.url); if (!u) return { ok: false, error: "Image must be an uploaded file, a /media/... path or an https:// URL." }; if (!t(v.alt, 140)) return { ok: false, error: "Add alt text describing each image." }; return { ok: true, value: { url: u, alt: t(v.alt, 140) } }; };

export function validateSection(section: Section, input: unknown): R<unknown> {
  const raw: any = input;
  if (!isRec(raw) && section !== "faqs") return { ok: false, error: "Invalid content." };
  switch (section) {
    case "business": { const name = t(raw.name, 80), legalName = t(raw.legalName, 120); if (name.length < 2 || legalName.length < 2) return { ok: false, error: "Enter the business name and legal name." }; const ne = t(raw.notifyEmail, 120).toLowerCase() || null; if (ne && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ne)) return { ok: false, error: "Enter a valid notification email address, or leave it blank." }; return { ok: true, value: { name, legalName, tagline: t(raw.tagline, 80), description: t(raw.description, 800) || null, notifyEmail: ne } }; }
    case "contact": {
      const phone = t(raw.phone, 30) || null; if (phone && !/^\+?[\d\s()-]{7,22}$/.test(phone)) return { ok: false, error: "Enter the phone number using digits, spaces and + only." };
      const email = t(raw.email, 120).toLowerCase() || null; if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Enter a valid email address." };
      const waRaw = t(raw.whatsapp, 30); const whatsapp = waRaw ? normaliseWhatsAppNumber(waRaw) : null; if (waRaw && !whatsapp) return { ok: false, error: "Enter the WhatsApp number with its country code, for example +234 803 123 4567." };
      const address = t(raw.address, 250) || null; if (raw.mapConfirmed === true && !address) return { ok: false, error: "Enter the address before turning on the map link." };
      const social = (Array.isArray(raw.social) ? raw.social : []).slice(0, 8).map((x: any) => ({ label: t(x?.label, 40), url: t(x?.url, 300) })); if (social.some((x: any) => !x.label || !/^https:\/\/[^\s]+$/.test(x.url))) return { ok: false, error: "Each social link needs a label and an https:// address." };
      return { ok: true, value: { phone, email, address, city: t(raw.city, 80) || null, hours: lines(raw.hours, 14, 80), whatsapp, mapConfirmed: raw.mapConfirmed === true, social } };
    }
    case "about": {
      const photos = (Array.isArray(raw.photos) ? raw.photos : []).slice(0, 12).map((p: any) => ({ id: t(p?.id, 40) || randomUUID(), url: imgOk(p?.url) ?? "", alt: t(p?.alt, 140), caption: t(p?.caption, 200) }));
      if (photos.some((p: any) => !p.url || !p.alt)) return { ok: false, error: "Each About photo needs a valid image and alt text." };
      return { ok: true, value: { intro: t(raw.intro, 2000) || null, mission: t(raw.mission, 1000) || null, values: lines(raw.values, 12, 160), history: t(raw.history, 4000) || null, foodInfo: t(raw.foodInfo, 1500) || null, vocationalInfo: t(raw.vocationalInfo, 1500) || null, cateringInfo: t(raw.cateringInfo, 1500) || null, credentials: lines(raw.credentials, 10, 200), photos } };
    }
    case "homepage": {
      const hi: any = {}; for (const k of ["food", "studies", "catering"]) { const r = img(raw.heroImages?.[k]); if (!r.ok) return r; hi[k] = r.value; }
      const featured = (Array.isArray(raw.featured) ? raw.featured : []).slice(0, 12).map((f: any) => ({ id: t(f?.id, 40) || randomUUID(), kind: f?.kind, title: t(f?.title, 100), caption: t(f?.caption, 200), url: imgOk(f?.url) ?? "", alt: t(f?.alt, 140) }));
      if (featured.some((f: any) => !["food", "project", "event", "student"].includes(f.kind) || !f.title || !f.url || !f.alt)) return { ok: false, error: "Each featured item needs a type, title, image and alt text." };
      return { ok: true, value: { benefits: lines(raw.benefits, 8, 160), heroImages: hi, featured } };
    }
    case "brand": { const o: any = { logoAlt: t(raw.logoAlt, 140) || "Everfresh logo" }; for (const k of ["logoUrl", "emblemUrl", "faviconUrl"]) { const v = t(raw[k], 400); if (v && !imgOk(v)) return { ok: false, error: "Brand images must be an uploaded file, a /media/... path or an https:// URL." }; o[k] = v || null; } return { ok: true, value: o }; }
    case "faqs": { const l = (Array.isArray(raw) ? raw : raw?.faqs); if (!Array.isArray(l)) return { ok: false, error: "Invalid FAQs." }; const f = l.slice(0, 30).map((x: any, i: number) => ({ id: t(x?.id, 40) || randomUUID(), q: t(x?.q, 200), a: t(x?.a, 1500), published: x?.published === true, sort: Number.isInteger(x?.sort) ? x.sort : i })); if (f.some((x) => !x.q || !x.a)) return { ok: false, error: "Each FAQ needs a question and an answer." }; return { ok: true, value: f }; }
  }
}
export async function saveSection(repo: Repo, section: Section, raw: unknown): Promise<R<unknown>> {
  const v = validateSection(section, raw); if (!v.ok) return v; const st = (await repo.docGet<Record<string, unknown>>("site", "main")) ?? {}; st[section] = v.value; await repo.docPut("site", "main", st); return v;
}
