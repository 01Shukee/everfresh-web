import { VARIANTS } from "../../config/vocational";
import { tuitionText } from "../../lib/voc-view";
import { getRepo } from "../runtime";
import { getContent } from "./applications";
import { asksAccommodation, choiceCount, choiceCourses } from "./pricing";

export async function loadOptions() {
  const repo = await getRepo();
  return Promise.all(VARIANTS.map(async (v) => {
    const c = await getContent(repo, v.id);
    return {
      variantId: v.id as string, open: c.open, courses: c.courses.map((x) => x.name), tuition: tuitionText(c), hostelChoice: asksAccommodation(c), choose: choiceCount(c),
      choices: choiceCourses(c).map((x) => ({ name: x.name, priceKobo: typeof x.priceKobo === "number" ? x.priceKobo : null })),
      /** Courses every student gets (not chosen from a list). The 1-year programme uses this to show the 6-month package. */
      included: c.courses.filter((x) => x.role !== "choice").map((x) => ({ name: x.name, description: x.description })),
    };
  }));
}