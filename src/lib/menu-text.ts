import { decimalToKobo, koboToDecimal } from "./money";
import type { AddOnGroup, Variant } from "../server/types";

const rid = () => Math.random().toString(36).slice(2, 10);

/** Variants: one per line, "Name | 2500" (naira). */
export function parseVariants(text: string): { ok: true; value: Variant[] } | { ok: false; error: string } {
  const out: Variant[] = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const l = raw.trim(); if (!l) continue;
    const [name, price] = l.split("|").map((s) => s.trim());
    const k = decimalToKobo(price);
    if (!name || k === null || k <= 0) return { ok: false, error: `Size line ${i + 1}: use "Name | price", for example "Large | 2500".` };
    out.push({ id: rid(), name, priceKobo: k });
  }
  return { ok: true, value: out };
}
export const serializeVariants = (v: Variant[]) => v.map((x) => `${x.name} | ${koboToDecimal(x.priceKobo).replace(/\.00$/, "")}`).join("\n");

/** Add-ons: "# Group | min | max" then "- Option | 300" lines. */
export function parseAddOns(text: string): { ok: true; value: AddOnGroup[] } | { ok: false; error: string } {
  const out: AddOnGroup[] = []; let cur: AddOnGroup | null = null;
  for (const [i, raw] of text.split("\n").entries()) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith("#")) {
      const [name, min, max] = l.slice(1).split("|").map((s) => s.trim());
      const mn = Number(min ?? 0), mx = Number(max ?? 1);
      if (!name || !Number.isInteger(mn) || !Number.isInteger(mx) || mn < 0 || mx < 1 || mn > mx) return { ok: false, error: `Add-on line ${i + 1}: use "# Group | min | max", for example "# Extras | 0 | 3".` };
      cur = { id: rid(), name, min: mn, max: mx, options: [] }; out.push(cur);
    } else if (l.startsWith("-") && cur) {
      const [name, price] = l.slice(1).split("|").map((s) => s.trim());
      const k = decimalToKobo(price ?? "0");
      if (!name || k === null) return { ok: false, error: `Add-on line ${i + 1}: use "- Option | 300" (0 for free).` };
      cur.options.push({ id: rid(), name, priceKobo: k, available: true });
    } else return { ok: false, error: `Add-on line ${i + 1}: start a group with "#" before listing options.` };
  }
  return { ok: true, value: out };
}
export const serializeAddOns = (g: AddOnGroup[]) => g.map((x) => `# ${x.name} | ${x.min} | ${x.max}\n` + x.options.map((o) => `- ${o.name} | ${koboToDecimal(o.priceKobo).replace(/\.00$/, "")}`).join("\n")).join("\n");
