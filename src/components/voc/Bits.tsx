import { showPlaceholders } from "@/config/site";
/** Marks content the institution has not supplied yet. Hidden in production when placeholders are switched off. */
export function Tbc({ what }: { what: string }) { return showPlaceholders ? <span className="ph">[{what.toUpperCase()}: TO BE SUPPLIED]</span> : null; }
export function Kv({ k, children }: { k: string; children: React.ReactNode }) { return <><dt>{k}</dt><dd>{children}</dd></>; }
