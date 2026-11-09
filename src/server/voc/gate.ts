import type { Repo } from "../repo";
import { publicVocational } from "./admin";
import { getApp, getContent, ownerView, type VocDeps } from "./applications";
import { issueProgrammeInvoice } from "./autoinvoice";
import { mailAdmitted } from "./emails";
import { getInstitute } from "./institute";
import type { Invoice } from "./model";

/**
 * What an applicant may see:
 *  - the curriculum only after the N5,000 application-form fee is paid;
 *  - school-fee invoices only after staff have accepted the application.
 */
export async function ownerViewGated(deps: VocDeps, ref: string, token: string) {
  const v = await ownerView(deps, ref, token); if (!v) return null;
  const admitted = v.status === "admitted";
  const curriculum = v.payment.status === "paid" ? (await getContent(deps.repo, v.variantId)).curriculum : [];
  const invoices: typeof v.invoices = admitted ? v.invoices : [];
  return { ...v, invoices, curriculum, admitted };
}
export type OwnerViewGated = NonNullable<Awaited<ReturnType<typeof ownerViewGated>>>;

/** Public programme content with the curriculum removed: the curriculum is a paid-enquiry benefit, so it is never sent to anonymous visitors. */
export async function publicVocationalSafe(repo: Repo) {
  const pub = await publicVocational(repo);
  return { ...pub, content: Object.fromEntries(Object.entries(pub.content).map(([k, c]) => [k, { ...c, curriculum: [] }])) as typeof pub.content };
}

/** Called after staff set an application to "admitted": raises the school-fees invoice and emails the applicant. Never throws. */
export async function onAdmitted(d: VocDeps, ref: string): Promise<void> {
  const repo = d.repo; const now = d.now?.() ?? new Date();
  const app = await getApp(repo, ref); if (!app || app.status !== "admitted") return;
  let inv: Invoice | null = null;
  try { inv = await issueProgrammeInvoice(repo, now, app); }
  catch (e) {
    await repo.withLock(`app:${ref}`, async () => { const a = await getApp(repo, ref); if (!a) return; a.notes.push(`${now.toISOString()} The programme invoice could not be raised automatically (${(e as Error).message}). Raise it by hand in the admin.`); await repo.docPut("app", a.ref, a); }).catch(() => {});
  }
  try { await mailAdmitted(repo, app, await getContent(repo, app.variantId), await getInstitute(repo), inv); } catch { /* the outbox retries */ }
}