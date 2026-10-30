import { saveItem } from "@/server/admin-api";
import { getRepo } from "@/server/runtime";
import { adminGuard, readJson, send } from "@/server/route-utils";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await adminGuard(req); if (g) return g; const repo = await getRepo();
  return Response.json({ items: await repo.listItems(), categories: await repo.listCategories() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) { const g = await adminGuard(req); if (g) return g; return send(await saveItem(await getRepo(), await readJson(req).catch(() => null))); }
