"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import "./toast.css";

export type ToastKind = "success" | "error" | "info";
export interface ToastItem { id: number; kind: ToastKind; text: string }

/** Floating notices that stay on screen while the person scrolls. Errors stay longer than successes and can be dismissed. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1); const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => { const t = timers.current.get(id); if (t) clearTimeout(t); timers.current.delete(id); setToasts((list) => list.filter((x) => x.id !== id)); }, []);
  const push = useCallback((text: string, kind: ToastKind = "info") => {
    const id = next.current++;
    setToasts((list) => [...list.filter((x) => x.text !== text), { id, kind, text }].slice(-4));   // the same message never shows twice; at most 4 at once
    timers.current.set(id, setTimeout(() => dismiss(id), kind === "error" ? 12000 : 5000));
  }, [dismiss]);
  useEffect(() => { const all = timers.current; return () => { all.forEach((t) => clearTimeout(t)); }; }, []);
  return { toasts, push, dismiss };
}

const ICON: Record<ToastKind, string> = { success: "\u2713", error: "!", info: "i" };
export function ToastStack({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <span className="ticon" aria-hidden="true">{ICON[t.kind]}</span>
          <p>{t.text}</p>
          <button type="button" aria-label="Dismiss this message" onClick={() => dismiss(t.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
}