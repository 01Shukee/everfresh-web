import { saveCategory } from "@/server/admin-api";
import { getRepo } from "@/server/runtime";
import { adminGuard, readJson, send } from "@/server/route-utils";
export async function POST(req: Request) { const g = await adminGuard(req); if (g) return g; return send(await saveCategory(await getRepo(), await readJson(req).catch(() => null))); }
