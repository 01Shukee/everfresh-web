// All money is integer kobo. Decimal strings ("7500.00") exist only at the Bachs boundary.
export type Kobo = number;

export function koboToDecimal(k: Kobo): string {
  const a = Math.abs(k);
  return `${k < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export function decimalToKobo(s: unknown): Kobo | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

export function formatNaira(k: Kobo): string {
  const a = Math.abs(k);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const kobo = a % 100;
  return `${k < 0 ? "-" : ""}\u20A6${whole}${kobo ? "." + String(kobo).padStart(2, "0") : ""}`;
}
