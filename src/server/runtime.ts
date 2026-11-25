import { getOrderingConfig } from "./ordering-settings";
import { BachsGateway, type PaymentGateway } from "./gateway";
import { MemoryRepo, type Repo } from "./repo";
import type { OrderDeps } from "./orders";
import type { VocDeps } from "./voc/applications";
import type { CatDeps } from "./catering/service";
import { site } from "../config/site";

const g = globalThis as unknown as { __efRepo?: Repo };

export const env = {
  siteUrl: () => process.env.SITE_URL ?? "http://localhost:3000",
  bachsKey: () => process.env.BACHS_API_KEY,
  bachsBase: () => process.env.BACHS_BASE_URL ?? "https://sandbox-api.bachs.io",
  webhookSecrets: () => (process.env.BACHS_WEBHOOK_SECRET ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
  adminPassword: () => process.env.ADMIN_PASSWORD,
  adminEmail: () => process.env.ADMIN_EMAIL,
  adminSecret: () => process.env.ADMIN_SESSION_SECRET,
};

export async function getRepo(): Promise<Repo> {
  if (g.__efRepo) return g.__efRepo;
  if (process.env.DATABASE_URL) {
    const { PrismaRepo } = await import("./repo-prisma");
    g.__efRepo = new PrismaRepo();
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production.");
    console.warn("[ordering] DATABASE_URL not set: using a temporary in-memory store (data is lost on restart).");
    g.__efRepo = new MemoryRepo();
  }
  return g.__efRepo;
}

const unconfigured: PaymentGateway = { async createCheckout() { const { GatewayError } = await import("./gateway"); throw new GatewayError("BACHS_API_KEY is not configured", false); } };
export function getGateway(): PaymentGateway {
  const apiKey = env.bachsKey();
  return apiKey ? new BachsGateway({ apiKey, baseUrl: env.bachsBase() }) : unconfigured;
}
export async function getDeps(): Promise<OrderDeps> { const repo = await getRepo(); return { repo, gateway: getGateway(), cfg: await getOrderingConfig(repo), siteUrl: env.siteUrl() }; }

export async function getVocDeps(): Promise<VocDeps> { return { repo: await getRepo(), gateway: getGateway(), siteUrl: env.siteUrl() }; }

/** Returns the fixed Everfresh Creations WhatsApp number from the source configuration. */
export async function whatsappDigitsFor(_repo: Repo): Promise<string | null> {
  return site.contact.whatsappDigits;
}
export async function getCateringDeps(): Promise<CatDeps> { const repo = await getRepo(); return { repo, whatsappDigits: await whatsappDigitsFor(repo) }; }
