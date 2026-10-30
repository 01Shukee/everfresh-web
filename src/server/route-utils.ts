import type { ApiResult } from "./admin-api";
import { env } from "./runtime";

export const send = (r: ApiResult) => Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
import type { ApiOut } from "./voc/api";
export const sendOut = (o: ApiOut) => ("pdf" in o ? new Response(Buffer.from(o.pdf), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${o.filename}"`, "Cache-Control": "private, no-store" } }) : send(o));
export async function readJson(req: Request, maxBytes = 65_536): Promise<unknown> {
  const t = await req.text(); if (t.length > maxBytes) throw new Error("too large");
  try { return JSON.parse(t); } catch { return null; }
}
export function cookie(req: Request, name: string): string | undefined {
  return req.headers.get("cookie")?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];
}
import { authorize, type AuthOut } from "./auth";
import { getRepo } from "./runtime";
export async function adminAuth(req: Request): Promise<AuthOut> { return authorize(await getRepo(), req, { siteUrl: env.siteUrl(), secret: env.adminSecret() }); }
/** Returns a Response to send when the caller may not use this admin endpoint; null when allowed. Permission is decided by URL path in authorize(). */
export async function adminGuard(req: Request): Promise<Response | null> { const r = await adminAuth(req); return r.ok ? null : Response.json({ error: r.error }, { status: r.status }); }
/** Client address for rate limiting. Only the entry added by OUR proxy is trusted (TRUSTED_PROXY_HOPS, default 1): anything a visitor puts further left in x-forwarded-for is ignored, so it cannot be spoofed to dodge limits. */
export function clientIdFrom(xff: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const parts = (xff ?? "").split(",").map((x) => x.trim()).filter(Boolean); if (!parts.length) return "local";
  return parts[Math.max(0, parts.length - Math.max(1, hops))];
}
export const clientId = (req: Request) => clientIdFrom(req.headers.get("x-forwarded-for"));

import { rateLimit } from "./ratelimit";
/** Returns a 429 Response when this client has made too many requests to the bucket recently; null otherwise. Deploy behind a proxy that sets x-forwarded-for. */
export function tooMany(req: Request, bucket: string, max: number, windowSec: number): Response | null {
  return rateLimit(`${bucket}:${clientId(req)}`, max, windowSec * 1000) ? null : Response.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(windowSec) } });
}
