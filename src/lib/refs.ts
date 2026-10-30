/** Payment references are BASE or BASE-A2 / BASE-P2 where BASE is exactly three dash-separated parts (e.g. VA-261010-A123). Never strip by pattern: a base can legitimately end in "-A123". */
export const baseRef = (r: string) => r.split("-").slice(0, 3).join("-");
