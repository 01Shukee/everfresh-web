/** The Amber Ring: a thick arc drawn once. Marks the active choice; decorative only, never carries information. */
export function Ring({ rotate = 100 }: { rotate?: number }) {
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="46" r="45" pathLength="100" transform={`rotate(${rotate} 50 46)`} />
    </svg>
  );
}
