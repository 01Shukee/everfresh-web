import { formatNaira } from "../lib/money";
import type { Repo } from "./repo";

export interface HomeMenu { items: { id: string; name: string; price: string; imageUrl: string | null; imageAlt: string }[]; categories: string[] }
/** Live menu highlights for the homepage: only enabled, available items in enabled categories, items with photos first. Prices come straight from the menu. */
export async function loadHomeMenu(repo: Repo): Promise<HomeMenu> {
  const [cats, items] = await Promise.all([repo.listCategories(), repo.listItems()]); const ok = new Set(cats.filter((c) => c.active).map((c) => c.id));
  const live = items.filter((i) => i.active && i.available && ok.has(i.categoryId));
  const pick = [...live.filter((i) => i.imageUrl), ...live.filter((i) => !i.imageUrl)].slice(0, 6);
  const withItems = new Set(live.map((i) => i.categoryId));
  return { items: pick.map((i) => ({ id: i.id, name: i.name, price: (i.variants.length ? "From " : "") + formatNaira(i.variants.length ? Math.min(...i.variants.map((v) => v.priceKobo)) : i.basePriceKobo), imageUrl: i.imageUrl, imageAlt: i.imageAlt })), categories: cats.filter((c) => c.active && withItems.has(c.id)).slice(0, 4).map((c) => c.name) };
}
