import { getRepo } from "@/server/runtime";
/** Liveness/readiness for the host: confirms the database answers. Exposes no data. */
export async function GET() { try { await (await getRepo()).docGet("health", "ping"); return Response.json({ ok: true }); } catch { return Response.json({ ok: false }, { status: 503 }); } }
