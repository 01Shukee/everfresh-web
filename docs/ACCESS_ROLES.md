# Everfresh: who can access what

Status key: **Built** = implemented and tested here with simulated payments. **Planned** = not built yet. Nothing here has been verified on a real server.
No passwords or keys are stored in this document. Accounts are created by the Owner inside the admin (Team and security).

## Public visitors (no account)
- Pages: Home, Order Food, Vocational Studies (landing, Regular, Intensive), Event Catering, About, Contact. **Built**
- Can: browse the menu, build a cart, request a quote, send a contact message, start an application. Rate-limited. **Built**

## Customers, applicants and catering customers (no account; private link) **Built**
- Food customer: `/order/<number>/<private-token>`. Sees only that order.
- Applicant: `/application/<ref>/<private-token>` (review, pay fee, receipts, invoices, PDFs) and `/apply/<ref>/<private-token>` (corrections before payment).
- Catering customer: `/event-catering/enquiry/<ref>/<private-token>`.
- The link is the credential. **Built (needs an email provider to actually deliver):** links are emailed and `/recover` re-sends them to the email on the record.

## Staff (sign in at `/admin` with their own email and password) **Built**
| Role | Can use | Cannot |
|---|---|---|
| Owner | Everything, including staff accounts and the activity log | n/a (must always be at least one active owner) |
| Manager | Food, vocational studies, catering, website content, business settings, messages | Staff accounts, activity log |
| Food staff | Orders, menu items, categories | Everything else |
| Admissions staff | Applications, programmes and fees, invoices, receipts, portfolio, videos, testimonials | Everything else |
| Catering staff | Enquiries, catering content and gallery | Everything else |
| Editor | About, homepage, FAQs, logo and brand images | Orders, payments, applicant data, settings |

- Permissions are enforced on the server by URL path; unknown admin endpoints are owner-only. Role changes, disabling and password resets end open sessions immediately. **Built and tested**
- First owner: created on first sign-in from `ADMIN_EMAIL` + `ADMIN_PASSWORD` set as environment variables, then forced to change the password. **Built**
- Password reset by email: **Built (needs email provider)**. Two-factor sign-in (authenticator app): **required for Owner and Manager, optional for others. Built and tested.**

## Where things are set (never in chat)
Secrets (`DATABASE_URL`, `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`, `ADMIN_SESSION_SECRET`, owner email/password) live in environment variables on the host. See `.env.example`.
