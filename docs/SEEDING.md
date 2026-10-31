# Sample data (seed)

`npm run db:seed` fills a fresh PostgreSQL database with **sample** content so every page and every admin screen has something to show and edit.

- Needs `DATABASE_URL` (reads `.env` if present). Run it after `prisma migrate deploy`, from a machine that has the repo (the production image does not include `tsx`).
- **Already seeded before?** Run `npm run db:seed` again: it adds only the Nigerian dishes (after your existing categories) and leaves everything else alone. Dishes you delete are not brought back.
- **Safe to re-run.** Each area is seeded only while it is still empty, so it never duplicates records or overwrites anything edited in `/admin`.
- Everything is stored through the same validated functions the admin dashboard uses, so all of it can be **edited, replaced or deleted in `/admin`**. Nothing is hardcoded into the pages.
- The Nigerian dishes use **drawn illustrations** (`public/media/food/illustrations/`), because no photos of them were supplied. Replace each with a real photo in Admin > Menu items as soon as you have one.
- Cakes and all other sections use the supplied Everfresh photos in `public/media/{food,training,projects,catering}/` (resized, metadata removed). Replace any of them with the admin's "Upload photo" button.

## What is seeded (all sample values: review before launch)

| Area (admin screen) | Seeded |
| --- | --- |
| Menu items and categories | 8 categories, 29 items with sizes, add-ons and sample prices: 19 Nigerian dishes (jollof, fried rice, ofada, egusi, efo riro, ogbono, pepper soup, suya, peppered chicken, small chops, moi moi, puff puff, chin chin, meat pie, akara, zobo, chapman, kunu) and 10 cakes |
| Delivery and pickup | 3 delivery areas with fees, 1 pickup point, scheduling rules, promo `WELCOME10` (**switched off**) |
| Website: about, homepage, FAQs, hours | Text, 8 about photos, 3 hero photos, 8 featured photos, 5 benefits, 7 FAQs, opening hours |
| Vocational studies | All 4 programmes (courses, curriculum, fees, requirements; applications **open**), 46 photos, 2 **unpublished** testimonial drafts |
| Event catering | 6 event categories, 6 services, 5 styles, 25 gallery photos |

## Deliberately NOT invented (set these in `/admin`)

Email address, street address, city, social links and map link (the footer keeps its "not supplied" markers), the staff notification email, videos (no video files were supplied), real testimonials (need the person's permission), and `vocConfig.paymentTerms` / `nextSteps` (these live in `src/config/vocational.ts`, not in the admin).

Before going live: confirm or change the sample prices, fees, delivery fees and hours, and switch **Accepting applications** off for any programme whose details are not final.

## Hiding "[... TO BE SUPPLIED]" markers on the live site

Every `[SOMETHING: TO BE SUPPLIED]` marker, `[ADDRESS]`, `[EMAIL]`, "PHOTO SLOT" box and "photo needed" caption is controlled by one setting: `NEXT_PUBLIC_SHOW_PLACEHOLDERS`. It shows them unless it is `false`. On Vercel set it to `false` (Project Settings > Environment Variables) and **redeploy** (it is baked in at build time). Anything still unset then simply does not appear, instead of showing a marker.

If the live site still says "Programme details are being prepared" or shows `[PROGRAMME SUMMARY: TO BE SUPPLIED]`, the programme content is not in the database that site reads. Run `npm run db:seed` against that same `DATABASE_URL`; it now prints one line per area and a final "Database now holds..." summary, and names any area that failed.
