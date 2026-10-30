import { handleRetry } from "@/server/api";
import { getDeps } from "@/server/runtime";
import { readJson, send, tooMany } from "@/server/route-utils";
export async function POST(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const l = tooMany(req, "order-retry", 20, 3600); if (l) return l;
  const { number } = await ctx.params; const b = (await readJson(req).catch(() => null)) as { token?: string } | null;
  return send(await handleRetry(await getDeps(), number, b?.token ?? ""));
}
