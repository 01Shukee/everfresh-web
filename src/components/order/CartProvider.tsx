"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QuoteIssue, QuoteView } from "./types";

export interface CartLine { key: string; itemId: string; variantId: string | null; addOnIds: string[]; qty: number; note: string; name: string; label: string; estKobo: number }
interface Ctx {
  lines: CartLine[]; count: number; ready: boolean;
  add: (l: Omit<CartLine, "key">) => void; setQty: (key: string, qty: number) => void; remove: (key: string) => void; clear: () => void;
  quote: QuoteView | null; quoting: boolean; issues: QuoteIssue[]; open: boolean; setOpen: (v: boolean) => void;
}
const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => { const c = useContext(CartCtx); if (!c) throw new Error("useCart outside CartProvider"); return c; };
const STORE = "ef-cart-v1";
const keyOf = (l: Omit<CartLine, "key">) => [l.itemId, l.variantId ?? "", [...l.addOnIds].sort().join(","), l.note.trim()].join("|");

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]); const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null); const [issues, setIssues] = useState<QuoteIssue[]>([]); const [quoting, setQuoting] = useState(false);
  const [open, setOpen] = useState(false); const ctl = useRef<AbortController | null>(null);

  useEffect(() => { try { const s = localStorage.getItem(STORE); if (s) setLines(JSON.parse(s)); } catch { /* storage unavailable */ } setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(STORE, JSON.stringify(lines)); } catch { /* ignore */ } }, [lines, ready]);

  useEffect(() => {   // authoritative totals always come from the server
    if (!ready) return;
    ctl.current?.abort();
    if (!lines.length) { setQuote(null); setIssues([]); setQuoting(false); return; }
    const c = new AbortController(); ctl.current = c; setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/quote", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: lines.map(({ itemId, variantId, addOnIds, qty, note }) => ({ itemId, variantId, addOnIds, qty, note })) }) });
        const j = await r.json();
        if (r.ok) { setQuote(j); setIssues([]); } else { setQuote(null); setIssues(j.errors ?? [{ code: "ERR", message: "Could not price your cart." }]); }
      } catch (e) { if ((e as Error).name !== "AbortError") { setQuote(null); setIssues([{ code: "NETWORK", message: "Could not reach the server. Check your connection." }]); } }
      finally { if (!c.signal.aborted) setQuoting(false); }
    }, 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [lines, ready]);

  const add = useCallback((l: Omit<CartLine, "key">) => setLines((p) => {
    const key = keyOf(l); const i = p.findIndex((x) => x.key === key);
    return i >= 0 ? p.map((x, n) => (n === i ? { ...x, qty: Math.min(x.qty + l.qty, 20) } : x)) : [...p, { ...l, key }];
  }), []);
  const setQty = useCallback((key: string, qty: number) => setLines((p) => p.map((x) => (x.key === key ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x))), []);
  const remove = useCallback((key: string) => setLines((p) => p.filter((x) => x.key !== key)), []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo(() => ({ lines, count: lines.reduce((s, l) => s + l.qty, 0), ready, add, setQty, remove, clear, quote, quoting, issues, open, setOpen }), [lines, ready, add, setQty, remove, clear, quote, quoting, issues, open]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
