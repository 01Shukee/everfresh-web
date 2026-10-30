import { removeItem, saveItem } from "@/server/admin-api";
import { getRepo } from "@/server/runtime";
import { adminGuard, readJson, send } from "@/server/route-utils";
type Ctx = { params: Promise<{ id: string }> };
export async function PUT(req: Request, ctx: Ctx) { const g = await adminGuard(req); if (g) return g; return send(await saveItem(await getRepo(), await readJson(req).catch(() => null), (await ctx.params).id)); }
export async function DELETE(req: Request, ctx: Ctx) { const g = await adminGuard(req); if (g) return g; return send(await removeItem(await getRepo(), (await ctx.params).id)); }
