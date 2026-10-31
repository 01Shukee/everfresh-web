/** Photo shown beside a page heading. Renders nothing when no photo is set (so removing it in the admin leaves no gap). */
export function HeroPhoto({ photo }: { photo?: { src: string; alt: string } | null }) {
  if (!photo) return null;
  return <div className="herophoto"><img className="media" src={photo.src} alt={photo.alt} width={1200} height={800} loading="eager" /></div>;
}
