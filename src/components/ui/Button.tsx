import Link from "next/link";
import type { ReactNode } from "react";

type Props = { href: string; children: ReactNode; tone?: "solid" | "cream" | "ghost"; className?: string; small?: boolean };

export function Button({ href, children, tone = "solid", className = "", small }: Props) {
  return (
    <Link href={href} className={`pill ${tone === "solid" ? "" : tone} ${small ? "sm" : ""} ${className}`.trim()}>
      {children}
      <span className="dot" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E1E1E" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </Link>
  );
}
