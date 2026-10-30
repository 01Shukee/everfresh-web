import { handleQuote } from "@/server/api";
import { getDeps } from "@/server/runtime";
import { readJson, send, tooMany } from "@/server/route-utils";
export async function POST(req: Request) { const l = tooMany(req, "quote", 120, 60); if (l) return l; return send(await handleQuote(await getDeps(), await readJson(req).catch(() => null))); }
