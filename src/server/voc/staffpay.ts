import type { ApiResult } from "../admin-api";
import { getApp, type VocDeps } from "./applications";
import { handleVocEvent } from "./payments";

/**
 * Staff safety net: the money is visible in the Bachs dashboard, but the confirmation never reached the site (for example a crypto payment).
 * This applies the payment through exactly the same path as a verified Bachs confirmation (receipt, status, emails), and records who vouched for it.
 */
export async function confirmFeeByStaff(d: VocDeps, ref: string, raw: unknown): Promise<ApiResult> {
  const note = typeof raw === "object" && raw !== null && typeof (raw as { note?: unknown }).note === "string" ? ((raw as { note: string }).note).trim().slice(0, 200) : "";
  if (!note) return { status: 422, body: { error: "Write where you checked the payment, for example the Bachs charge id." } };
  const now = d.now?.() ?? new Date();
  return d.repo.withLock(`app:${ref}`, async (): Promise<ApiResult> => {
    const app = await getApp(d.repo, ref); if (!app) return { status: 404, body: { error: "Application not found." } };
    if (app.payment.status === "paid") return { status: 409, body: { error: "This application fee is already marked as paid." } };
    if (app.status === "withdrawn") return { status: 409, body: { error: "This application was withdrawn." } };
    const attempt = app.payment.attempts[app.payment.attempts.length - 1]; if (!attempt) return { status: 409, body: { error: "No payment was ever started for this application." } };
    const r = await handleVocEvent({ type: "collection.succeeded", data: { reference: attempt.reference, charge_id: `staff-${now.getTime()}`, status: "SUCCEEDED", currency: "NGN", amount: (attempt.amountKobo / 100).toFixed(2) } }, d.repo, now);
    const after = await getApp(d.repo, ref);
    if (after) { after.notes.push(`${now.toISOString()} Payment confirmed by staff after checking Bachs. Note: ${note}`); await d.repo.docPut("app", after.ref, after); }
    return { status: r.status === 200 ? 200 : 500, body: { ok: r.status === 200, paymentStatus: after?.payment.status ?? null } };
  });
}