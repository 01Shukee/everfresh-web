import { decimalToKobo, koboToDecimal } from "./money";
const rid = () => Math.random().toString(36).slice(2, 10);
type R<T> = { ok: true; value: T } | { ok: false; error: string };
export const parseLines = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);
export const parseCourses = (t: string): R<{ id: string; name: string; description: string | null }[]> => {
  const out = []; for (const l of parseLines(t)) { const [name, ...d] = l.split("|"); if (!name.trim()) return { ok: false, error: `Course line "${l}" needs a name.` }; out.push({ id: rid(), name: name.trim(), description: d.join("|").trim() || null }); } return { ok: true, value: out };
};
export const serializeCourses = (c: { name: string; description: string | null }[]) => c.map((x) => (x.description ? `${x.name} | ${x.description}` : x.name)).join("\n");
/** "# Module title" followed by "- topic" lines. */
export const parseCurriculum = (t: string): R<{ title: string; topics: string[] }[]> => {
  const out: { title: string; topics: string[] }[] = []; let cur: { title: string; topics: string[] } | null = null;
  for (const l of parseLines(t)) { if (l.startsWith("#")) { cur = { title: l.slice(1).trim(), topics: [] }; if (!cur.title) return { ok: false, error: "A module heading is empty." }; out.push(cur); } else if (l.startsWith("-") && cur) cur.topics.push(l.slice(1).trim()); else return { ok: false, error: `Start each module with "# Title", then list topics with "- topic". Problem line: "${l}"` }; }
  return { ok: true, value: out };
};
export const serializeCurriculum = (c: { title: string; topics: string[] }[]) => c.map((m) => `# ${m.title}\n${m.topics.map((x) => `- ${x}`).join("\n")}`).join("\n");
/** "Label | tuition|accommodation|other | amount (blank = to be confirmed) | optional note" */
export const parseFees = (t: string): R<{ id: string; label: string; kind: "tuition" | "accommodation" | "other"; amountKobo: number | null; note: string | null }[]> => {
  const out = []; for (const l of parseLines(t)) { const [label, kind, amt, ...n] = l.split("|").map((s) => s.trim()); const k = kind as "tuition" | "accommodation" | "other"; const kobo = amt ? decimalToKobo(amt) : null;
    if (!label || !["tuition", "accommodation", "other"].includes(k) || (amt && kobo === null)) return { ok: false, error: `Fee line "${l}": use "Label | tuition/accommodation/other | amount | note" (leave amount empty if not confirmed).` };
    out.push({ id: rid(), label, kind: k, amountKobo: kobo, note: n.join("|").trim() || null }); } return { ok: true, value: out };
};
export const serializeFees = (f: { label: string; kind: string; amountKobo: number | null; note: string | null }[]) => f.map((x) => `${x.label} | ${x.kind} | ${x.amountKobo === null ? "" : koboToDecimal(x.amountKobo).replace(/\.00$/, "")}${x.note ? ` | ${x.note}` : ""}`).join("\n");
