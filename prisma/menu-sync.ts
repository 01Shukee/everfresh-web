
import { existsSync } from "node:fs";
import { join } from "node:path";
import { saveCategory, saveItem } from "../src/server/admin-api";
import type { Repo } from "../src/server/repo";
import type { Category, MenuItem } from "../src/server/types";
import {
  CATEGORIES,
  MENU,
  SAMPLE_CATEGORIES,
  SAMPLE_DISHES,
  type MenuSeed,
} from "./menu-data";

export interface SyncOptions {
  reorderOnly?: boolean;
  force?: boolean;
  keepSamples?: boolean;
  imagesOnly?: boolean;
  dryRun?: boolean;
  publicDir?: string;
  log?: (m: string) => void;
}

export interface SyncReport {
  reordered?: number;
  created: string[];
  replaced: string[];
  keptAsIs: string[];
  retired: string[];
  retiredCategories: string[];
  imagesSet: string[];
  skipped?: string;
}

const MARKER = "everfresh-menu-v1";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ILLUSTRATIONS = "/media/food/illustrations/";
const PHOTOS = "/media/food/ng/";

const LEGACY_SEED_CATEGORIES = [
  "Rice and Pasta",
  "Local Dishes",
  "Soups and Swallows",
  "Fish",
];

const PROTEIN_GROUP = [
  {
    name: "Add a protein",
    min: 0,
    max: 2,
    options: [
      { name: "Chicken", priceKobo: 400000, available: true },
      { name: "Ice fish", priceKobo: 300000, available: true },
      { name: "Beef", priceKobo: 200000, available: true },
      { name: "Turkey", priceKobo: 700000, available: true },
    ],
  },
];

const STARTER_DISHES = [
  { name: "Jollof Rice", category: "Rice and Pasta", description: "Freshly cooked jollof rice. Add a protein if you like.", price: 250000, image: "jollof-rice.jpg", alt: "Jollof Rice", tags: ["rice"], protein: true },
  { name: "White Rice and Sauce", category: "Rice and Pasta", description: "White rice served with sauce. Add a protein if you like.", price: 250000, image: "rice-and-stew.jpg", alt: "White Rice and Sauce", tags: ["rice"], protein: true },
  { name: "Fried Rice", category: "Rice and Pasta", description: "Freshly cooked fried rice. Add a protein if you like.", price: 250000, image: "fried-rice.jpg", alt: "Fried Rice", tags: ["rice"], protein: true },
  { name: "Native Rice", category: "Rice and Pasta", description: "Native rice served with sauce. Add a protein if you like.", price: 300000, image: "ofada-rice.jpg", alt: "Native Rice", tags: ["rice", "local"], protein: true },
  { name: "Spaghetti", category: "Rice and Pasta", description: "Spaghetti in tomato sauce. Add a protein if you like.", price: 250000, image: "spaghetti.jpg", alt: "Spaghetti", tags: ["pasta"], protein: true },
  { name: "Abacha", category: "Local Dishes", description: "Abacha (African salad). Add a protein if you like.", price: 250000, image: "abacha.jpg", alt: "Abacha", tags: ["local"], protein: true },
  { name: "Ukwa", category: "Local Dishes", description: "Ukwa (African breadfruit seed). Add a protein if you like.", price: 250000, image: "ukwa.jpg", alt: "Ukwa", tags: ["local"], protein: true },
  { name: "Plantain Porridge", category: "Local Dishes", description: "Plantain porridge. Add a protein if you like.", price: 250000, image: "plantain-porridge.jpg", alt: "Plantain Porridge", tags: ["local"], protein: true },
  { name: "Beans and Yam Porridge", category: "Local Dishes", description: "Beans and yam porridge. Add a protein if you like.", price: 250000, image: "beans-yam-porridge.jpg", alt: "Beans and Yam Porridge", tags: ["local"], protein: true },
  { name: "Golden Yam", category: "Local Dishes", description: "Fried golden yam. Add a protein if you like.", price: 250000, image: "golden-yam.jpg", alt: "Golden Yam", tags: ["local"], protein: true },
  { name: "Moi Moi", category: "Local Dishes", description: "Moi moi (bean pudding).", price: 100000, image: "moi-moi.jpg", alt: "Moi Moi", tags: ["local"], protein: false },
  { name: "Bitter Leaf Soup with Semo", category: "Soups and Swallows", description: "Bitter leaf soup served with semo and 1 beef. Add a protein if you like.", price: 450000, image: "bitter-leaf-soup.jpg", alt: "Bitter Leaf Soup", tags: ["soup", "swallow"], protein: true },
  { name: "Egusi Soup with Garri", category: "Soups and Swallows", description: "Egusi soup served with garri and 1 beef. Add a protein if you like.", price: 450000, image: "egusi-garri.jpg", alt: "Egusi Soup", tags: ["soup", "swallow"], protein: true },
  { name: "Oha Soup with Fufu", category: "Soups and Swallows", description: "Oha soup served with fufu and 1 beef. Add a protein if you like.", price: 450000, image: "oha-soup.jpg", alt: "Oha Soup", tags: ["soup", "swallow"], protein: true },
  { name: "Nsala Soup with Fufu", category: "Soups and Swallows", description: "Nsala soup served with fufu and 1 beef. Add a protein if you like.", price: 450000, image: "nsala-soup.jpg", alt: "Nsala Soup", tags: ["soup", "swallow"], protein: true },
  { name: "Catfish Pepper Soup", category: "Fish", description: "Hot, aromatic catfish pepper soup.", price: 600000, image: "catfish-pepper-soup.jpg", alt: "Catfish Pepper Soup", tags: ["fish", "soup", "spicy"], protein: false },
  { name: "Grilled Catfish", category: "Fish", description: "Whole grilled catfish.", price: 600000, image: "grilled-catfish.jpg", alt: "Grilled Catfish", tags: ["fish", "grill"], protein: false },
] as const;

const STARTER_TO_MENU: Record<string, string> = {
  "Jollof Rice": "Jollof Rice",
  "White Rice and Sauce": "White Rice and Sauce",
  "Fried Rice": "Fried Rice",
  "Native Rice": "Native Rice",
  "Spaghetti": "Spaghetti",
  "Abacha": "Abacha",
  "Ukwa": "Ukwa",
  "Plantain Porridge": "Plantain Porridge",
  "Beans and Yam Porridge": "Beans and Yam Porridge",
  "Golden Yam": "Golden Yam",
  "Moi Moi": "Moi Moi",
  "Bitter Leaf Soup with Semo": "Bitter Leaf Soup with Semo and 1 Beef",
  "Egusi Soup with Garri": "Egusi Soup with Garri and 1 Beef",
  "Oha Soup with Fufu": "Oha Soup with Fufu and 1 Beef",
  "Nsala Soup with Fufu": "Nsala Soup with Fufu and 1 Beef",
  "Catfish Pepper Soup": "Catfish Pepper Soup",
  "Grilled Catfish": "Grilled Catfish",
};

const isLegacySample = (item: MenuItem) =>
  SAMPLE_DISHES.some((name) => norm(name) === norm(item.name)) &&
  !!item.imageUrl?.startsWith(ILLUSTRATIONS);

const cleanGroups = (groups: MenuItem["addOnGroups"]) =>
  groups.map((group) => ({
    name: group.name,
    min: group.min,
    max: group.max,
    options: group.options.map((option) => ({
      name: option.name,
      priceKobo: option.priceKobo,
      available: option.available !== false,
    })),
  }));

const sameArray = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function isUntouchedStarter(
  item: MenuItem,
  categories: Map<string, Category>,
): boolean {
  const starter = STARTER_DISHES.find(
    (dish) => norm(dish.name) === norm(item.name),
  );

  if (!starter) return false;

  const category = categories.get(item.categoryId);
  if (!category || norm(category.name) !== norm(starter.category)) return false;

  const expectedGroups = starter.protein ? PROTEIN_GROUP : [];

  return (
    item.description === starter.description &&
    item.basePriceKobo === starter.price &&
    item.imageUrl === `${ILLUSTRATIONS}${starter.image}` &&
    item.imageAlt.startsWith("Illustration of ") &&
    item.active === true &&
    item.available === true &&
    item.variants.length === 0 &&
    sameArray([...item.tags].sort(), [...starter.tags].sort()) &&
    sameArray(cleanGroups(item.addOnGroups), expectedGroups)
  );
}

const must = async (
  what: string,
  result: Promise<{ status: number; body: unknown }>,
) => {
  const response = await result;

  if (response.status >= 300) {
    throw new Error(`${what} failed: ${JSON.stringify(response.body)}`);
  }

  return response.body as any;
};

export function photoFor(
  seed: MenuSeed,
  publicDir: string,
): { url: string; alt: string } | null {
  for (const ext of ["jpg", "webp", "png"]) {
    if (existsSync(join(publicDir, PHOTOS, `${seed.slug}.${ext}`))) {
      return {
        url: `${PHOTOS}${seed.slug}.${ext}`,
        alt: seed.photo.alt,
      };
    }
  }

  if (
    seed.fallback &&
    existsSync(join(publicDir, "media", `${seed.fallback.img}.jpg`))
  ) {
    return {
      url: `/media/${seed.fallback.img}.jpg`,
      alt: seed.fallback.alt,
    };
  }

  return null;
}

export async function syncMenu(
  repo: Repo,
  opts: SyncOptions = {},
): Promise<SyncReport> {
  const log = opts.log ?? console.log;
  const publicDir = opts.publicDir ?? join(process.cwd(), "public");
  const dry = !!opts.dryRun;
  const tag = dry ? "[dry run] " : "";

  const report: SyncReport = {
    created: [],
    replaced: [],
    keptAsIs: [],
    retired: [],
    retiredCategories: [],
    imagesSet: [],
  };

  if (opts.imagesOnly) {
    return attachImages(repo, publicDir, dry, log, report);
  }

  if (opts.reorderOnly) {
    report.reordered = await putMenuFirst(repo, dry, log);
    log(`${tag}${report.reordered} sort position(s) updated.`);
    return report;
  }

  if (!opts.force && (await repo.docGet("meta", MARKER))) {
    report.skipped =
      "The Everfresh menu was already imported. Nothing changed. Use --force to run it again.";
    log(report.skipped);
    return report;
  }

  const categories = await repo.listCategories();
  const categoryIds = new Map<string, string>();
  let categorySort = Math.max(0, ...categories.map((category) => category.sort));

  for (const name of CATEGORIES) {
    const existing = categories.find(
      (category) => norm(category.name) === norm(name),
    );

    if (existing) {
      categoryIds.set(name, existing.id);

      if (!existing.active && !dry) {
        await must(
          `category ${name}`,
          saveCategory(
            repo,
            { name: existing.name, sort: existing.sort, active: true },
            existing.id,
          ),
        );
      }
    } else {
      categorySort++;
      log(`${tag}category: ${name}`);

      const created = dry
        ? { id: `dry:${name}` }
        : await must(
            `category ${name}`,
            saveCategory(repo, {
              name,
              sort: categorySort,
              active: true,
            }),
          );

      categoryIds.set(name, created.id);
    }
  }

  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );

  const items = await repo.listItems();
  const used = new Set<string>();
  let sort = Math.max(-1, ...items.map((item) => item.sort ?? 0)) + 1;

  for (const seed of MENU) {
    const starterNames = Object.entries(STARTER_TO_MENU)
      .filter(([, officialName]) => norm(officialName) === norm(seed.name))
      .map(([starterName]) => starterName);

    const possibleExisting = items.filter(
      (item) =>
        !used.has(item.id) &&
        [seed.name, ...starterNames].some(
          (name) => norm(name) === norm(item.name),
        ),
    );

    const exact = possibleExisting.find(
      (item) => norm(item.name) === norm(seed.name),
    );

    if (
      exact &&
      !isUntouchedStarter(exact, categoryMap) &&
      !isLegacySample(exact)
    ) {
      used.add(exact.id);
      report.keptAsIs.push(seed.name);
      log(`${tag}kept as it is (existing dish is protected): ${seed.name}`);
      continue;
    }

    let target = possibleExisting.find((item) =>
      isUntouchedStarter(item, categoryMap),
    );

    if (!target) {
      target = items.find(
        (item) =>
          !used.has(item.id) &&
          isLegacySample(item) &&
          (seed.replaces ?? []).some(
            (oldName) => norm(oldName) === norm(item.name),
          ),
      );
    }

    if (!target && possibleExisting.length > 0) {
      const protectedItem = possibleExisting[0];
      used.add(protectedItem.id);
      report.keptAsIs.push(seed.name);
      log(`${tag}kept existing edited dish: ${protectedItem.name}`);
      continue;
    }

    const picture = photoFor(seed, publicDir);

    const body = {
      name: seed.name,
      categoryId: categoryIds.get(seed.category)!,
      description: seed.description,
      basePriceKobo: seed.priceNaira * 100,
      variants: [],
      addOnGroups: [],
      tags: seed.tags,
      imageUrl: picture?.url ?? target?.imageUrl ?? null,
      imageAlt: picture?.alt ?? target?.imageAlt ?? "",
      active: true,
      available: true,
      sort: sort++,
    };

    if (target) {
      used.add(target.id);
      report.replaced.push(`${target.name} -> ${seed.name}`);
      log(`${tag}replaced "${target.name}" with ${seed.name}`);

      if (!dry) {
        await must(seed.name, saveItem(repo, body, target.id));
      }
    } else {
      report.created.push(seed.name);
      log(`${tag}added ${seed.name}`);

      if (!dry) {
        const created = await must(seed.name, saveItem(repo, body));
        used.add(created.id);
      }
    }
  }

  if (!opts.keepSamples) {
    for (const item of items) {
      if (used.has(item.id) || !item.active) continue;

      const untouchedStarter = isUntouchedStarter(item, categoryMap);
      const oldSample = isLegacySample(item);

      if (!untouchedStarter && !oldSample) continue;

      report.retired.push(item.name);
      log(`${tag}switched off old sample dish: ${item.name}`);

      if (!dry) {
        await must(
          item.name,
          saveItem(repo, { ...item, active: false }, item.id),
        );
      }
    }

    if (!dry) {
      const after = await repo.listItems();
      const allCategories = await repo.listCategories();
      const oldCategories = [...SAMPLE_CATEGORIES, ...LEGACY_SEED_CATEGORIES];

      for (const category of allCategories) {
        const isOldCategory = oldCategories.some(
          (name) => norm(name) === norm(category.name),
        );

        if (
          category.active &&
          isOldCategory &&
          !after.some(
            (item) => item.categoryId === category.id && item.active,
          )
        ) {
          report.retiredCategories.push(category.name);

          await must(
            category.name,
            saveCategory(
              repo,
              {
                name: category.name,
                sort: category.sort,
                active: false,
              },
              category.id,
            ),
          );
        }
      }
    }
  }

  report.reordered = await putMenuFirst(repo, dry, log);

  if (!dry) {
    await repo.docPut("meta", MARKER, {
      at: new Date().toISOString(),
      created: report.created.length,
      replaced: report.replaced.length,
    });
  }

  log(
    `${tag}done: ${report.created.length} added, ${report.replaced.length} replaced, ${report.keptAsIs.length} kept, ${report.retired.length} old dishes switched off.`,
  );

  return report;
}

async function attachImages(
  repo: Repo,
  publicDir: string,
  dry: boolean,
  log: (message: string) => void,
  report: SyncReport,
): Promise<SyncReport> {
  const items = await repo.listItems();

  for (const seed of MENU) {
    const item = items.find(
      (candidate) => norm(candidate.name) === norm(seed.name),
    );

    if (!item) continue;

    const managedImage =
      !item.imageUrl ||
      item.imageUrl.startsWith(ILLUSTRATIONS) ||
      item.imageUrl.startsWith(PHOTOS);

    if (!managedImage) continue;

    const picture = photoFor(seed, publicDir);
    if (!picture || picture.url === item.imageUrl) continue;

    report.imagesSet.push(seed.name);
    log(`${dry ? "[dry run] " : ""}photo for ${seed.name}: ${picture.url}`);

    if (!dry) {
      await must(
        seed.name,
        saveItem(
          repo,
          {
            ...item,
            imageUrl: picture.url,
            imageAlt: picture.alt,
          },
          item.id,
        ),
      );
    }
  }

  log(`${report.imagesSet.length} dish photo(s) attached.`);
  return report;
}

export async function putMenuFirst(
  repo: Repo,
  dry = false,
  log: (message: string) => void = () => {},
): Promise<number> {
  let changed = 0;

  const categories = await repo.listCategories();

  const categoryRank = (category: Category) =>
    CATEGORIES.findIndex((name) => norm(name) === norm(category.name));

  const categoryOrder = [
    ...categories
      .filter((category) => categoryRank(category) >= 0)
      .sort((a, b) => categoryRank(a) - categoryRank(b)),
    ...categories.filter((category) => categoryRank(category) < 0),
  ];

  for (const [index, category] of categoryOrder.entries()) {
    const nextSort = index + 1;
    if (category.sort === nextSort) continue;

    changed++;

    if (!dry) {
      await must(
        category.name,
        saveCategory(
          repo,
          {
            name: category.name,
            sort: nextSort,
            active: category.active,
          },
          category.id,
        ),
      );
    }
  }

  const items = await repo.listItems();

  const itemRank = (item: MenuItem) =>
    MENU.findIndex((seed) => norm(seed.name) === norm(item.name));

  const itemOrder = [
    ...items
      .filter((item) => itemRank(item) >= 0)
      .sort((a, b) => itemRank(a) - itemRank(b)),
    ...items.filter((item) => itemRank(item) < 0),
  ];

  for (const [index, item] of itemOrder.entries()) {
    if (item.sort === index) continue;

    changed++;

    if (!dry) {
      await must(
        item.name,
        saveItem(repo, { ...item, sort: index }, item.id),
      );
    }
  }

  if (changed) {
    log(`${dry ? "[dry run] " : ""}menu order updated (${changed} change(s))`);
  }

  return changed;
}
