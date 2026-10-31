# Everfresh web (foundation + homepage)

Next.js (App Router) + TypeScript. Status: Phase 1 foundation and homepage. No database, auth or payments yet.

## Run
    npm install
    npm run dev        # http://localhost:3000
    npm run typecheck && npm run build

## Structure
- `src/app` routes, `layout.tsx` (fonts, header, footer), `globals.css` (tokens + components), `loading/error/not-found`
- `src/config/site.ts` business details (null = placeholder) and navigation
- `src/content/home.ts` homepage media manifest, benefits and testimonials (empty until genuine content is supplied)
- `src/components/ui` Button, Ring (Amber Ring), MediaSlot, Placeholder, Tag, EmptyState
- `src/components/layout` SiteHeader (mobile menu with focus handling), SiteFooter
- `src/components/home` Hero (three doors), FoodIntro, StudiesIntro, CateringIntro, FeaturedWork, VideoShowcase, Benefits, Testimonials, FinalCta
- `public/brand` temporary emblem crop from the supplied reference logo; `public/media` library folders (food, training, projects, catering, video)

## Placeholders
Missing facts show as `[LIKE THIS]`. Set `NEXT_PUBLIC_SHOW_PLACEHOLDERS=false` at launch to hide placeholders and unverified blocks.

## Not yet verified
This code was rendered and exercised in a test harness (React + a real browser) but has not been compiled with Next.js or type-checked, because package installation was unavailable. Run the commands above and report any errors.

## Food ordering (Phase 3)
Customer: `/order-food` (search, categories, tags, availability, sizes, add-ons), cart drawer, `/checkout`, `/order/<number>/<token>`.
Admin: `/admin` (interim shared-password sign-in): orders and status, menu items, categories, enable/disable, sold-out.
Server (`src/server`): pricing (the only source of prices), validation, order service (idempotent), Bachs gateway, webhook handler, status machine, repo (memory + Prisma).

### Run with a database
    cp .env.example .env     # fill in values
    npm install && npx prisma migrate dev && npm run dev
Without `DATABASE_URL` (development only) a temporary in-memory store is used.

### Required configuration before real orders
- Admin > Delivery and pickup: delivery areas and fees, pickup locations, scheduling rules, promo codes (stored in the database; `src/config/ordering.ts` only holds empty defaults). Delivery/pickup stay unavailable until set.
- Bachs: `BACHS_API_KEY` (sandbox `sk_sandbox_...`), `BACHS_WEBHOOK_SECRET`, webhook endpoint `https://<site>/api/webhooks/bachs` subscribed to collection.succeeded, collection.failed, collection.underpaid, checkout.expired, refund.paid. Confirm NGN card and bank transfer are enabled on the account. Live = swap to `sk_live_` and `BACHS_BASE_URL=https://api.bachs.io` only after a real-money test.
- `ADMIN_PASSWORD` (12+ chars), `ADMIN_SESSION_SECRET` (32+ chars), `SITE_URL`.
- Menu content and genuine photos (add via admin; photos are referenced by `/media/...` path or https URL; there is no upload tool yet).

### Tests
`npm test` runs 67 unit/integration tests (ordering and vocational: pricing, validation, idempotency, webhook signatures, payment states, invoices, PDFs, admin logic). PDF tests need Chromium (`npx playwright install chromium`) and python3 with pypdf.

### Not built yet
Order emails/SMS, image upload, promo and delivery-zone admin screens, refunds initiated from the admin (refund in the Bachs dashboard; webhook updates status), Auth.js role-based admin accounts, receipts PDF.

## Vocational Studies (Phase 4)
Public: `/vocational-studies`, `/vocational-studies/regular` (3 years), `/vocational-studies/intensive` (1, 3, 6 months compared), `/apply`, `/apply/<ref>/<token>` (corrections), `/application/<ref>/<token>` (review, payment, confirmation, invoices, PDF downloads).
Staff: `/admin` > Vocational studies: applications, status decisions, invoices, manual payments, programme content and fees, portfolio photos, videos, testimonials.
Server: `src/server/voc` (applications, payments/webhooks, invoices, admin, PDF templates, API dispatchers), `src/config/vocational.ts`.

### How it behaves
- Four programme options (`regular-3y`, `intensive-1m|3m|6m`) each have their own content, fees and application route. Selection persists through the whole workflow (URL, session, then the saved application).
- Nothing is invented: content, fees, requirements, accommodation, benefits and testimonials show only what staff enter and publish; empty items show flagged placeholders (hidden when `NEXT_PUBLIC_SHOW_PLACEHOLDERS=false`).
- Applications only open when staff tick "Accepting applications" for that option.
- Application-form fee is fixed server-side at ₦5,000 (`vocConfig.applicationFee`), non-refundable, separate from tuition. Only a verified Bachs webhook marks it paid; payment never implies admission. Staff set admission decisions, and only after a verified payment.
- Invoices (staff-built): tuition, accommodation, other charges, discounts; totals and balances are always derived from lines and payments. Applicants can pay the full outstanding balance online; staff can record manual (bank/teller) payments. Each payment gets its own receipt. Invoices are never proof of payment.
- PDFs (receipt, confirmation, invoice) are rendered with headless Chromium: run `npx playwright install chromium` on the server. For a host without Chromium, swap `chromiumPdf` in `src/server/voc/pdf.ts`.

### To configure
`vocConfig.paymentTerms`, `vocConfig.nextSteps`, form requirement flags (`dobRequired`, `educationRequired`, `emergencyContactRequired`), and all programme content/fees/requirements via the admin screens.

### Not built yet
Order/application emails and SMS, file uploads for application documents, image/video upload (paths or URLs are entered), refunds started from admin, instalments (not wanted), Auth.js role-based staff accounts, applicant account sign-in (access is by private link).

## Event Catering (Phase 5)
Public: `/event-catering` (landing with gallery, categories, services, how it works and the quotation form), `/event-catering/quote` (form alone), `/event-catering/enquiry/<ref>/<token>` (confirmation, always available).
Staff: `/admin` > Event catering: search, status, event details, internal notes, quotation progress, customer contact history, WhatsApp status; plus categories, services, styles and gallery photos.
Server: `src/server/catering` (validation, WhatsApp builder, service, API).

### Flow
Validate (server) > unique reference `CE-YYMMDD-XXXX` > save to the database > build the message in the approved structure (only supplied fields) > `https://wa.me/<configured number>?text=<encodeURIComponent(message)>` > confirmation page opens WhatsApp (also a button) and explains the customer must press Send.
The site never claims delivery: WhatsApp cannot tell us whether Send was pressed. We record "prepared", "link opened" and, only when staff confirm it, "message arrived on WhatsApp". Long text is shortened in the WhatsApp message only (the saved enquiry is complete). If no WhatsApp number is configured, the enquiry is still saved and the page says WhatsApp isn't set up.

### To configure
- `WHATSAPP_NUMBER_DIGITS` (country code, digits only, e.g. 234XXXXXXXXXX). Nothing is hard-coded; local format (0803...) is converted.
- Event categories (only those you serve), services and descriptions, catering styles, and genuine gallery photos (admin screen). With no categories, event type is free text.

### Not built yet
Email/SMS alerts to staff, staff assignment, file attachments on enquiries, quotation PDFs, photo upload (paths/URLs are entered), Auth.js role-based staff accounts.

## Website pages and secure admin (Phase 6)
Public: `/about`, `/contact` (details, WhatsApp link, contact form, FAQs), homepage content, header/footer, all driven by editable settings.
Admin: `/admin` with staff accounts, roles and server-side permissions.

### Accounts and roles (no shared password any more)
- First sign-in: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ chars) and `ADMIN_SESSION_SECRET` (32+ chars). The first sign-in with those creates the **Owner** account and forces a password change. Remove the two variables afterwards.
- Roles: owner (everything, accounts, audit), manager (all business areas, settings, messages), food_staff, admissions_staff, catering_staff, editor (website content only).
- Enforcement is on the server, by URL path, in one place (`authorize()` in `src/server/auth`): unknown endpoints are owner-only (default deny). The tabs hidden in the UI are a convenience only. Every request re-checks the user, so changing a role, disabling an account, resetting a password or "sign out everywhere" ends open sessions immediately.
- Passwords: scrypt, 12+ chars, lockout after 5 failures (15 min) plus per-IP limiting, generic error messages, HttpOnly + SameSite=Lax cookie, same-origin check on every state-changing request.
- Audit log (owner): sign-ins, failed and refused attempts, every change, and views of individual applicant/order/enquiry/receipt records. Passwords and request bodies are never logged.
- Not built: two-factor sign-in, password-reset by email, SSO. Auth.js was planned but could not be installed; this is a self-contained replacement with the same role model.

### Content without editing code
Admin > Website: business and contact details (phone, email, WhatsApp, address, hours, social, map-link switch), About page, Homepage (confirmed benefits, hero photos, featured work), FAQs, logo and brand images. Photos can be uploaded (JPEG/PNG/WebP, 5 MB; the real file type is checked, SVG refused) to `MEDIA_DIR` (default `./.uploads`) and are served from `/uploads/...`. On serverless hosting use a persistent disk or move uploads to object storage.
Phone and WhatsApp default to the number supplied by the business (`src/config/site.ts`), editable in the admin.

### Not built yet
Email/SMS notifications, video upload (paths or URLs), two-factor sign-in, a logo in vector form.

## Review status (end-to-end review)
Run: `npm test` (72 tests). Verified in the review environment: all 94 app source files compile; strict TypeScript on server/lib/config passes; 294 browser checks passed against the real route handlers with a SIMULATED Bachs (no real payment was made).
Not verified: Next.js build/runtime, PostgreSQL/Prisma, real Bachs sandbox or live, real fonts, real devices, screen readers, email, hosting. See the final report for the full list. This is a staging candidate, not a production release.
Before staging: `npm install`, `npx prisma migrate dev`, `npx playwright install chromium`, fill `.env` (see `.env.example`), then run a Bachs SANDBOX payment end to end.

## Hardening pass (post-review)
- **Concurrency:** every read-modify-write on an order, application, invoice, enquiry or user is serialised by `repo.withLock(key)` (Postgres advisory transaction lock; in-memory mutex for tests). Payment webhooks for one record are processed one at a time. Receipts are created once per payment even when processing is retried. Payment references are parsed by structure, not by stripping suffixes.
- **Email:** persistent outbox (`outbox` documents) with Resend and Postmark adapters (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`). Without a provider mail is saved and shown as "not configured", never as sent. Retry from Admin > Team and security > Email, or call `/api/cron/outbox` with `Authorization: Bearer $CRON_SECRET`. Sent: private links (orders, applications, enquiries), payment confirmations, staff notifications (`Business > Staff notification email`), password resets.
- **Record recovery:** `/recover` emails the private links to the email address on the record; the answer never reveals whether records exist; limited to 3 per mailbox per hour.
- **Staff password reset:** `/admin` > Forgot your password; 30-minute single-use token stored only as a hash; ends other sessions.
- Verified here: unit and browser tests with SIMULATED providers only. Email provider adapters are tested for request shape against stubs, not against the real services.

## Two-factor sign-in, operations and verification tooling
- Authenticator-app (TOTP) sign-in; required for owner and manager by default (`REQUIRE_2FA_ROLES`), 8 one-time recovery codes, secrets encrypted at rest with a key derived from `ADMIN_SESSION_SECRET`.
- Deployment: `Dockerfile`, `docker-compose.yml`, `docs/OPERATIONS.md`, `scripts/backup.sh`, hand-written migration in `prisma/migrations` (never executed yet).
- `e2e/`: browser verification harness (real route handlers and components, in-memory database). `tests/`: 93 automated tests (`npm test`).

## Food menu import and dish photos
The supplied Everfresh menu (21 dishes, Main Meals / Soups and Special Dishes / Protein and Extras) lives in `prisma/menu-data.ts` and is written to the database by the same save functions the admin uses, so every dish stays editable in Admin > Menu items.
    npm run db:seed-menu -- --dry-run     # preview: what is added, replaced or switched off (writes nothing)
    npm run db:seed-menu                  # import. Safe to re-run; nothing is deleted
Rules: a dish you already edited is never touched; untouched SAMPLE versions (e.g. "Party Jollof Rice") are replaced in place by the real dish (no duplicates); other untouched sample dishes not on the supplied menu are switched off (re-enable in admin, or use `--keep-samples`). Runs once unless `--force`.

Photos: no keys, no runtime API. Real photos are curated from Wikimedia Commons, downloaded once and self-hosted in `public/media/food/ng/` (cached for 7 days by `next.config.mjs`).
    npm run food-images -- discover [slug]   # licence-checked candidates + a contact sheet to review in a browser (needs network)
    # approve: paste the chosen "File:..." title into photo.commons in prisma/menu-data.ts (only if it shows THAT dish)
    npm run food-images -- fetch [slug]      # downloads approved photos, writes CREDITS.md (show these credits on the site: CC BY / BY-SA require it)
    npm run db:seed-menu -- --images-only    # points the dishes at the downloaded photos (never replaces a photo set in admin)
A dish with no photo shows a drawing only where a drawing of the SAME dish exists, otherwise a neutral plate tile. A photo that fails to load falls back to the same tile.

## Photo uploads on serverless hosting (Vercel)
The disk on Vercel is read-only, so uploads cannot be written to `MEDIA_DIR`. `saveUpload` (src/server/media.ts) writes to the disk when it can and otherwise stores the image in the database (`upload` collection), served from the same `/uploads/<name>` URL. The admin upload button also shrinks large phone photos (max 1600 px, JPEG) before sending, because Vercel rejects request bodies over about 4.5 MB. With a persistent disk (Docker/VPS) nothing changes.
