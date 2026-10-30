"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nav } from "@/config/site";
import { CartButton } from "@/components/order/CartButton";

export function SiteHeader({ brand }: { brand?: { name: string; emblemUrl: string | null } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { closeRef.current?.focus(); document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = () => { setOpen(false); menuBtn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab" || !overlay.current) return;
    const f = overlay.current.querySelectorAll<HTMLElement>("a,button");
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  return (
    <header className="nav">
      <div className="wrap navbar">
        <Link href="/" className="logo" aria-label="Everfresh home">
          <img className="mark" src={brand?.emblemUrl ?? "/brand/everfresh-emblem-reference.jpg"} alt="" width={40} height={40} />
          <span className="serif wm">{brand?.name ?? "Everfresh"}</span>
        </Link>
        <nav className="links" aria-label="Primary">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={n.cta ? "pill sm" : active(n.href) ? "cur" : undefined}>{n.label}</Link>
          ))}
        </nav>
        <CartButton />
        <button ref={menuBtn} className="pill burger" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(true)}>Menu</button>
      </div>
      {open && (
        <div id="mobile-menu" ref={overlay} className="ov" role="dialog" aria-modal="true" aria-label="Menu" onKeyDown={onKey}>
          <button ref={closeRef} className="pill ghost close" onClick={close}>Close</button>
          {nav.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.label}</Link>)}
        </div>
      )}
    </header>
  );
}
