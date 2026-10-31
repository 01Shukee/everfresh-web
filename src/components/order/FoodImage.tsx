"use client";
import { useState } from "react";

/** Dish photo with a graceful fallback. Same circular crop and size classes as before (object-fit: cover from .media), lazy and async-decoded.
 *  If there is no photo, or it fails to load, a neutral plate tile is shown instead: never a different dish and never a broken-image icon. */
export function FoodImage({ src, alt, size, className = "" }: { src: string | null; alt: string; size: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <div className={`slot circle foodfb ${className}`} aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="12" /><circle cx="24" cy="24" r="6" /><path d="M5 8v10a3 3 0 0 0 3 3v19M11 8v13M8 8v13" /><path d="M43 8c-3 2-4 7-4 12h4v20" /></svg>
      </div>
    );
  }
  // A photo that already failed before React attached onError (server-rendered page) is caught by the ref check.
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" decoding="async" className={`media circle ${className}`} onError={() => setFailed(src)} ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setFailed(src); }} />;
}
