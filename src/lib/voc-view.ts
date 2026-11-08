import { vocConfig } from "../config/vocational";
import type { VariantContent } from "../server/voc/model";
import { startingPrice } from "../server/voc/pricing";
import { formatNaira } from "./money";
/** Display text for the price on a programme card: only confirmed amounts are shown. */
export function tuitionText(c: VariantContent): string | null {
  const p = startingPrice(c); return p ? `${p.from ? "From " : ""}${formatNaira(p.kobo)}` : null;
}
/** How the application-form fee relates to the other charges, in words (follows vocConfig.applicationFee). */
export const feeNote = () => (vocConfig.applicationFee.creditedToTuition ? "non-refundable, and part of your total fees: it is deducted from your programme invoice" : "non-refundable and separate from tuition and other charges");
