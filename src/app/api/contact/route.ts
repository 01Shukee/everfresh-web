import { readJson, send, clientId } from "@/server/route-utils";
import { getRepo } from "@/server/runtime";
import { submitContact } from "@/server/site/contact";
export async function POST(req: Request) { const b = await readJson(req, 16_384).catch(() => null); return send(await submitContact(await getRepo(), b, clientId(req), new Date())); }
