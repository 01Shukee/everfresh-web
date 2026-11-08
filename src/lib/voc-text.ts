import { decimalToKobo, koboToDecimal } from "./money";
const rid = () => Math.random().toString(36).slice(2, 10);
type R<T> = { ok: true; value: T } | { ok: false; error: string };
export const parseLines = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);
/** Pulls "[tag]" markers out of a text segment. */
const tagsOf = (seg: string) => { const found: string[] = []; const rest = seg.replace(/\[([^\]]*)\]/g, (_, x: string) => { found.push(x.trim().toLowerCase()); return ""; }).replace(/\s+/g, " ").trim(); return { rest, found }; };
export type CourseLine = { id: string; name: string; description: string | null; role: "included" | "choice"; priceKobo: number | null };
/** "Name | description". Optional markers after the name: [choice] (the applicant picks it) and [price=150000] (naira). */
export const parseCourses = (t: string): R<CourseLine[]> => {
  const out: CourseLine[] = [];
  for (const l of parseLines(t)) {
    const [head, ...d] = l.split("|"); const { rest: name, found } = tagsOf(head); if (!name) return { ok: false, error: `Course line "${l}" needs a name.` };
    let role: "included" | "choice" = "included"; let priceKobo: number | null = null;
    for (const f of found) { if (f === "choice") role = "choice"; else if (f.startsWith("price=")) { const k = decimalToKobo(f.slice(6)); if (k === null) return { ok: false, error: `Course "${name}": the price in [price=...] must be a number of naira.` }; priceKobo = k; } else return { ok: false, error: `Course "${name}": unknown marker [${f}]. Use [choice] and [price=amount].` }; }
    out.push({ id: rid(), name, description: d.join("|").trim() || null, role, priceKobo });
  } return { ok: true, value: out };
};
export const serializeCourses = (c: { name: string; description: string | null; role?: string; priceKobo?: number | null }[]) => c.map((x) => `${x.name}${x.role === "choice" ? " [choice]" : ""}${typeof x.priceKobo === "number" ? ` [price=${koboToDecimal(x.priceKobo).replace(/\.00$/, "")}]` : ""}${x.description ? ` | ${x.description}` : ""}`).join("\n");
/** "# Module title" followed by "- topic" lines. */
export const parseCurriculum = (t: string): R<{ title: string; topics: string[] }[]> => {
  const out: { title: string; topics: string[] }[] = []; let cur: { title: string; topics: string[] } | null = null;
  for (const l of parseLines(t)) { if (l.startsWith("#")) { cur = { title: l.slice(1).trim(), topics: [] }; if (!cur.title) return { ok: false, error: "A module heading is empty." }; out.push(cur); } else if (l.startsWith("-") && cur) cur.topics.push(l.slice(1).trim()); else return { ok: false, error: `Start each module with "# Title", then list topics with "- topic". Problem line: "${l}"` }; }
  return { ok: true, value: out };
};
export const serializeCurriculum = (c: { title: string; topics: string[] }[]) => c.map((m) => `# ${m.title}\n${m.topics.map((x) => `- ${x}`).join("\n")}`).join("\n");
export type FeeLine = { id: string; label: string; kind: "tuition" | "accommodation" | "other"; amountKobo: number | null; note: string | null; appliesTo: "all" | "hostel" | "day"; phase: "intake" | "yearly" | "graduation" };
/** "Label | tuition/accommodation/other | amount (blank = to be confirmed) | optional note". Optional markers on the label: [hostel] or [day] (charged to that student type only), [yearly] (later years) or [graduation] (due at graduation). No marker = first-year charge for everyone. */
export const parseFees = (t: string): R<FeeLine[]> => {
  const out: FeeLine[] = [];
  for (const l of parseLines(t)) {
    const [head, kind, amt, ...n] = l.split("|").map((x) => x.trim()); const { rest: label, found } = tagsOf(head ?? ""); const k = kind as FeeLine["kind"]; const kobo = amt ? decimalToKobo(amt) : null;
    if (!label || !["tuition", "accommodation", "other"].includes(k) || (amt && kobo === null)) return { ok: false, error: `Fee line "${l}": use "Label | tuition/accommodation/other | amount | note" (leave amount empty if not confirmed).` };
    let appliesTo: FeeLine["appliesTo"] = "all"; let phase: FeeLine["phase"] = "intake";
    for (const f of found) { if (f === "hostel" || f === "day") appliesTo = f; else if (f === "yearly" || f === "graduation") phase = f; else return { ok: false, error: `Fee line "${label}": unknown marker [${f}]. Use [hostel], [day], [yearly] or [graduation].` }; }
    out.push({ id: rid(), label, kind: k, amountKobo: kobo, note: n.join("|").trim() || null, appliesTo, phase });
  } return { ok: true, value: out };
};
export const serializeFees = (f: { label: string; kind: string; amountKobo: number | null; note: string | null; appliesTo?: string; phase?: string }[]) => f.map((x) => `${x.label}${x.appliesTo === "hostel" || x.appliesTo === "day" ? ` [${x.appliesTo}]` : ""}${x.phase === "yearly" || x.phase === "graduation" ? ` [${x.phase}]` : ""} | ${x.kind} | ${x.amountKobo === null ? "" : koboToDecimal(x.amountKobo).replace(/\.00$/, "")}${x.note ? ` | ${x.note}` : ""}`).join("\n");
