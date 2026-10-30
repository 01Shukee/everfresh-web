import type { MetadataRoute } from "next";
// Only public, indexable pages. Private pages (orders, applications, enquiries, checkout, admin) are excluded and disallowed in robots.
const PATHS: [string, number][] = [["/", 1], ["/order-food", 0.9], ["/vocational-studies", 0.9], ["/vocational-studies/regular", 0.8], ["/vocational-studies/intensive", 0.8], ["/event-catering", 0.9], ["/event-catering/quote", 0.7], ["/about", 0.6], ["/contact", 0.6]];
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return PATHS.map(([p, priority]) => ({ url: base + p, changeFrequency: "weekly", priority }));
}
