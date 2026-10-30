import { showPlaceholders } from "@/config/site";

/** Shows the value, or a clearly labelled placeholder while the business detail is missing. */
export function Ph({ k, value }: { k: string; value?: string | null }) {
  if (value) return <>{value}</>;
  return showPlaceholders ? <span className="ph">[{k}]</span> : null;
}
