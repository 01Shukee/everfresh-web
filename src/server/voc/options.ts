import { VARIANTS } from "../../config/vocational";
import { tuitionText } from "../../lib/voc-view";
import { getRepo } from "../runtime";
import { getContent } from "./applications";

export async function loadOptions() {
  const repo = await getRepo();
  return Promise.all(VARIANTS.map(async (v) => { const c = await getContent(repo, v.id); return { variantId: v.id as string, open: c.open, courses: c.courses.map((x) => x.name), tuition: tuitionText(c) }; }));
}
