/** The one rule for every photo address the admin can enter (menu items, vocational and catering photos, homepage, About, brand).
 *  Accepts an uploaded photo (/uploads/...), a file shipped with the site (/media/...) or the web address of an image. A plain http:// address is saved as https://,
 *  because browsers refuse to show http images on an https website; the address must be the image file itself, not a web page that contains it. */
export function cleanImageUrl(v: unknown, max = 400): string | null {
  let x = typeof v === "string" ? v.trim() : ""; if (!x || x.length > max) return null;
  if (x.startsWith("//")) x = `https:${x}`; else if (/^http:\/\//i.test(x)) x = `https://${x.slice(7)}`; else if (/^https:\/\//i.test(x)) x = `https://${x.slice(8)}`;
  if (x.startsWith("/") && x.split("/").includes("..")) return null; // a local path may never climb out of its folder
  return /^(\/(media|uploads)\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/.test(x) ? x : null;
}
export const IMAGE_URL_HELP = "Use Upload photo, or paste the direct link to the image file (starting with https://).";
