# LeadBooker

AI appointment scheduling for home service businesses, run by an agency for many merchants.

Leads arrive from Zapier (or text the merchant's number, or use the website chat). An OpenAI-powered
assistant answers questions from the merchant's FAQs, asks their qualifying questions, checks the
merchant's Cal.com availability and books an in-home or phone consultation.

**Stack:** Next.js (App Router) on Vercel · Supabase (Postgres + Auth) · OpenAI · Twilio · Cal.com

## Setup

1. **Supabase** — run `supabase/migrations/0001_init.sql` in the SQL editor. Under Authentication, add a
   user (email + password) for each staff member and turn off public sign-ups.
2. **Vercel** — import this repo and set the variables in `.env.example`. `ADMIN_EMAILS` is the allowlist
   for `/admin`; with it empty nobody can sign in.
3. **Twilio** — use the subaccount's SID and auth token. US local numbers must be covered by an A2P 10DLC
   campaign before they can text; put the messaging service SID in `TWILIO_MESSAGING_SERVICE_SID` to have
   new numbers attached to it automatically.
4. Set `APP_URL` to the deployed URL. Twilio signature checks and the webhook URLs shown in the admin
   depend on it matching exactly.

## Onboarding a business (in `/admin`)

1. **Settings** — name, time zone, goal (in-home needs an address; phone only needs a time).
2. **Phone number** — search by area code and buy, or assign a number already in the subaccount.
3. **Calendar** — paste the merchant's Cal.com API key, pick the event type.
4. **FAQs** and **Qualifying questions**.
5. **Zapier** — per-merchant webhook URL, secret and field guide.
6. **Website chat** — embed snippet for WordPress / Elementor.
7. **Test** — chat as a lead; shows the tool calls and captured answers. Nothing is texted or booked.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/hooks/zapier/{merchantId}` | New lead. `X-Webhook-Secret` header required. |
| `POST /api/twilio/sms` | Inbound SMS (Twilio signature verified). |
| `POST /api/widget/chat`, `GET /api/widget/config` | Website chat widget (`public/widget.js`). |

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```
