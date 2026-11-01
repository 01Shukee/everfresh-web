
/**
 * The one rule for every photo address the admin can enter
 * (menu items, vocational and catering photos, homepage, About, brand).
 *
 * Accepts:
 * - An uploaded photo (/uploads/...)
 * - A file shipped with the site (/media/...)
 * - A direct web address to an image
 *
 * Plain http:// addresses are converted to https://.
 * The address must point directly to the image file, not a webpage.
 */
export function cleanImageUrl(v: unknown, max = 400): string | null {
  let x = typeof v === "string" ? v.trim() : "";

  if (!x || x.length > max) return null;

  if (x.startsWith("//")) {
    x = `https:${x}`;
  } else if (/^http:\/\//i.test(x)) {
    x = `https://${x.slice(7)}`;
  }

  if (x.startsWith("/") && x.split("/").includes("..")) {
    return null;
  }

  return /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/i.test(x)
    ? x
    : null;
}

export const IMAGE_URL_HELP =
  "Use Upload photo, or paste the direct link to the image file (starting with https://).";
