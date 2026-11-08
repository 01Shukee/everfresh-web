import { readJson, tooMany } from "@/server/route-utils";
import { getRepo, whatsappDigitsFor } from "@/server/runtime";
import { createVipOrder } from "@/server/vip/service";

/** Public: a guest at a VIP table submits their order. The server prices it from the menu, saves it with a reference and returns the WhatsApp link. */
export async function POST(req: Request) {
  const limited = tooMany(req, "vip-order", 20, 600); if (limited) return limited;
  const body = await readJson(req, 32_768).catch(() => null); if (!body) return Response.json({ error: "Please check your order and try again." }, { status: 400 });
  try { const repo = await getRepo(); const r = await createVipOrder(repo, body, { now: new Date(), fallbackDigits: await whatsappDigitsFor(repo) }); return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("[vip] order failed:", e); return Response.json({ error: "We could not process your order. Please tell your waiter." }, { status: 500 }); }
}
