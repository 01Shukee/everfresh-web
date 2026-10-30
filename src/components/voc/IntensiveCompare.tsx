"use client";
import { useState } from "react";
import { VARIANTS } from "@/config/vocational";
import { tuitionText } from "@/lib/voc-view";
import type { VariantContent } from "@/server/voc/model";
import { VariantBody } from "./VariantBody";

export function IntensiveCompare({ content }: { content: Record<string, VariantContent> }) {
  const opts = VARIANTS.filter((v) => v.programme === "intensive"); const [sel, setSel] = useState<string>(opts[0].id);
  return (
    <section className="sec" aria-labelledby="hcmp"><div className="wrap">
      <span className="lab green">Compare durations</span><h2 id="hcmp" className="serif green">Choose how long you want to train.</h2>
      <div className="seg durseg" role="radiogroup" aria-label="Duration">{opts.map((v) => <label key={v.id} className={sel === v.id ? "on" : ""}><input type="radio" name="dur" checked={sel === v.id} onChange={() => setSel(v.id)} />{v.durationLabel}</label>)}</div>
      <div className="compare">{opts.map((v) => (
        <article key={v.id} className={`ccol ${sel === v.id ? "sel" : ""}`} aria-label={`${v.durationLabel} option`}>
          <header><span className="lab">Intensive</span><h3 className="serif">{v.durationLabel}</h3><p className="tab">{tuitionText(content[v.id]) ?? <span className="tag">Fees to be confirmed</span>}</p></header>
          <VariantBody c={content[v.id]} compact />
        </article>))}</div>
    </div></section>
  );
}
