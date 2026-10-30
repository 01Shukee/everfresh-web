/** Fixed-window per-key limiter (in memory: per server instance; use a shared store such as Redis when scaled out). */
const buckets = new Map<string, { n: number; start: number }>();
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key); if (!b || now - b.start > windowMs) { buckets.set(key, { n: 1, start: now }); if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k); return true; }
  b.n++; return b.n <= max;
}
export const resetRateLimits = () => buckets.clear();
