import { randomBytes } from "node:crypto";
import { admissionForm, allFormFields, SIGN_ROLES, type FormField, type SignRole } from "../../config/admissionForm";
import { variantById } from "../../config/vocational";
import { button, esc, para, refBadge } from "../emailTemplate";
import { sniffImage } from "../media";
import { brandedShell, notifyStaff, sendRaw } from "../notify";
import type { Repo } from "../repo";
import { normalisePhone } from "../validation";
import { appForToken, getApp, type VocDeps, type VocFail } from "./applications";
import type { FormPdfFiles } from "./formpdf";
import type { Application } from "./model";

/**
 * The admission form that is filled in after the application-form fee is paid.
 * The record holds the text and references; file bytes (passport photo, drawn signatures, scans) are stored apart, privately, and are only ever served to the applicant (private link) or to signed-in staff.
 * To move files to private object storage later, only putFile / dropFile / readFileBytes below need to change.
 */
const COL = "aform"; const FCOL = "aformfile";
export { SIGN_ROLES };
const LIMITS = { passport: 600_000, signature: 120_000, scan: 2_000_000, scans: 3 };
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type FormStatus = "draft" | "submitted" | "school_signed";
export interface FileRef { id: string; kind: "passport" | "signature" | "scan"; role?: SignRole; name: string; type: string; size: number; at: string }
export interface AdmissionFormRec {
  ref: string; template: string; status: FormStatus; mode: "online" | "print" | null; data: Record<string, string>;
  signatures: Partial<Record<SignRole, { fileId: string; signedAt: string }>>; passportId: string | null; scanIds: string[]; files: FileRef[];
  confirmed: boolean; staffNote: string | null; returnedAt: string | null; createdAt: string; updatedAt: string; submittedAt: string | null; schoolSignedAt: string | null;
}
export interface FormViewData {
  ref: string; programme: string; template: string; isPlaceholder: boolean; status: FormStatus; mode: "online" | "print" | null; data: Record<string, string>;
  signed: Record<SignRole, boolean>; passport: boolean; scans: { id: string; name: string; size: number }[]; confirmed: boolean; staffNote: string | null; submittedAt: string | null; schoolSignedAt: string | null;
}
export interface FormSummary { status: FormStatus | "not_started"; mode: "online" | "print" | null; submittedAt: string | null; schoolSignedAt: string | null; staffNote: string | null; started: boolean }
type ViewOut = { ok: true; view: FormViewData } | VocFail;

const fail = (status: number, code: string, message: string, fieldErrors?: Record<string, string>): VocFail => ({ ok: false, status, code, message, fieldErrors });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
const nowOf = (d: VocDeps) => d.now?.() ?? new Date();
export const allFields = (): FormField[] => allFormFields;
export const getForm = (repo: Repo, ref: string) => repo.docGet<AdmissionFormRec>(COL, ref);

const blank = (ref: string, now: Date): AdmissionFormRec => ({ ref, template: admissionForm.version, status: "draft", mode: null, data: {}, signatures: {}, passportId: null, scanIds: [], files: [], confirmed: false, staffNote: null, returnedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: null, schoolSignedAt: null });
const prefillOf = (a: Application): Record<string, string> => ({ fullName: a.details.fullName, phone: a.details.phone, email: a.details.email, dob: a.details.dob ?? "", address: a.details.address ?? "", education: a.details.education ?? "" });
function mergedData(a: Application, rec: AdmissionFormRec | null): Record<string, string> {
  const pre = prefillOf(a); const out: Record<string, string> = {};
  for (const f of allFields()) out[f.id] = rec?.data[f.id] ?? (f.prefill ? pre[f.prefill] ?? "" : "");
  return out;
}
function toView(a: Application, rec: AdmissionFormRec | null): FormViewData {
  const v = variantById(a.variantId);
  return {
    ref: a.ref, programme: v ? `${v.label}, ${v.durationLabel}` : "", template: admissionForm.version, isPlaceholder: admissionForm.isPlaceholder, status: rec?.status ?? "draft", mode: rec?.mode ?? null, data: mergedData(a, rec),
    signed: Object.fromEntries(SIGN_ROLES.map((r) => [r, !!rec?.signatures[r]])) as Record<SignRole, boolean>, passport: !!rec?.passportId,
    scans: (rec?.files ?? []).filter((f) => f.kind === "scan").map((f) => ({ id: f.id, name: f.name, size: f.size })),
    confirmed: rec?.confirmed ?? false, staffNote: rec?.staffNote ?? null, submittedAt: rec?.submittedAt ?? null, schoolSignedAt: rec?.schoolSignedAt ?? null,
  };
}

// ---------------------------------------------------------------- file storage (private; swap these three functions to move to object storage)
async function putFile(repo: Repo, rec: AdmissionFormRec, kind: FileRef["kind"], role: SignRole | undefined, name: string, type: string, bytes: Uint8Array, now: Date): Promise<FileRef> {
  const id = randomBytes(9).toString("hex");
  await repo.docPut(FCOL, `${rec.ref}.${id}`, { b64: Buffer.from(bytes).toString("base64") });
  const f: FileRef = { id, kind, role, name, type, size: bytes.length, at: now.toISOString() }; rec.files.push(f); return f;
}
async function dropFile(repo: Repo, rec: AdmissionFormRec, id: string) { await repo.docDelete(FCOL, `${rec.ref}.${id}`); rec.files = rec.files.filter((f) => f.id !== id); }
async function readFileBytes(repo: Repo, ref: string, id: string): Promise<Uint8Array | null> {
  const f = await repo.docGet<{ b64: string }>(FCOL, `${ref}.${id}`); return f ? new Uint8Array(Buffer.from(f.b64, "base64")) : null;
}
export async function getFileBytes(repo: Repo, ref: string, id: string): Promise<{ bytes: Uint8Array; type: string; name: string } | null> {
  const rec = await getForm(repo, ref); const meta = rec?.files.find((f) => f.id === id); if (!meta) return null;
  const bytes = await readFileBytes(repo, ref, id); return bytes ? { bytes, type: meta.type, name: meta.name } : null;
}
export async function filesForPdf(repo: Repo, rec: AdmissionFormRec): Promise<FormPdfFiles> {
  const signatures: FormPdfFiles["signatures"] = {};
  for (const role of SIGN_ROLES) { const id = rec.signatures[role]?.fileId; const b = id ? await readFileBytes(repo, rec.ref, id) : null; if (b) signatures[role] = b; }
  return { passport: rec.passportId ? await readFileBytes(repo, rec.ref, rec.passportId) : null, signatures };
}

// ---------------------------------------------------------------- applicant side
const eligible = (a: Application) => a.payment.status === "paid" && a.status !== "withdrawn";
async function open(deps: VocDeps, ref: string, token: string): Promise<{ app: Application } | VocFail> {
  const app = await appForToken(deps.repo, ref, token); if (!app) return fail(404, "NOT_FOUND", "Application not found.");
  if (!eligible(app)) return fail(409, "FEE_NOT_PAID", "The admission form opens after the application-form fee is paid.");
  return { app };
}
export async function getFormView(deps: VocDeps, ref: string, token: string): Promise<ViewOut> {
  const o = await open(deps, ref, token); if ("ok" in o) return o; return { ok: true, view: toView(o.app, await getForm(deps.repo, ref)) };
}
export async function formSummary(repo: Repo, ref: string): Promise<FormSummary> {
  const rec = await getForm(repo, ref);
  return { status: rec ? rec.status : "not_started", mode: rec?.mode ?? null, submittedAt: rec?.submittedAt ?? null, schoolSignedAt: rec?.schoolSignedAt ?? null, staffNote: rec?.staffNote ?? null, started: !!rec };
}

function formatError(f: FormField, v: string, now: Date): string | null {
  if (f.kind === "tel") return normalisePhone(v) ? null : "Enter a valid Nigerian mobile number.";
  if (f.kind === "date") { const d = new Date(v + "T00:00:00Z"); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d <= now && now.getUTCFullYear() - d.getUTCFullYear() <= 100 ? null : "Enter a valid date."; }
  if (f.kind === "select") return f.options?.includes(v) ? null : "Choose one of the options.";
  return null;
}
const decodePng = (s: string): Buffer | null => {
  if (!s.startsWith("data:image/png;base64,")) return null; const b = Buffer.from(s.slice(22), "base64");
  return b.length > 0 && b.length <= LIMITS.signature && sniffImage(b) === "png" ? b : null;
};
const decodeAny = (v: unknown): Buffer | null => {
  if (typeof v !== "string") return null; const b = Buffer.from(v.replace(/^data:[^;]+;base64,/, ""), "base64"); return b.length ? b : null;
};

export function saveForm(deps: VocDeps, ref: string, token: string, raw: unknown, submit: boolean): Promise<ViewOut> { return deps.repo.withLock(`form:${ref}`, () => saveImpl(deps, ref, token, raw, submit)); }
async function saveImpl(deps: VocDeps, ref: string, token: string, raw: unknown, submit: boolean): Promise<ViewOut> {
  const o = await open(deps, ref, token); if ("ok" in o) return o;
  const app = o.app; const now = nowOf(deps); const rec = (await getForm(deps.repo, ref)) ?? blank(ref, now);
  if (rec.status !== "draft") return fail(409, "LOCKED", "This form has already been submitted. If something needs correcting, please contact us.");
  const r = isRec(raw) ? raw : {}; const input = isRec(r.data) ? r.data : {}; const errors: Record<string, string> = {}; const data: Record<string, string> = {};
  for (const f of allFields()) {
    const v = clean(input[f.id], f.max ?? 160); data[f.id] = v;
    if (v) { const e = formatError(f, v, now); if (e) errors[f.id] = e; } else if (submit && f.required) errors[f.id] = "This is required.";
  }
    if (submit && !admissionForm.C.courses.some((c) => data[c.id])) errors.courses = "Mark at least one course and your mode of study.";
      const sigIn = isRec(r.signatures) ? r.signatures : {}; const newSigs: Partial<Record<SignRole, Buffer | null>> = {};
  for (const role of SIGN_ROLES) {
    const s = sigIn[role];
    if (s === null) newSigs[role] = null;
    else if (typeof s === "string") { const b = decodePng(s); if (b) newSigs[role] = b; else errors[`sig_${role}`] = "That signature could not be read. Please sign again."; }
  }
  if (submit) {
    if (!rec.passportId) errors.passport = "Add your passport photograph.";
    for (const role of SIGN_ROLES) { const has = newSigs[role] !== undefined ? newSigs[role] !== null : !!rec.signatures[role]; if (!has) errors[`sig_${role}`] = "This signature is needed."; }
    if (r.confirmed !== true) errors.confirmed = "Please tick the confirmation.";
  }
  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Please check the highlighted parts of the form.", errors);
  for (const role of SIGN_ROLES) {
    const b = newSigs[role]; if (b === undefined) continue;
    const old = rec.signatures[role]; if (old) await dropFile(deps.repo, rec, old.fileId); delete rec.signatures[role];
    if (b) { const f = await putFile(deps.repo, rec, "signature", role, `signature-${role}.png`, "image/png", b, now); rec.signatures[role] = { fileId: f.id, signedAt: now.toISOString() }; }
  }
  rec.data = data; rec.confirmed = r.confirmed === true; rec.updatedAt = now.toISOString();
  if (submit) { rec.status = "submitted"; rec.mode = "online"; rec.submittedAt = rec.updatedAt; rec.staffNote = null; }
  await deps.repo.docPut(COL, ref, rec);
  if (submit) await announceSubmitted(deps.repo, app, rec);
  return { ok: true, view: toView(app, rec) };
}

export function addFile(deps: VocDeps, ref: string, token: string, kind: "passport" | "scan", raw: unknown): Promise<ViewOut> { return deps.repo.withLock(`form:${ref}`, () => addImpl(deps, ref, token, kind, raw)); }
async function addImpl(deps: VocDeps, ref: string, token: string, kind: "passport" | "scan", raw: unknown): Promise<ViewOut> {
  const o = await open(deps, ref, token); if ("ok" in o) return o;
  const now = nowOf(deps); const rec = (await getForm(deps.repo, ref)) ?? blank(ref, now);
  if (rec.status !== "draft") return fail(409, "LOCKED", "This form has already been submitted.");
  const r = isRec(raw) ? raw : {}; const bytes = decodeAny(r.data); if (!bytes) return fail(422, "FILE_INVALID", "That file could not be read.");
  const name = clean(r.name, 80).replace(/[\\/:*?"<>|]+/g, "_") || (kind === "passport" ? "passport" : "scan");
  if (kind === "passport") {
    const ext = sniffImage(bytes); if (!ext) return fail(422, "FILE_INVALID", "Upload a JPEG, PNG or WebP photograph.");
    if (bytes.length > LIMITS.passport) return fail(422, "FILE_TOO_LARGE", "That photograph is too large. Try a smaller one.");
    if (rec.passportId) await dropFile(deps.repo, rec, rec.passportId);
    rec.passportId = (await putFile(deps.repo, rec, "passport", undefined, name, MIME[ext], bytes, now)).id;
  } else {
    if (rec.scanIds.length >= LIMITS.scans) return fail(422, "TOO_MANY_FILES", `You can upload up to ${LIMITS.scans} files. Remove one first.`);
    const img = sniffImage(bytes); const pdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!img && !pdf) return fail(422, "FILE_INVALID", "Upload a photo (JPEG, PNG or WebP) or a PDF.");
    if (bytes.length > LIMITS.scan) return fail(422, "FILE_TOO_LARGE", "That file is too large (up to 2 MB). Try a photo instead of a scan, or a smaller PDF.");
    rec.scanIds.push((await putFile(deps.repo, rec, "scan", undefined, name, pdf ? "application/pdf" : MIME[img!], bytes, now)).id);
  }
  rec.updatedAt = now.toISOString(); await deps.repo.docPut(COL, ref, rec); return { ok: true, view: toView(o.app, rec) };
}
export function removeFile(deps: VocDeps, ref: string, token: string, fileId: unknown): Promise<ViewOut> { return deps.repo.withLock(`form:${ref}`, () => removeImpl(deps, ref, token, fileId)); }
async function removeImpl(deps: VocDeps, ref: string, token: string, fileId: unknown): Promise<ViewOut> {
  const o = await open(deps, ref, token); if ("ok" in o) return o; const rec = await getForm(deps.repo, ref); if (!rec) return fail(404, "NOT_FOUND", "File not found.");
  if (rec.status !== "draft") return fail(409, "LOCKED", "This form has already been submitted.");
  if (typeof fileId !== "string" || !rec.scanIds.includes(fileId)) return fail(404, "NOT_FOUND", "File not found.");
  await dropFile(deps.repo, rec, fileId); rec.scanIds = rec.scanIds.filter((x) => x !== fileId); rec.updatedAt = nowOf(deps).toISOString(); await deps.repo.docPut(COL, ref, rec);
  return { ok: true, view: toView(o.app, rec) };
}
export function submitPrint(deps: VocDeps, ref: string, token: string): Promise<ViewOut> { return deps.repo.withLock(`form:${ref}`, () => printImpl(deps, ref, token)); }
async function printImpl(deps: VocDeps, ref: string, token: string): Promise<ViewOut> {
  const o = await open(deps, ref, token); if ("ok" in o) return o; const now = nowOf(deps); const rec = (await getForm(deps.repo, ref)) ?? blank(ref, now);
  if (rec.status !== "draft") return fail(409, "LOCKED", "This form has already been submitted.");
  if (!rec.scanIds.length) return fail(422, "NO_FILE", "Upload at least one photo or scan of the signed form.");
  rec.status = "submitted"; rec.mode = "print"; rec.submittedAt = now.toISOString(); rec.updatedAt = rec.submittedAt; rec.staffNote = null;
  await deps.repo.docPut(COL, ref, rec); await announceSubmitted(deps.repo, o.app, rec); return { ok: true, view: toView(o.app, rec) };
}

// ---------------------------------------------------------------- staff side
export async function adminFormInfo(repo: Repo, ref: string) {
  const app = await getApp(repo, ref); if (!app) return null; const rec = await getForm(repo, ref);
  return { ref, name: app.details.fullName, paid: app.payment.status === "paid", paymentStatus: app.payment.status, attempts: app.payment.attempts.length, admitted: app.status === "admitted", form: rec };
}
export async function staffFormAction(d: VocDeps, ref: string, raw: unknown): Promise<{ status: number; body: unknown }> {
  const r = isRec(raw) ? raw : {}; const action = r.action; const now = nowOf(d);
  return d.repo.withLock(`form:${ref}`, async () => {
    const app = await getApp(d.repo, ref); const rec = await getForm(d.repo, ref);
    if (!app || !rec) return { status: 404, body: { error: "There is no form for this application yet." } };
    if (action === "school_signed") {
      if (rec.status === "draft") return { status: 409, body: { error: "The applicant has not submitted the form yet." } };
      rec.status = "school_signed"; rec.schoolSignedAt = now.toISOString();
    } else if (action === "return") {
      const note = clean(r.note, 400); if (!note) return { status: 422, body: { error: "Write what the applicant should correct." } };
      rec.status = "draft"; rec.mode = null; rec.staffNote = note; rec.returnedAt = now.toISOString(); rec.schoolSignedAt = null;
    } else if (action === "purge") {
      for (const f of [...rec.files]) await dropFile(d.repo, rec, f.id); rec.passportId = null; rec.scanIds = []; rec.signatures = {};
    } else return { status: 422, body: { error: "Unknown action." } };
    rec.updatedAt = now.toISOString(); await d.repo.docPut(COL, ref, rec);
    if (action === "return") await mailReturned(d.repo, app, rec);
    return { status: 200, body: { ok: true, status: rec.status } };
  });
}

// ---------------------------------------------------------------- emails
const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const first = (n: string) => n.trim().split(/\s+/)[0] || "there";
async function announceSubmitted(repo: Repo, app: Application, rec: AdmissionFormRec) {
  const url = `${siteUrl()}/application/${app.ref}/${app.token}`;
  try {
    await sendRaw(repo, { to: app.details.email, kind: "application", subject: `Admission form received: ${app.ref}`,
      text: `Hello ${first(app.details.fullName)},\n\nWe have received your admission form for application ${app.ref}.\n\nNext, wait for our email confirming your acceptance. School fees can be paid only after you are accepted.\n\nYour application: ${url}\nKeep this link private.\n\nEverfresh Creations Ltd`,
      html: brandedShell({ preheader: `We have received your admission form for ${app.ref}.`, title: "Admission form received", body: para(`Hello ${esc(first(app.details.fullName))},`) + para(`We have received your admission form for application <b>${esc(app.ref)}</b>.`) + refBadge(app.ref) + para("<b>Next:</b> wait for our email confirming your acceptance. School fees can be paid only after you are accepted.") + button("Open your application", url) }) });
  } catch { /* the outbox retries */ }
  await notifyStaff(repo, `Admission form submitted: ${app.ref}`, `${app.details.fullName} submitted the admission form (${rec.mode === "print" ? "a signed copy was uploaded" : "filled in and signed online"}). Open the admin to review it.`, { label: "Open the admin", url: `${siteUrl()}/admin` });
}
async function mailReturned(repo: Repo, app: Application, rec: AdmissionFormRec) {
  const url = `${siteUrl()}/application/${app.ref}/${app.token}/form`;
  try {
    await sendRaw(repo, { to: app.details.email, kind: "application", subject: `Admission form ${app.ref}: please correct it`,
      text: `Hello ${first(app.details.fullName)},\n\nWe have looked at your admission form and need you to correct something:\n\n${rec.staffNote ?? ""}\n\nOpen your form: ${url}\nKeep this link private.\n\nEverfresh Creations Ltd`,
      html: brandedShell({ preheader: `Please correct your admission form ${app.ref}.`, title: "Please correct your form", body: para(`Hello ${esc(first(app.details.fullName))},`) + para("We have looked at your admission form and need you to correct something:") + para(`<b>${esc(rec.staffNote ?? "").replace(/\n/g, "<br>")}</b>`) + button("Open your form", url) }) });
  } catch { /* the outbox retries */ }
}