import { showPlaceholders } from "@/config/site";
import type { Media } from "@/content/home";

type Props = { media?: Media | null; label: string; shape?: "rect" | "circle" | "arch"; className?: string; style?: React.CSSProperties; priority?: boolean };

/** Renders a genuine image when supplied; otherwise a designed, clearly labelled placeholder (or nothing in production). */
export function MediaSlot({ media, label, shape = "rect", className = "", style, priority }: Props) {
  if (media) {
    // Keep the intended shape after the file loads: without it a portrait upload becomes a tall card and a landscape one a short card. object-fit: cover crops to this ratio.
    const shaped = media.width && media.height && style?.height === undefined ? { aspectRatio: `${media.width} / ${media.height}`, ...style } : style;
    return <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading={priority ? "eager" : "lazy"} className={`media ${shape} ${className}`} style={shaped} />;
  }
  if (!showPlaceholders) return null;
  return (
    <div role="img" aria-label={`Placeholder for photo: ${label}`} className={`slot ${shape} ${className}`} style={style}>
      <span>PHOTO SLOT<br />[{label}]</span>
    </div>
  );
}
