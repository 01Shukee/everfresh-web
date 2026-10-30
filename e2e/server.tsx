// Verification harness: serves the REAL route handlers and React components over HTTP (no Next.js). Not part of the product.
import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { createRequire } from "node:module";
import * as ReactNS from "react"; (globalThis as any).React = ReactNS;
const ROOT = path.resolve(__dirname, ".."); const SRC = path.join(ROOT, "src"); const PORT = Number(process.env.PORT ?? 4600);
Object.assign(process.env, { ADMIN_SESSION_SECRET: "s".repeat(40), SITE_URL: `http://localhost:${PORT}`, NEXT_PUBLIC_SHOW_PLACEHOLDERS: "true" }); process.env.REQUIRE_2FA_ROLES ??= "owner,manager";
(async () => {
const { getRepo } = await import("@/server/runtime"); const { createUser, userFromCookie, COOKIE } = await import("@/server/auth"); const { getSettings } = await import("@/server/site/settings"); const { loadHomeMenu } = await import("@/server/home"); const { publicVocational } = await import("@/server/voc/admin"); const { whatsappDigitsFor } = await import("@/server/runtime"); const { handleMenu } = await import("@/server/api"); const { getDeps } = await import("@/server/runtime");
const repo = await getRepo();
for (const [email, name, role] of [["owner@test.example", "Test Owner", "owner"], ["editor@test.example", "Test Editor", "editor"], ["food@test.example", "Test Food", "food_staff"]] as const) await createUser(repo, { email, name, role, password: "correct horse battery", mustChangePassword: false });
// route table from the filesystem: src/app/api/**/route.ts
const routes: { re: RegExp; keys: string[]; file: string }[] = [];
(function walk(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "route.ts") { const rel = path.relative(path.join(SRC, "app"), d).split(path.sep); const keys: string[] = []; const re = "^/" + rel.map((s) => { const m = /^\[\[\.\.\.(\w+)\]\]$/.exec(s); if (m) { keys.push("*" + m[1]); return "(?:(.*))?"; } const n = /^\[(\w+)\]$/.exec(s); if (n) { keys.push(n[1]); return "([^/]+)"; } return s; }).join("/") + "$"; routes.push({ re: new RegExp(re.replace("/(?:(.*))?", "(?:/(.*))?")), keys, file: p }); } } })(path.join(SRC, "app", "api"));
// like Next.js: static segments win over [param], which win over catch-all
  routes.sort((a, b) => Number(a.keys.some((k) => k.startsWith("*"))) - Number(b.keys.some((k) => k.startsWith("*"))) || a.keys.length - b.keys.length || b.re.source.length - a.re.source.length);
const esbuild = createRequire("/home/claude/.npm-global/lib/node_modules/tsx/")("esbuild");
esbuild.buildSync({ entryPoints: [path.join(__dirname, "client.tsx")], bundle: true, outfile: path.join(__dirname, ".client.js"), tsconfig: path.join(__dirname, "tsconfig.json"), nodePaths: ["/home/claude/.npm-global/lib/node_modules"], jsx: "automatic", define: { "process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS": '"true"', "process.env.NODE_ENV": '"development"' }, logLevel: "warning" });
const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
const cookieOf = (r: http.IncomingMessage) => r.headers.cookie?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === COOKIE)?.[1];
const server = http.createServer(async (rq, rs) => {
  try {
    const u = new URL(rq.url!, `http://localhost:${PORT}`); const p = u.pathname; const html = (s: string, code = 200) => { rs.statusCode = code; rs.setHeader("content-type", "text/html"); rs.end(s); };
    if (p === "/client.js") { rs.setHeader("content-type", "text/javascript"); return rs.end(fs.readFileSync(path.join(__dirname, ".client.js"))); }
    if (p.startsWith("/brand/")) { const f = path.join(ROOT, "public", p); if (fs.existsSync(f)) { rs.setHeader("content-type", "image/jpeg"); return rs.end(fs.readFileSync(f)); } }
    if (p.startsWith("/api/")) {
      const chunks: Buffer[] = []; for await (const c of rq) chunks.push(c); const body = Buffer.concat(chunks);
      for (const r of routes) { const m = r.re.exec(p); if (!m) continue; const params: any = {}; r.keys.forEach((k, i) => { params[k.replace("*", "")] = k.startsWith("*") ? (m[i + 1] ? m[i + 1].split("/") : []) : m[i + 1]; });
        const mod: any = await import(r.file); const h = mod[rq.method!]; if (!h) { rs.statusCode = 405; return rs.end(); }
        const res: Response = await h(new Request(`http://localhost:${PORT}${rq.url}`, { method: rq.method, headers: rq.headers as any, body: ["GET", "HEAD"].includes(rq.method!) ? undefined : body, duplex: "half" } as any), { params: Promise.resolve(params) });
        const sc = res.headers.getSetCookie(); res.headers.forEach((v, k) => k !== "set-cookie" && rs.setHeader(k, v)); if (sc.length) rs.setHeader("set-cookie", sc); rs.statusCode = res.status; return rs.end(Buffer.from(await res.arrayBuffer())); }
      rs.statusCode = 404; return rs.end("no route");
    }
    const settings = await getSettings(repo); const wa = await whatsappDigitsFor(repo); const pub = await publicVocational(repo);
    const data: Record<string, [string, unknown]> = { "/": ["home", { menu: await loadHomeMenu(repo), settings, whatsapp: wa, testimonials: pub.testimonials, videos: pub.videos }], "/about": ["about", settings], "/contact": ["contact", { s: settings, whatsapp: wa }], "/order-food": ["menu", (await handleMenu(await getDeps()) as any).body], "/admin": ["admin", null] };
    if (data[p]) { const me = p === "/admin" ? await userFromCookie(repo, cookieOf(rq), process.env.ADMIN_SESSION_SECRET) : null; const { requires2fa } = await import("@/server/auth");
      const meJson = me ? { name: me.name, email: me.email, role: me.role, mustChangePassword: me.mustChangePassword, needs2fa: requires2fa(me), twoFactor: !!me.totp?.enabled } : null;
      return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>harness</title><style>${css}</style></head><body><div id="root"></div><script>window.__PAGE__=${JSON.stringify(data[p][0])};window.__BODY__=${JSON.stringify(data[p][1]).replace(/</g, "\\u003c")};window.__SETTINGS__=${JSON.stringify(settings).replace(/</g, "\\u003c")};window.__ME__=${JSON.stringify(meJson)};</script><script src="/client.js"></script></body></html>`); }
    rs.statusCode = 404; rs.end("not found");
  } catch (e) { console.error("SERVER ERROR", e); rs.statusCode = 500; rs.end("error"); }
});
server.listen(PORT, () => console.log("ready"));
})().catch((e) => { console.error("HARNESS FAILED", e); process.exit(1); });
