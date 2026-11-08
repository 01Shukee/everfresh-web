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
| Menu items and categories | Everfresh's real menu with the supplied prices (17 dishes: rice and pasta, local dishes, soups and swallows, fish) with a protein add-on (Chicken ₦4,000, Ice fish ₦3,000, Beef ₦2,000, Turkey ₦7,000), plus 10 sample cakes. Flyer items without a price are not seeded: add them in Admin > Menu items |
| Delivery and pickup | 3 delivery areas with fees, 1 pickup point, scheduling rules, promo `WELCOME10` (**switched off**) |
| Website: about, homepage, FAQs, hours | Text, 8 about photos, 3 hero photos, 8 featured photos, 5 benefits, 7 FAQs, opening hours |
| Vocational studies | The Vocational Institute (Nnewi): Regular (3 years, day or hostel, with the exact first-year and yearly fees) and Intensive in five options (1 month priced per course, 3 months, 6 months, 1 year with 2 chosen courses, special courses), requirements to bring, institute details, 46 photos, 2 **unpublished** testimonial drafts. Applications are **open** |
| VIP menu | A starter VIP menu (8 sample items, static / read-only mode) at `/vip`, with its own categories, settings and orders |
| Event catering | 6 event categories, 6 services, 5 styles, 25 gallery photos |

## Deliberately NOT invented (set these in `/admin`)

Email address, street address, city, social links and map link (the footer keeps its "not supplied" markers), the staff notification email, videos (no video files were supplied), real testimonials (need the person's permission), and `vocConfig.paymentTerms` / `nextSteps` (these live in `src/config/vocational.ts`, not in the admin).

Before going live: confirm or change the sample prices, fees, delivery fees and hours, and switch **Accepting applications** off for any programme whose details are not final.

## Hiding "[... TO BE SUPPLIED]" markers on the live site

Every `[SOMETHING: TO BE SUPPLIED]` marker, `[ADDRESS]`, `[EMAIL]`, "PHOTO SLOT" box and "photo needed" caption is controlled by one setting: `NEXT_PUBLIC_SHOW_PLACEHOLDERS`. It shows them unless it is `false`. On Vercel set it to `false` (Project Settings > Environment Variables) and **redeploy** (it is baked in at build time). Anything still unset then simply does not appear, instead of showing a marker.

If the live site still says "Programme details are being prepared" or shows `[PROGRAMME SUMMARY: TO BE SUPPLIED]`, the programme content is not in the database that site reads. Run `npm run db:seed` against that same `DATABASE_URL`; it now prints one line per area and a final "Database now holds..." summary, and names any area that failed.

## Photo uploads in the admin

- **On Vercel (or any host with no persistent disk)** leave `MEDIA_DIR` unset: uploaded photos are stored in the database and served from `/uploads/...`.
- **On Docker with a volume** set `MEDIA_DIR` (the Dockerfile already does): photos are stored on disk as before.
- Large phone photos are shrunk to a 1800 px JPEG in the browser before they are sent, because Vercel refuses request bodies over about 4.5 MB.

## Vocational Institute, VIP menu and registration emails

- **No database migration is needed.** Everything new (VIP data, institute details, programme choices) is stored in the existing document store.
- **Existing databases:** run `npm run db:seed` again. It replaces my earlier *sample* programme content with the real institute details (a programme you have edited yourself is kept), adds the institute address and the VIP starter menu, and does nothing else.
- **Fees:** the first-year invoice is raised automatically when the 5,000 application-form fee is verified. It lists the fee lines for the student's choice (day or hostel, chosen courses) and credits the 5,000 already paid. Fee lines, course prices and "choose N" are edited in Admin > Vocational studies > Programmes (markers: `[hostel]`, `[day]`, `[yearly]`, `[graduation]`, `[choice]`, `[price=150000]`).
- **Emails:** sent through the existing email setup (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `SITE_URL`). They now carry branded HTML with a plain-text fallback. Delivery is attempted while the request is still running (up to 4 seconds), so it works on Vercel; anything that fails stays in the outbox and is retried by `/api/cron/outbox`. The institute phone numbers in the emails are set in Admin > Vocational studies > Institute details.
- **VIP menu:** manage it in Admin > VIP menu. QR codes are generated in the admin (no package needed): print one per table. The page is `/vip` (with `?t=5` for table 5), kept out of search results and the site menu.
