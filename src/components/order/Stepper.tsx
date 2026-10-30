"use client";
export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>&minus;</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}
