import { formatNaira } from "./money";
import type { VariantContent } from "../server/voc/model";
/** Display text for tuition: only confirmed amounts are shown. */
export function tuitionText(c: VariantContent): string | null {
  const t = c.fees.filter((f) => f.kind === "tuition" && f.amountKobo !== null);
  return t.length ? (t.length === 1 ? formatNaira(t[0].amountKobo!) : `From ${formatNaira(Math.min(...t.map((x) => x.amountKobo!)))}`) : null;
}
