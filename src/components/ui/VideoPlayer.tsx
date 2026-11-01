"use client";
import { useState } from "react";

/** Plays one video. Mounted per video (give it a key) so switching videos always starts a fresh player. If the file cannot load, a clear message and a direct link replace the broken player. */
export function VideoPlayer({ src, poster, captions, title }: { src: string; poster: string | null; captions: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return (
    <div className="empty-video" role="alert">
      <span className="lab">This video couldn&rsquo;t be loaded.</span>
      <a className="pill cream sm" href={src} target="_blank" rel="noopener noreferrer">Open the video in a new tab</a>
    </div>
  );
  return (
    <video controls playsInline preload="metadata" poster={poster ?? undefined} src={src} aria-label={title} onError={() => setFailed(true)}>
      {captions && <track kind="captions" src={captions} srcLang="en" label="English" default />}
    </video>
  );
}