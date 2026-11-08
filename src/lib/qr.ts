/**
 * Small QR code generator (no dependencies): byte mode, error-correction level M, versions 1 to 10 (up to ~213 characters), which is plenty for a menu link.
 * qrMatrix() returns the dark/light grid; qrSvg() draws it. Follows ISO/IEC 18004.
 */
// Per version (1..10), ECC level M: [total codewords, EC codewords per block, blocks in group 1, data codewords per group-1 block, blocks in group 2, data per group-2 block]
const M_TABLE: number[][] = [[26, 10, 1, 16, 0, 0], [44, 16, 1, 28, 0, 0], [70, 26, 1, 44, 0, 0], [100, 18, 2, 32, 0, 0], [134, 24, 2, 43, 0, 0], [172, 16, 4, 27, 0, 0], [196, 18, 4, 31, 0, 0], [242, 22, 2, 38, 2, 39], [292, 22, 3, 36, 2, 37], [346, 26, 4, 43, 1, 44]];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Array<number>(512), LOG = new Array<number>(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsEncode(data: number[], ecLen: number): number[] {
  let gen = [1]; for (let i = 0; i < ecLen; i++) { const next = new Array(gen.length + 1).fill(0); gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); }); gen = next; }
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) { const f = d ^ res[0]; res.shift(); res.push(0); if (f) gen.slice(1).forEach((g, j) => { res[j] ^= mul(g, f); }); }
  return res;
}
const bits = (v: number, n: number) => Array.from({ length: n }, (_, i) => (v >>> (n - 1 - i)) & 1);

/** forceMask (0 to 7) is for testing only: normally the mask with the lowest penalty is chosen. */
export function qrMatrix(text: string, forceMask?: number): boolean[][] {
  const data = Array.from(new TextEncoder().encode(text)); let version = 0;
  for (let v = 1; v <= 10; v++) { const cap = M_TABLE[v - 1][2] * M_TABLE[v - 1][3] + M_TABLE[v - 1][4] * M_TABLE[v - 1][5]; if (data.length + (v < 10 ? 2 : 3) <= cap) { version = v; break; } }
  if (!version) throw new Error("That link is too long for a QR code.");
  const [, ecLen, g1n, g1d, g2n, g2d] = M_TABLE[version - 1]; const capacity = g1n * g1d + g2n * g2d;
  let b: number[] = [0, 1, 0, 0, ...bits(data.length, version < 10 ? 8 : 16)]; for (const d of data) b.push(...bits(d, 8));
  b.push(...[0, 0, 0, 0].slice(0, Math.min(4, capacity * 8 - b.length))); while (b.length % 8) b.push(0);
  const cw: number[] = []; for (let i = 0; i < b.length; i += 8) cw.push(parseInt(b.slice(i, i + 8).join(""), 2)); for (let p = 0; cw.length < capacity; p++) cw.push(p % 2 ? 0x11 : 0xec);
  const blocks: number[][] = []; let pos = 0; for (let i = 0; i < g1n + g2n; i++) { const n = i < g1n ? g1d : g2d; blocks.push(cw.slice(pos, pos + n)); pos += n; }
  const ecs = blocks.map((bl) => rsEncode(bl, ecLen)); const out: number[] = [];
  for (let i = 0; i < Math.max(g1d, g2d); i++) for (const bl of blocks) if (i < bl.length) out.push(bl[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]);
  const bitsOut: number[] = out.flatMap((c) => bits(c, 8));

  const n = 17 + 4 * version; const mod: (boolean | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null)); const fn: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r: number, c: number, v: boolean, f = true) => { if (r < 0 || c < 0 || r >= n || c >= n) return; mod[r][c] = v; if (f) fn[r][c] = true; };
  const finder = (r0: number, c0: number) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6; set(r0 + dr, c0 + dc, inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version - 1]; for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }
  set(n - 8, 8, true);
  for (let i = 0; i < 9; i++) { if (mod[8][i] === null) { mod[8][i] = false; fn[8][i] = true; } if (mod[i][8] === null) { mod[i][8] = false; fn[i][8] = true; } }
  for (let i = 0; i < 8; i++) { if (mod[8][n - 1 - i] === null) { mod[8][n - 1 - i] = false; fn[8][n - 1 - i] = true; } if (mod[n - 1 - i][8] === null) { mod[n - 1 - i][8] = false; fn[n - 1 - i][8] = true; } }
  if (version >= 7) { let rem = version; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); const vi = (version << 12) | rem; for (let i = 0; i < 18; i++) { const bit = ((vi >>> i) & 1) === 1; const a = n - 11 + (i % 3), c = Math.floor(i / 3); set(c, a, bit); set(a, c, bit); } }
  // data placement, zig-zag from the bottom-right, skipping the vertical timing column
  const dataCells: [number, number][] = []; let up = true;
  for (let c = n - 1; c > 0; c -= 2) { if (c === 6) c = 5; for (let i = 0; i < n; i++) { const r = up ? n - 1 - i : i; for (const cc of [c, c - 1]) if (!fn[r][cc]) dataCells.push([r, cc]); } up = !up; }
  const masks = [(r: number, c: number) => (r + c) % 2 === 0, (r: number) => r % 2 === 0, (_: number, c: number) => c % 3 === 0, (r: number, c: number) => (r + c) % 3 === 0, (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0, (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const build = (mask: number): boolean[][] => {
    const g = mod.map((row) => row.map((v) => v === true)); dataCells.forEach(([r, c], i) => { const bit = (bitsOut[i] ?? 0) === 1; g[r][c] = masks[mask](r, c) ? !bit : bit; });
    const fmt = (() => { let d = (0b00 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); return ((d << 10) | rem) ^ 0x5412; })();
    for (let i = 0; i < 15; i++) { const bit = ((fmt >>> i) & 1) === 1; if (i < 6) g[i][8] = bit; else if (i < 8) g[i + 1][8] = bit; else g[n - 15 + i][8] = bit; if (i < 8) g[8][n - 1 - i] = bit; else if (i < 9) g[8][15 - i] = bit; else g[8][14 - i] = bit; }
    g[n - 8][8] = true; return g;
  };
  const penalty = (g: boolean[][]) => {
    let p = 0; for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1; for (let j = 1; j < n; j++) { const a = pass ? g[j][i] : g[i][j], b2 = pass ? g[j - 1][i] : g[i][j - 1]; if (a === b2) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    const pat = [true, false, true, true, true, false, true, false, false, false, false]; const rev = [...pat].reverse();
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) for (let j = 0; j + 11 <= n; j++) { const seg = Array.from({ length: 11 }, (_, k) => (pass ? g[j + k][i] : g[i][j + k])); if (seg.every((v, k) => v === pat[k]) || seg.every((v, k) => v === rev[k])) p += 40; }
    const dark = g.flat().filter(Boolean).length; p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10; return p;
  };
  if (forceMask !== undefined) return build(forceMask);
  let best = build(0), bp = penalty(best); for (let m = 1; m < 8; m++) { const g = build(m), pp = penalty(g); if (pp < bp) { best = g; bp = pp; } }
  return best;
}
/** An SVG string (dark modules only, so it scales and prints crisply). margin is the quiet zone in modules; QR needs at least 4. */
export function qrSvg(text: string, o: { size?: number; margin?: number; dark?: string; light?: string } = {}): string {
  const g = qrMatrix(text), m = o.margin ?? 4, n = g.length + m * 2, d = g.flatMap((row, r) => row.map((v, c) => (v ? `M${c + m} ${r + m}h1v1h-1z` : ""))).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${o.size ?? 256}" height="${o.size ?? 256}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="${o.light ?? "#ffffff"}"/><path d="${d}" fill="${o.dark ?? "#000000"}"/></svg>`;
}
