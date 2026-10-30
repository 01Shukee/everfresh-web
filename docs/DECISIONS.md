# Decision record (answers from the owner)

## Confirmed
- Payment gateway: Bachs (bachs.io). Sandbox first; no live charges without explicit authorisation.
- Food: guest checkout allowed (details required); scheduled orders allowed (rules still to be supplied).
- Vocational: Regular 3 years; Intensive 1, 3 or 6 months. Application-form fee **₦5,000**, non-refundable, separate from tuition. No instalments. Tuition may be paid online. Applicants track via a private link/login.
- Language: English at launch; Igbo later (Claude drafts; a fluent speaker reviews).
- Stack approved: Next.js, TypeScript, PostgreSQL, managed hosting. Everfresh owns the domain; the company pays for hosting, email and gateway accounts. No launch date.
- Phone and WhatsApp for now: +2348135571152.
- Design direction approved (three rooms, Amber Ring). Photos and videos exist but have not been supplied.
- Working rules: one question at a time; no secrets in chat; no deploy, DNS change or live payment without explicit authorisation.

## Open (see questions asked one at a time)
Network access for real verification; hosting/database provider; email provider; delivery zones and fees; pickup locations; scheduling rules; programme content, fees and requirements; menu content; staff manual tuition payments; business email, address, hours; owner account email.

## Answers recorded
- Verification route: **A**. Owner will enable internet access for this workspace (npm registry, Prisma downloads, sandbox-api.bachs.io, hosted PostgreSQL). Secrets go in environment settings, never in chat.

## Work completed without network (offline, tested with stubs only)
Concurrency locks, idempotent receipts, reference parsing fix, email outbox + Resend/Postmark adapters, record recovery, staff password reset. Pending real-service verification once internet access is enabled.
- Email service: **Resend** (accepted my recommendation). Needs a verified sending domain, `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM` set as environment variables (never in chat).

## Configurability now in the admin (database-backed)
Delivery areas and fees, minimum orders, pickup locations, scheduled-order rules (notice, days ahead, hours), promo codes: Admin > Delivery and pickup. Business details, About, homepage, FAQs, brand, WhatsApp, staff notification email: Admin > Website. Programmes, fees, requirements, invoices, receipts: Admin > Vocational studies. Catering categories, services, gallery, enquiries: Admin > Event catering. Menu, categories, prices, add-ons, availability: Admin > Orders/Menu items/Categories.
- Hosting: **container host (Railway/Render/Fly.io or a VPS) with managed PostgreSQL** (accepted my recommendation). Keeps Chromium PDFs and a persistent disk for uploads. Exact provider still to be chosen when accounts are created.

## Deployment artefacts written (not yet run: no Docker, no internet)
Dockerfile (standalone Next build, Chromium for PDFs, migrations at start), docker-compose.yml (local rehearsal), hand-written Prisma init migration, /api/health, retention job, trusted-proxy client IP, backup script, docs/OPERATIONS.md.

## Decisions taken by Claude on the owner's instruction ("just answer all the next questions")
- Two-factor sign-in (authenticator app): **required for Owner and Manager** (blocks every admin area until set up), optional for other staff. Recovery codes, owner can reset a lost device. Override with REQUIRE_2FA_ROLES.
- Staff may record manual (bank/teller) tuition payments: **kept**, audited, and only on an issued invoice.
- Application fee: stays ₦5,000, non-refundable, **not** credited to tuition.
- Phone and WhatsApp: same number (+2348135571152) until changed in Admin > Website.
- Igbo: after launch; Claude drafts, a fluent speaker reviews.
- Scheduling defaults (60 min notice, 7 days) are placeholders; Everfresh edits them in Admin > Delivery and pickup. Delivery areas, pickup points, menu, prices, programme content and fees are NOT invented: they stay empty until Everfresh enters them.
- Emails: Resend. Hosting: container host + managed PostgreSQL.
