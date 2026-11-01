// The Everfresh food menu supplied by the business (names and prices exactly as given), plus the photo plan for each dish.
// This is DATA for the importer in prisma/menu-sync.ts. Nothing here is read by the website: customers see what is in the database,
// and everything below can be edited afterwards in /admin > Menu items.

export interface MenuPhoto {
  /** Approved Wikimedia Commons file, e.g. "File:Jollof Rice with Stew.jpg". Leave null until a person has looked at the picture and
   *  confirmed it shows THIS dish (scripts/food-images.ts discover prints candidates; fetch refuses anything unapproved). */
  commons: string | null;
  /** Alt text used on the site for the real photo. Describes only what the dish is. */
  alt: string;
  /** Search words used by `food-images discover`. */
  query: string;
  /** Loose pre-filter for discovery: a candidate's title/description must match. A person still approves every photo. */
  match: string;
}
export interface MenuSeed {
  slug: string; name: string; category: string; priceNaira: number; description: string; tags: string[];
  /** Existing SAMPLE dishes (from prisma/seed-data.ts) that this real dish replaces, so the menu never shows the same dish twice. */
  replaces?: string[];
  /** Shown until a real photo is downloaded, only where a drawn illustration of the SAME dish already exists in public/media/food/illustrations. */
  fallback?: { img: string; alt: string };
  photo: MenuPhoto;
}

export const CATEGORIES = ["Main Meals", "Soups and Special Dishes", "Protein and Extras"] as const;

const ph = (query: string, match: string, alt: string): MenuPhoto => ({ commons: null, query, match, alt });

export const MENU: MenuSeed[] = [
  // ---- MAIN MEALS
  { slug: "jollof-rice", name: "Jollof Rice", category: "Main Meals", priceNaira: 2500, description: "Nigerian jollof rice.", tags: ["rice"], replaces: ["Party Jollof Rice"],
    fallback: { img: "food/illustrations/jollof-rice", alt: "Illustration of jollof rice" }, photo: ph("Nigerian jollof rice", "jollof", "A plate of Nigerian jollof rice") },
  { slug: "white-rice-and-sauce", name: "White Rice and Sauce", category: "Main Meals", priceNaira: 2500, description: "Steamed white rice served with sauce.", tags: ["rice"], replaces: ["White Rice and Stew"],
    fallback: { img: "food/illustrations/rice-and-stew", alt: "Illustration of white rice with red sauce" }, photo: ph("white rice and stew Nigeria", "white rice|rice and (stew|sauce)", "A plate of white rice with red sauce") },
  { slug: "fried-rice", name: "Fried Rice", category: "Main Meals", priceNaira: 2500, description: "Nigerian fried rice.", tags: ["rice"], replaces: ["Nigerian Fried Rice"],
    fallback: { img: "food/illustrations/fried-rice", alt: "Illustration of fried rice with vegetables" }, photo: ph("Nigerian fried rice", "fried rice", "A plate of Nigerian fried rice") },
  { slug: "spaghetti", name: "Spaghetti", category: "Main Meals", priceNaira: 2500, description: "", tags: ["pasta"], photo: ph("spaghetti Nigerian jollof", "spaghetti", "A plate of spaghetti") },
  { slug: "abacha", name: "Abacha", category: "Main Meals", priceNaira: 2500, description: "Abacha, the African salad.", tags: ["local"], photo: ph("abacha African salad", "abacha|african salad", "A plate of abacha (African salad)") },
  { slug: "native-rice", name: "Native Rice", category: "Main Meals", priceNaira: 3000, description: "", tags: ["rice", "local"], photo: ph("native rice Nigeria palm oil", "native rice|palm oil rice", "A plate of native rice") },
  { slug: "ukwa", name: "Ukwa", category: "Main Meals", priceNaira: 2500, description: "African breadfruit seed (ukwa).", tags: ["local"], photo: ph("ukwa African breadfruit seed", "ukwa|breadfruit", "A plate of ukwa (African breadfruit seed)") },
  { slug: "plantain-porridge", name: "Plantain Porridge", category: "Main Meals", priceNaira: 2500, description: "", tags: ["porridge"], photo: ph("plantain porridge Nigeria", "plantain", "A bowl of plantain porridge") },
  { slug: "golden-yam", name: "Golden Yam", category: "Main Meals", priceNaira: 2500, description: "", tags: ["yam"], photo: ph("golden yam Nigeria fried yam", "yam", "A plate of golden yam") },
  { slug: "moi-moi", name: "Moi Moi", category: "Main Meals", priceNaira: 1000, description: "Moi moi, steamed bean pudding.", tags: ["beans"], replaces: ["Moi Moi"],
    fallback: { img: "food/illustrations/moi-moi", alt: "Illustration of moi moi (bean pudding) wrapped in leaf" }, photo: ph("moi moi bean pudding", "moi ?moi|moin ?moin|bean pudding", "Moi moi, steamed bean pudding") },
  { slug: "beans-and-yam-porridge", name: "Beans and Yam Porridge", category: "Main Meals", priceNaira: 2500, description: "", tags: ["beans", "yam", "porridge"], photo: ph("beans and yam porridge Nigeria", "yam|beans", "A bowl of beans and yam porridge") },

  // ---- SOUPS AND SPECIAL DISHES
  { slug: "catfish-pepper-soup", name: "Catfish Pepper Soup", category: "Soups and Special Dishes", priceNaira: 6000, description: "", tags: ["soup", "fish"], photo: ph("catfish pepper soup Nigeria", "catfish|pepper soup", "A bowl of catfish pepper soup") },
  { slug: "grilled-catfish", name: "Grilled Catfish", category: "Soups and Special Dishes", priceNaira: 6000, description: "", tags: ["fish"], photo: ph("grilled catfish Nigeria", "catfish", "Grilled catfish") },
  { slug: "bitter-leaf-soup", name: "Bitter Leaf Soup with Semo and 1 Beef", category: "Soups and Special Dishes", priceNaira: 4500, description: "Bitter leaf soup served with semo and 1 piece of beef.", tags: ["soup", "swallow"], photo: ph("bitterleaf soup onugbu Nigeria", "bitter ?leaf|onugbu", "A plate of bitter leaf soup with semo") },
  { slug: "egusi-soup", name: "Egusi Soup with Garri and 1 Beef", category: "Soups and Special Dishes", priceNaira: 4500, description: "Egusi soup served with garri and 1 piece of beef.", tags: ["soup", "swallow"], replaces: ["Egusi Soup"],
    fallback: { img: "food/illustrations/egusi-soup", alt: "Illustration of egusi soup in a bowl" }, photo: ph("egusi soup Nigeria", "egusi", "A plate of egusi soup with a swallow") },
  { slug: "oha-soup", name: "Oha Soup with Fufu and 1 Beef", category: "Soups and Special Dishes", priceNaira: 4500, description: "Oha soup served with fufu and 1 piece of beef.", tags: ["soup", "swallow"], photo: ph("oha soup Nigeria", "oha|ora soup", "A plate of oha soup with fufu") },
  { slug: "nsala-soup", name: "Nsala Soup with Fufu and 1 Beef", category: "Soups and Special Dishes", priceNaira: 4500, description: "Nsala (white) soup served with fufu and 1 piece of beef.", tags: ["soup", "swallow"], photo: ph("nsala white soup Nigeria", "nsala|white soup", "A plate of nsala soup with fufu") },

  // ---- PROTEIN AND EXTRAS
  { slug: "chicken", name: "Chicken", category: "Protein and Extras", priceNaira: 4000, description: "", tags: ["protein"], photo: ph("Nigerian fried chicken", "chicken", "Chicken") },
  { slug: "ice-fish", name: "Ice Fish", category: "Protein and Extras", priceNaira: 3000, description: "", tags: ["protein", "fish"], photo: ph("fried fish Nigeria", "fish", "Fish") },
  { slug: "beef", name: "Beef", category: "Protein and Extras", priceNaira: 2000, description: "", tags: ["protein"], photo: ph("beef stew meat Nigeria", "beef", "Beef") },
  { slug: "turkey", name: "Turkey", category: "Protein and Extras", priceNaira: 7000, description: "", tags: ["protein"], photo: ph("Nigerian fried turkey", "turkey", "Turkey") },
];

/** Dishes (and categories) created by the original sample seed (prisma/seed-data.ts). Only ones still in their seeded state are touched. */
export const SAMPLE_DISHES = ["Party Jollof Rice", "Nigerian Fried Rice", "Ofada Rice and Ayamase Sauce", "White Rice and Stew", "Egusi Soup", "Efo Riro", "Ogbono Soup", "Goat Meat Pepper Soup", "Beef Suya", "Peppered Chicken", "Small Chops Platter", "Moi Moi", "Puff Puff", "Chin Chin", "Meat Pie", "Akara", "Zobo Drink", "Chapman", "Kunu"];
export const SAMPLE_CATEGORIES = ["Rice and Mains", "Soups and Swallows", "Grills and Small Chops", "Snacks and Pastries", "Drinks"];
