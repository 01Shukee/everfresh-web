import { handleMenu } from "@/server/api";
import { getDeps } from "@/server/runtime";
import { send } from "@/server/route-utils";
export const dynamic = "force-dynamic";
export async function GET() { return send(await handleMenu(await getDeps())); }
