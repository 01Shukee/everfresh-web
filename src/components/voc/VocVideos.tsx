"use client";
import { useState } from "react";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import type { VideoItem } from "@/server/voc/model";

export function VocVideos({ videos }: { videos: VideoItem[] }) {
  const [i, setI] = useState(0); const v = videos[i];
  return (
    <section className="sec dark videos" aria-labelledby="hvv"><div className="wrap grid2">
      <div><span className="lab">Video showcase</span><h2 id="hvv" className="serif">Watch the practice.</h2>
        {videos.length === 0 ? <p>Training videos will appear here.</p> : videos.map((x, n) => <button key={x.id} className={n === i ? "ix on" : "ix"} aria-pressed={n === i} onClick={() => setI(n)}><span className="serif">{x.title}</span></button>)}</div>
      <div className="screen">{v ? <VideoPlayer key={v.id} src={v.src} poster={v.poster} captions={v.captions} title={v.title} />
        : <div className="empty-video" role="status"><button className="pill cream playbtn" disabled aria-label="No video available yet">&#9654;</button><span className="lab">Training videos coming soon</span></div>}</div>
    </div></section>
  );
}