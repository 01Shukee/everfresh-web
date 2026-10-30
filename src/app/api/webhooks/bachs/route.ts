import { env, getRepo } from "@/server/runtime";
import { handleBachsWebhook } from "@/server/webhook";
export async function POST(req: Request) {
  const raw = await req.text(); // raw body is required for signature verification
  if (raw.length > 262_144) return new Response("too large", { status: 413 });
  try {
    const r = await handleBachsWebhook(raw, req.headers, { repo: await getRepo(), secrets: env.webhookSecrets() });
    return new Response(r.body, { status: r.status });
  } catch (e) { console.error("[bachs webhook]", e); return new Response("error", { status: 500 }); } // 5xx makes Bachs retry
}
