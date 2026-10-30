import { timingSafeEqual } from "node:crypto";
import { flushOutbox, mailerFromEnv } from "@/server/email";
import { getRepo } from "@/server/runtime";
/** Retry undelivered email. Call from a scheduler with header "Authorization: Bearer <CRON_SECRET>". */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET ?? ""; const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (secret.length < 24 || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return Response.json({ error: "Not allowed." }, { status: 401 });
  return Response.json(await flushOutbox(await getRepo(), mailerFromEnv(), 50));
}
export const GET = run; export const POST = run;
