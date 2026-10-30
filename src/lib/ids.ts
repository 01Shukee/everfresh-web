import { randomInt } from "node:crypto";
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
/** e.g. VA-261010-4ZTZ. Prefix: VA application, VI invoice, VR receipt. */
export function newRef(prefix: string, now: Date) {
  return `${prefix}-${now.toISOString().slice(2, 10).replace(/-/g, "")}-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}
