# Operations guide (written, NOT yet exercised on a real host)

## Environment variables (set in the host's secret manager, never in chat or Git)
DATABASE_URL, SITE_URL (https), ADMIN_SESSION_SECRET (32+ random chars), ADMIN_EMAIL + ADMIN_PASSWORD (first owner only; remove after first sign-in),
BACHS_API_KEY, BACHS_WEBHOOK_SECRET, BACHS_BASE_URL (sandbox until launch), EMAIL_PROVIDER=resend, EMAIL_API_KEY, EMAIL_FROM, CRON_SECRET (24+ chars),
MEDIA_DIR (/data/uploads on a persistent volume), TRUSTED_PROXY_HOPS (1 behind one platform proxy), NEXT_PUBLIC_SHOW_PLACEHOLDERS=false at launch.

## First deploy
1. Create managed PostgreSQL; set DATABASE_URL. 2. Deploy the container (migrations run at start: `prisma migrate deploy`).
3. Sign in at /admin with the bootstrap owner, change the password, then remove ADMIN_EMAIL/ADMIN_PASSWORD. 4. Register the Bachs webhook URL `https://<site>/api/webhooks/bachs`.
5. Schedule: POST /api/cron/outbox every 5 minutes and POST /api/cron/retention daily, both with `Authorization: Bearer $CRON_SECRET`. 6. Run `scripts/backup.sh` nightly.

## Backups and restore
Backup: `scripts/backup.sh`. Restore: `pg_restore --clean --no-owner -d "$DATABASE_URL" everfresh-<time>.dump`. Test a restore into a scratch database before launch and quarterly. Uploaded photos live in MEDIA_DIR: back up that volume too.

## Privacy and retention (automatic, /api/cron/retention)
Unpaid abandoned orders 30 days; unpaid application drafts 90 days; delivered emails 30 days; handled contact messages 365 days; audit log 400 days.
Never auto-deleted: paid orders, paid applications, invoices, receipts, catering enquiries (financial/business records). Decide the legal retention period for these with your adviser (Nigeria Data Protection Act 2023 applies to applicant and customer data) and publish a privacy notice.

## Proxy and rate limits
Rate limits use the client address added by your platform's proxy (TRUSTED_PROXY_HOPS). They are per server instance; use a shared store (e.g. Redis) before running several instances.

## Health
GET /api/health returns 200 when the database answers.
