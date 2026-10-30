import { handleOrder } from "@/server/api";
import { getDeps } from "@/server/runtime";
import { send } from "@/server/route-utils";
export async function GET(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const { number } = await ctx.params;
  return send(await handleOrder(await getDeps(), number, new URL(req.url).searchParams.get("t") ?? ""));
}
