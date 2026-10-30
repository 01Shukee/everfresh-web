import { handleCheckout } from "@/server/api";
import { getDeps } from "@/server/runtime";
import { readJson, send, tooMany } from "@/server/route-utils";
export async function POST(req: Request) { const l = tooMany(req, "checkout", 20, 600); if (l) return l; return send(await handleCheckout(await getDeps(), await readJson(req).catch(() => null))); }
