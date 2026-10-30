import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const base32 = (b: Uint8Array) => { let bits = 0, v = 0, o = ""; for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) o += B32[(v << (5 - bits)) & 31]; return o; };
export const unbase32 = (s: string) => { let bits = 0, v = 0; const o: number[] = []; for (const c of s.replace(/[\s=-]/g, "").toUpperCase()) { const i = B32.indexOf(c); if (i < 0) throw new Error("bad base32"); v = (v << 5) | i; bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
/** RFC 6238 TOTP (HMAC-SHA1, 30-second steps). */
export function totpAt(secret: Buffer, step: number, digits = 6): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", secret).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 10 ** digits).padStart(digits, "0");
}
/** Accepts the current step and one either side (clock drift). Returns the matched step, or null. A step may be used only once (caller passes lastStep). */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastStep = 0): number | null {
  if (!/^\d{6}$/.test(code)) return null; const now = Math.floor(nowMs / 30_000);
  for (const s of [now, now - 1, now + 1]) { const want = Buffer.from(totpAt(secret, s)), got = Buffer.from(code); if (s > lastStep && want.length === got.length && timingSafeEqual(want, got)) return s; }
  return null;
}
export const newSecret = () => randomBytes(20);
export const otpauthUri = (email: string, secret: Buffer) => `otpauth://totp/${encodeURIComponent("Everfresh:" + email)}?secret=${base32(secret)}&issuer=Everfresh&algorithm=SHA1&digits=6&period=30`;

// secrets are encrypted at rest with a key derived from ADMIN_SESSION_SECRET, so a database copy alone does not reveal them
const key = (sessionSecret: string) => createHash("sha256").update("totp-key:" + sessionSecret).digest();
export function sealSecret(secret: Buffer, sessionSecret: string): string { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(sessionSecret), iv); const ct = Buffer.concat([c.update(secret), c.final()]); return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join("."); }
export function openSecret(sealed: string, sessionSecret: string): Buffer | null { try { const [v, iv, tag, ct] = sealed.split("."); if (v !== "v1") return null; const d = createDecipheriv("aes-256-gcm", key(sessionSecret), Buffer.from(iv, "base64url")); d.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]); } catch { return null; } }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } { const codes = Array.from({ length: 8 }, () => { const b = base32(randomBytes(7)).slice(0, 10).toLowerCase(); return `${b.slice(0, 5)}-${b.slice(5)}`; }); return { codes, hashes: codes.map(sha) }; }
export const hashRecovery = (c: string) => sha(c.trim().toLowerCase());
