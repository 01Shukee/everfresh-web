// Homepage content. Empty/null values render designed placeholders (or nothing). Never add invented content here.
export type Media = { src: string; alt: string; width: number; height: number };
export type DoorKey = "food" | "studies" | "catering";

export const doors: { key: DoorKey; title: string; desc: string; href: string }[] = [
  { key: "food", title: "Order food", desc: "Browse the menu. Delivery or pickup, now or scheduled.", href: "/order-food" },
  { key: "studies", title: "Learn a skill", desc: "Regular 3-year and Intensive 1, 3 or 6 month programmes.", href: "/vocational-studies" },
  { key: "catering", title: "Plan an event", desc: "Share the date, place and guests. Get a quotation.", href: "/event-catering" },
];

export const media = {
  hero: { food: null, studies: null, catering: null } as Record<DoorKey, Media | null>,
  menuHighlights: [] as (Media & { name: string })[], // later: live from the menu database
  featured: [] as (Media & { kind: "Dish" | "Student project" | "Event"; caption: string })[],
  videos: [
    { id: "kitchen", name: "Kitchen", src: null as string | null, poster: null as string | null, captions: null as string | null },
    { id: "workshop", name: "Workshop", src: null, poster: null, captions: null },
    { id: "events", name: "Events", src: null, poster: null, captions: null },
  ],
};

// Only claims the business has confirmed. Add { text, verified: true } entries when supplied.
export const benefits: { text: string; verified: boolean }[] = [];

// Only genuine testimonials with recorded permission.
export const testimonials: { quote: string; name: string; relation: string; permission: true }[] = [];
