import { createHmac } from "node:crypto";
import { ordering, type OrderingConfig } from "../src/config/ordering";
import { GatewayError, type CreateCheckoutParams, type PaymentGateway } from "../src/server/gateway";
import type { OrderDeps } from "../src/server/orders";
import { MemoryRepo } from "../src/server/repo";
import type { Category, MenuItem } from "../src/server/types";

export const NOW = new Date("2026-10-10T10:00:00Z");
export const SECRET = "whsec_test_secret_value";
export const cfg: OrderingConfig = {
  ...ordering,
  zones: [{ id: "z1", name: "Test Zone", feeKobo: 100_000, minOrderKobo: 300_000, active: true }, { id: "z2", name: "Off Zone", feeKobo: 50_000, minOrderKobo: 0, active: false }],
  pickupLocations: [{ id: "p1", name: "Test Pickup", address: "1 Test Street", active: true }],
  promos: [{ code: "TEST10", type: "percent", value: 10, minOrderKobo: 100_000, active: true }, { code: "OLD", type: "fixed", value: 50_000, minOrderKobo: 0, active: true, expiresAt: "2026-01-01T00:00:00Z" }],
};
const item = (o: Partial<MenuItem> & { id: string; name: string }): MenuItem => ({ categoryId: "c1", description: "", basePriceKobo: 30_000, variants: [], addOnGroups: [], tags: [], imageUrl: null, imageAlt: "", active: true, available: true, sort: 0, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...o });
export const cats: Category[] = [{ id: "c1", name: "Mains", slug: "mains", sort: 0, active: true }, { id: "c2", name: "Hidden", slug: "hidden", sort: 1, active: false }];
export const items: MenuItem[] = [
  item({ id: "rice", name: "Test Rice", basePriceKobo: 0, variants: [{ id: "s", name: "Small", priceKobo: 200_000 }, { id: "l", name: "Large", priceKobo: 350_000 }],
    addOnGroups: [{ id: "g1", name: "Protein", min: 1, max: 1, options: [{ id: "chk", name: "Chicken", priceKobo: 150_000, available: true }, { id: "beef", name: "Beef", priceKobo: 180_000, available: true }] },
      { id: "g2", name: "Extras", min: 0, max: 2, options: [{ id: "pl", name: "Plantain", priceKobo: 50_000, available: true }, { id: "egg", name: "Egg", priceKobo: 30_000, available: true }, { id: "slaw", name: "Slaw", priceKobo: 40_000, available: false }] }] }),
  item({ id: "water", name: "Test Water", basePriceKobo: 30_000 }),
  item({ id: "soldout", name: "Sold Out", available: false }), item({ id: "off", name: "Disabled", active: false }), item({ id: "hid", name: "Hidden Cat", categoryId: "c2" }),
];
export async function seeded() { const repo = new MemoryRepo(); for (const c of cats) await repo.saveCategory(c); for (const i of items) await repo.saveItem(i); return repo; }

export class FakeGateway implements PaymentGateway {
  calls: CreateCheckoutParams[] = []; fail = false; delayMs = 0; n = 0;
  async createCheckout(p: CreateCheckoutParams) {
    this.calls.push(p); if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) throw new GatewayError("down", true);
    this.n++; return { checkoutId: `chk_${this.n}`, checkoutUrl: `https://checkout.example/c/${this.n}` };
  }
}
export async function deps(over: Partial<OrderDeps> = {}) { const gateway = new FakeGateway(); const repo = await seeded(); return { gw: gateway, repo, d: { repo, gateway, cfg, siteUrl: "https://shop.test", now: () => NOW, ...over } as OrderDeps }; }

export const cart = (extra: object = {}) => ({ lines: [{ itemId: "rice", variantId: "l", qty: 2, addOnIds: ["chk", "pl"] }, { itemId: "water", qty: 1 }], ...extra });
export const body = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: "key-aaaaaaaaaaaaaaaa", customer: { name: "Test Customer", phone: "0803 123 4567", email: "Test@Example.com" },
  fulfilment: { type: "pickup", pickupLocationId: "p1" }, lines: cart().lines, ...over,
});
export const TOTAL = (350_000 + 150_000 + 50_000) * 2 + 30_000; // 1,130,000 kobo

export function signed(payload: object, opts: { secret?: string; t?: number; extraSecret?: string } = {}) {
  const raw = JSON.stringify(payload); const t = opts.t ?? Math.floor(NOW.getTime() / 1000);
  const sig = (s: string) => createHmac("sha256", s).update(`${t}.${raw}`).digest("hex");
  const v1 = [sig(opts.secret ?? SECRET), ...(opts.extraSecret ? [sig(opts.extraSecret)] : [])].map((x) => `v1=${x}`).join(",");
  const h = new Map([["x-bachs-signature-v2", `t=${t},${v1}`]]);
  return { raw, headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null } };
}
let e = 0;
export const evt = (type: string, data: object) => ({ id: `evt_${++e}`, type, created_at: NOW.toISOString(), organization_id: "acct_test", data });
