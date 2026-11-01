"use client";
import { useState } from "react";
import { VideoPlayer } from "@/components/ui/VideoPlayer";

export interface HomeVideo { id: string; name: string; src: string | null; poster: string | null; captions: string | null }
const PLACEHOLDER: HomeVideo[] = [{ id: "kitchen", name: "Kitchen", src: null, poster: null, captions: null }, { id: "workshop", name: "Workshop", src: null, poster: null, captions: null }, { id: "events", name: "Events", src: null, poster: null, captions: null }];
export function VideoShowcase({ videos }: { videos: HomeVideo[] }) {
  const list = videos.length ? videos : PLACEHOLDER; const [i, setI] = useState(0);
  const v = list[i] ?? list[0];
  return (
    <section className="sec dark videos" aria-labelledby="hv">
      <div className="wrap grid2">
        <div>
          <span className="lab">Video showcase</span>
          <h2 id="hv" className="serif">See it in action.</h2>
          {list.map((c, n) => (
            <button key={c.id} className={n === i ? "ix on" : "ix"} aria-pressed={n === i} onClick={() => setI(n)}>
              <span className="serif">{c.name}</span>{!c.src && <span className="lab">[VIDEO]</span>}
            </button>
          ))}
        </div>
        <div className="screen">
          {v.src ? (
            <VideoPlayer key={v.id} src={v.src} poster={v.poster} captions={v.captions} title={v.name} />
          ) : (
            <div className="empty-video" role="status">
              <button className="pill cream playbtn" disabled aria-label={`${v.name} video not yet available`}>&#9654;</button>
              <span className="lab">{v.name} video coming soon</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}