/** Branded HTML email shell. Email clients ignore web fonts and most CSS, so this is table-based with inline styles, uses Georgia for headings, and adapts to phones with one small media query. */
export const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const BRAND = { green: "#2E9E34", deep: "#1B6B28", amber: "#FDB10F", cream: "#FAF8F2", ink: "#1E1E1E", line: "#E6E1D3" };
const SERIF = "Georgia,'Times New Roman',serif"; const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const para = (html: string) => `<p style="margin:0 0 14px;font:16px/1.6 ${SANS};color:${BRAND.ink}">${html}</p>`;
export const heading = (t: string) => `<h2 style="margin:26px 0 10px;font:700 20px/1.25 ${SERIF};color:${BRAND.deep}">${esc(t)}</h2>`;
export const button = (label: string, url: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="background:${BRAND.deep};border-radius:999px;box-shadow:0 4px 0 -1px ${BRAND.amber}"><a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font:700 16px/1 ${SANS};color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;
export const refBadge = (ref: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:${BRAND.amber};border-radius:10px;padding:10px 16px;font:700 18px/1 ${SANS};color:${BRAND.ink};letter-spacing:.04em">${esc(ref)}</td></tr></table>`;
/** Label / value rows. Values are escaped here; pass null to skip a row. */
export function kv(rows: [string, string | null | undefined][]) {
  const r = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;border-collapse:separate;overflow:hidden">${r.map(([k, v], i) => `<tr><td class="kv-k" style="padding:10px 14px;width:36%;vertical-align:top;background:${i % 2 ? "#ffffff" : BRAND.cream};font:700 13px/1.4 ${SANS};color:${BRAND.deep};text-transform:uppercase;letter-spacing:.04em">${esc(k)}</td><td class="kv-v" style="padding:10px 14px;vertical-align:top;background:${i % 2 ? "#ffffff" : BRAND.cream};font:15px/1.5 ${SANS};color:${BRAND.ink}">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`;
}
export function money(rows: { label: string; amount: string; strong?: boolean; credit?: boolean }[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;border-collapse:separate;overflow:hidden">${rows.map((x, i) => `<tr><td style="padding:9px 14px;background:${x.strong ? BRAND.cream : "#ffffff"};border-top:${i ? `1px solid ${BRAND.line}` : "0"};font:${x.strong ? "700" : "400"} 15px/1.4 ${SANS};color:${BRAND.ink}">${esc(x.label)}</td><td align="right" style="padding:9px 14px;background:${x.strong ? BRAND.cream : "#ffffff"};border-top:${i ? `1px solid ${BRAND.line}` : "0"};white-space:nowrap;font:${x.strong ? "700" : "400"} 15px/1.4 ${SANS};color:${x.credit ? BRAND.deep : BRAND.ink}">${esc(x.amount)}</td></tr>`).join("")}</table>`;
}
export const steps = (items: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((t, i) => `<tr><td style="width:34px;vertical-align:top;padding:6px 0"><span style="display:inline-block;width:26px;height:26px;border-radius:13px;background:${BRAND.amber};text-align:center;font:700 14px/26px ${SANS};color:${BRAND.ink}">${i + 1}</span></td><td style="padding:6px 0 6px 4px;font:15px/1.55 ${SANS};color:${BRAND.ink}">${t}</td></tr>`).join("")}</table>`;
export const checklist = (items: string[]) => `<ul style="margin:0;padding:0 0 0 20px;font:15px/1.7 ${SANS};color:${BRAND.ink}">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;

export function emailShell(o: { siteUrl: string; preheader: string; title: string; body: string; footerLines?: string[] }) {
  const logo = `${o.siteUrl.replace(/\/$/, "")}/brand/everfresh-emblem-reference.jpg`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.title)}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.pad{padding:22px 18px!important}.kv-k,.kv-v{display:block!important;width:auto!important}.kv-k{padding-bottom:2px!important}.kv-v{padding-top:0!important}}</style></head>
<body style="margin:0;padding:0;background:${BRAND.cream}"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;border-radius:18px;overflow:hidden;background:#ffffff;border:1px solid ${BRAND.line}">
<tr><td style="background:${BRAND.deep};padding:20px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px"><img src="${esc(logo)}" width="48" height="48" alt="" style="display:block;border-radius:24px;border:0;background:#ffffff"></td><td style="font:italic 700 26px/1 ${SERIF};color:#ffffff">Everfresh</td></tr></table></td></tr>
<tr><td style="background:${BRAND.amber};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
<tr><td class="pad" style="padding:30px 32px 26px"><h1 style="margin:0 0 16px;font:700 28px/1.2 ${SERIF};color:${BRAND.deep}">${esc(o.title)}</h1>${o.body}</td></tr>
<tr><td style="background:${BRAND.cream};padding:20px 32px;border-top:1px solid ${BRAND.line};font:13px/1.6 ${SANS};color:#555">${(o.footerLines ?? []).map((l) => `<div>${l}</div>`).join("")}<div style="margin-top:8px;color:${BRAND.deep};font-weight:700">Everfresh Creations Ltd</div></td></tr>
</table></td></tr></table></body></html>`;
}
