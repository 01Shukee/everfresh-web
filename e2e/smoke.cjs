const { chromium } = require("playwright"); const crypto = require("crypto"); const B = process.env.B; const out = []; const check = (n, ok, d = "") => out.push({ n, ok: !!ok, d: ok ? "" : String(d).slice(0, 300) });
const b32 = (s) => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const o = []; for (const c of s.replace(/[\s=]/g, "")) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret, atMs = Date.now()) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000))); const h = crypto.createHmac("sha1", b32(secret)).update(m).digest(); const o = h[19] & 15; return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, "0"); };
const hdr = { Origin: B, "content-type": "application/json" };
(async () => {
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const issues = []; p.on("pageerror", (e) => issues.push(e.message));
  // public pages
  await p.goto(B + "/"); await p.waitForSelector("h1"); check("home renders with the three doors", (await p.$$eval("a.door", (a) => a.map((x) => x.getAttribute("href")))).join() === "/order-food,/vocational-studies,/event-catering");
  for (const u of ["/about", "/contact", "/order-food"]) { await p.goto(B + u); check(`${u} renders`, await p.locator("h1").first().isVisible()); }
  // owner: password only -> admin is locked until two-factor is set up
  const login = async (page, email, code) => { await page.goto(B + "/admin"); await page.fill("#em", email); await page.fill("#pw", "correct horse battery"); await Promise.all([page.waitForResponse((r) => r.url().includes("/api/admin/login")), page.click("button:has-text('Sign in')")]); if (code) { await page.waitForSelector("#code"); await page.fill("#code", code); await Promise.all([page.waitForResponse((r) => r.url().includes("/api/admin/login")), page.click("button:has-text('Sign in')")]); } };
  await login(p, "owner@test.example"); await p.waitForTimeout(600); await p.goto(B + "/admin"); await p.waitForSelector(".admin");
  check("owner without 2FA is held on My account with other tabs disabled", (await p.locator("text=requires two-factor").first().isVisible()) && (await p.locator("nav[aria-label='Admin sections'] button:has-text('Orders')").isDisabled()));
  const gated = await ctx.request.get(B + "/api/admin/orders"); check("server refuses admin data until 2FA is on (403 with explanation)", gated.status() === 403 && /two-factor/i.test((await gated.json()).error));
  await p.click("button:has-text('Set up two-factor sign-in')"); await p.waitForSelector("[data-testid=secret]"); const secret = (await p.locator("[data-testid=secret]").textContent()).trim();
  await p.fill("#e-code", "000000"); await p.click("button:has-text('Turn on')"); await p.waitForSelector(".alert:has-text('not correct')"); check("wrong enrolment code refused", true);
  await p.fill("#e-code", totp(secret)); await p.click("button:has-text('Turn on')"); await p.waitForSelector("[data-testid=recovery]"); const rec = (await p.locator("[data-testid=recovery]").textContent()).trim().split("\n"); check("8 recovery codes shown once", rec.length === 8 && rec.every((c) => /^[a-z2-7]{5}-[a-z2-7]{5}$/.test(c)), rec.join());
  await p.click("button:has-text('I have saved them')"); await p.waitForSelector(".admin"); check("after enrolment the owner sees every area", (await p.locator("nav[aria-label='Admin sections'] button").count()) >= 9); check("server now allows admin data", (await ctx.request.get(B + "/api/admin/orders")).status() === 200);
  // every admin tab opens without errors (owner)
  const tabs = await p.locator("nav[aria-label='Admin sections'] button").allTextContents(); const errBefore = issues.length;
  for (const t of tabs) { await p.click(`nav[aria-label='Admin sections'] button:has-text('${t}')`); await p.waitForTimeout(350); const sub = await p.locator("nav[aria-label$='sections'].sub button").allTextContents().catch(() => []); for (const st of sub) { await p.click(`nav.sub button:has-text("${st}")`); await p.waitForTimeout(250); } }
  check(`all ${tabs.length} admin tabs (and their sub-tabs) open without uncaught errors`, issues.length === errBefore, issues.slice(errBefore).join(" | "));
  // sign out, then sign in needing the code
  await p.click("button:has-text('Sign out')"); await p.waitForSelector("#em");
  const fresh = await br.newContext(); const fp = await fresh.newPage();
  await login(fp, "owner@test.example"); await fp.waitForSelector("#code"); check("sign-in asks for the code after the password", await fp.locator("text=6-digit code").first().isVisible());
  await fp.fill("#code", "123456"); await Promise.all([fp.waitForResponse((r) => r.url().includes("/api/admin/login")), fp.click("button:has-text('Sign in')")]); await fp.waitForSelector(".alert, .err", { timeout: 3000 }).catch(() => {}); check("wrong code refused", (await fp.locator("#em").isVisible()) && !(await fp.locator(".admin").count()));
  await fp.fill("#code", totp(secret, Date.now() + 30000)); await Promise.all([fp.waitForNavigation({ timeout: 8000 }).catch(() => {}), fp.click("button:has-text('Sign in')")]); await fp.waitForSelector(".admin", { timeout: 8000 }); check("correct code signs in", true);
  const rc = await br.newContext(); const rp = await rc.newPage(); await login(rp, "owner@test.example", rec[0]); await rp.waitForSelector(".admin", { timeout: 8000 }).catch(() => {}); check("a recovery code signs in once", await rp.locator(".admin").count() === 1);
  const rc2 = await br.newContext(); const rp2 = await rc2.newPage(); await login(rp2, "owner@test.example", rec[0]); await rp2.waitForTimeout(600); check("the same recovery code cannot be reused", (await rp2.locator(".admin").count()) === 0);
  // editor: optional 2FA, tab limits, server refusal
  const ec = await br.newContext(); const ep = await ec.newPage(); await login(ep, "editor@test.example"); await ep.goto(B + "/admin"); await ep.waitForSelector(".admin");
  check("editor signs in without 2FA and sees only Website and My account", (await ep.locator("nav[aria-label='Admin sections'] button").allTextContents()).join("|") === "Website|My account");
  check("editor is refused orders and users on the server", (await ec.request.get(B + "/api/admin/orders")).status() === 403 && (await ec.request.get(B + "/api/admin/users")).status() === 403);
  await ep.click("button:has-text('My account')"); check("editor is offered optional two-factor", await ep.locator("button:has-text('Set up two-factor sign-in')").isVisible());
  // mobile overflow on the sign-in page
  const mc = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const mp = await mc.newPage(); await mp.goto(B + "/admin"); await mp.waitForSelector("#em"); check("mobile sign-in has no horizontal overflow", (await mp.evaluate(() => document.documentElement.scrollWidth)) <= 391);
  check("no uncaught page errors", issues.length === 0, issues.join(" | ")); await br.close();
  const bad = out.filter((x) => !x.ok); console.log(bad.length ? "FAILURES:\n" + bad.map((x) => `- ${x.n}: ${x.d}`).join("\n") : "ALL PASSED", `\n${out.length} checks`);
})().catch((e) => { console.log("FATAL", e.message.slice(0, 500)); console.log(out.filter((x) => !x.ok).map((x) => `- ${x.n}: ${x.d}`).join("\n")); process.exit(1); });
