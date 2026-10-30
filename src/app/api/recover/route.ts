import { readJson, tooMany } from "@/server/route-utils";
import { getRepo } from "@/server/runtime";
import { recoverRecords } from "@/server/recover";
export async function POST(req: Request) {
  const l = tooMany(req, "recover", 10, 3600); if (l) return l; const b = (await readJson(req, 4096).catch(() => null)) as { email?: string } | null;
  const r = await recoverRecords(await getRepo(), b?.email); return Response.json(r.body, { status: r.status });
}
