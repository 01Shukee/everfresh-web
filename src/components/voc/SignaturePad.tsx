"use client";
import { useRef, useState } from "react";

/** The school's form has short signature lines, so the drawing is trimmed to its strokes: a small signature then fills the space instead of shrinking to a speck. */
function trimmed(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d"); if (!ctx) return c.toDataURL("image/png");
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height); let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c.toDataURL("image/png");
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
/** A drawn signature. onChange gives a PNG data URL after each stroke, or null when cleared. If a signature is already saved, it is shown as saved until the person chooses to sign again. */
export function SignaturePad({ label, saved, pending, onChange }: { label: string; saved: boolean; pending: boolean; onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [has, setHas] = useState(false); const [redo, setRedo] = useState(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = ref.current!; const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height }; };
  const style = (ctx: CanvasRenderingContext2D) => { ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1E1E1E"; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = ref.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return; e.preventDefault(); c.setPointerCapture(e.pointerId); drawing.current = true; style(ctx); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke(); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = ref.current?.getContext("2d"); if (!ctx) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = () => { if (!drawing.current) return; drawing.current = false; setHas(true); if (ref.current) onChange(trimmed(ref.current)); };
  const clear = () => { const c = ref.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); setHas(false); onChange(null); };
  if (saved && !redo && !pending) return <div className="sigsaved" role="status"><span>&#10003; Signature saved</span><button type="button" className="linkbtn" onClick={() => setRedo(true)}>Sign again</button></div>;
  return (
    <div className="sigpad">
      <canvas ref={ref} width={600} height={200} aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="sigtools"><span className="small dim0">{has ? "Signature drawn." : "Sign inside the box with your finger or mouse."}</span>{has && <button type="button" className="linkbtn" onClick={clear}>Clear</button>}</div>
    </div>
  );
}