import { readUpload } from "@/server/media";
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const f = await readUpload((await ctx.params).name); if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes), { headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
}
