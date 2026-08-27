# Unify CRM

A unified sales CRM: leads, WhatsApp, Zoom Phone calls, email and SMS all
centered on one lead record with one activity timeline — the "golden
record" concept from the product brief. This is the Phase 1 MVP described
in that brief: leads, pipeline, unified inbox, calls, follow-ups, dashboard
and reports, with the channel integrations scaffolded and ready for real
credentials.

## Stack

- **Next.js 16** (App Router, TypeScript) — frontend + API routes in one app
- **PostgreSQL** via **Prisma 5**
- **Custom JWT session auth** (httpOnly cookie, `jose` + `bcryptjs`) — no third-party auth service
- **Tailwind CSS 4** for UI

The brief's reference architecture calls for a separate Node/NestJS API —
this MVP folds that into Next.js API routes to ship faster. The data model
and integration boundaries are identical either way, so splitting the API
out later is a deployment change, not a rewrite.

## Getting started

```bash
npm install

# Start a local Postgres and create a database, then:
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET

npx prisma migrate dev   # creates tables
npm run db:seed          # demo org, users, leads, conversations

npm run dev
```

Sign in at `http://localhost:3000/login` with `admin@unifycrm.dev` /
`password123` (also `sarah@`, `mike@`, `john@unifycrm.dev` as sales
agents, and `priya.entry@unifycrm.dev` as a Lead Entry user — same
password for all).

## What's implemented

- **Leads** — sheet-style fields (ID name/URL, client name, country,
  website, phone/email, delivery date, price, duration, status note),
  manual create, CSV import matching those same columns, duplicate
  detection on phone/email/website before a lead is created
- **Roles & allocation** — Super Admin (everything), Lead Entry (can only
  add leads — no pipeline/inbox/calls/reports/settings), Sales Agent (only
  leads a Super Admin has allocated to them, plus calls/WhatsApp/SMS/email
  on those leads), Manager/QA/Marketing (org-wide visibility). New leads
  come in **unassigned** — a Super Admin allocates each one to an agent
  from the Leads list or a lead's detail page. A Lead Entry user's own
  leads drop out of their view **24 hours** after they added them (Admins
  always see everything, with filters by date, who entered it, and who
  it's allocated to)
- **Signup & approval** — `/signup`: email → a 6-digit verification code →
  set a password and pick a role → account is created **inactive**. A
  Super Admin sees it under Settings → Users → Pending approval (also
  flagged on their dashboard) and must approve it before that person can
  log in
- **Pipeline** — drag-and-drop kanban across configurable stages (New →
  Contacted → Interested → Follow-up → Won/Lost), stage history log
- **Lead profile** — the golden record: one contact, one unified activity
  timeline merging WhatsApp/SMS/email messages, calls, notes, stage changes
  and follow-ups, in one feed
- **Unified inbox** — one screen for WhatsApp/SMS/email conversations across
  all leads, reply from the same box regardless of channel
- **Calls** — call log per lead (direction, status, duration, next action,
  summary field), org-wide call list; click-to-call is a stub pending Zoom
  Phone credentials
- **Follow-up engine** — tasks with due dates, overdue/today/upcoming
  grouping, dashboard alerts for anything overdue
- **Dashboard** — today's numbers, agent leaderboard, hot-lead and overdue
  alerts, recent activity feed
- **Reports** — revenue/conversion, per-agent performance, leads by source,
  pipeline distribution, channel response rates
- **Settings** — users & roles, pending-signup approval, message templates,
  and multi-account integrations (add as many WhatsApp numbers / Gmail
  mailboxes / Twilio numbers as you use, each under its own label)
- **Lead scoring** — a rule-based 0–100 score (reply activity, answered
  calls, call duration, pricing questions, stage) that recalculates after
  every message/call/stage change. It's a deterministic stand-in for the
  brief's "AI lead scoring" — same inputs, not model-driven yet — see
  `src/lib/scoring.ts` for where to swap in a real model call.

## Connecting real channels

Every send/receive path already exists; only the credentials are missing.
Until you add at least one account, sends are **simulated** (logged to the
timeline, clearly marked) so the whole app works in a demo before any
integration is connected. WhatsApp, SMS, and Gmail all support **multiple
named accounts** — add one entry per number/mailbox in Settings →
Integrations, no code changes needed.

| Channel | Send | Receive | Where to configure |
|---|---|---|---|
| WhatsApp | `src/lib/integrations/whatsapp.ts` → Meta Cloud API | `POST /api/webhooks/whatsapp` (Meta calls this) | Settings → Integrations → "+ Add another" |
| SMS | `src/lib/integrations/sms.ts` → Twilio | `POST /api/webhooks/sms` (Twilio calls this) | Settings → Integrations → "+ Add another" |
| Email (Gmail) | `src/lib/integrations/email.ts` → SMTP via an app password | "Check for new emails now" button (polls IMAP — there's no push webhook for app-password Gmail) | Settings → Integrations → "+ Add another" |
| Zoom Phone | Call logging exists; click-to-call/recordings need the Zoom API | — | Settings → Integrations |

Point your WhatsApp Business app's webhook at
`https://<your-domain>/api/webhooks/whatsapp` and each Twilio number's
"a message comes in" webhook at `https://<your-domain>/api/webhooks/sms`.
All connected WhatsApp/Twilio numbers share those same two webhook URLs
(that's how both platforms' webhooks work — one subscription covers every
number under the account); outbound sends use the first connected account
of that type unless the app is extended to let an agent pick one.

## Data model

See `prisma/schema.prisma`. Core flow: `Contact` → `Lead` (through a
configurable `Pipeline`/`PipelineStage`) → `Conversation`/`Message` (per
channel) + `Call` + `Task` + `Note`, all funneling into a single `Activity`
table per lead that the timeline reads from — one place to add a new
channel or event type without touching the UI.

Everything is scoped by `organizationId`, so multi-tenant SaaS (per the
brief's Phase 3) is a matter of adding organization switching to the UI,
not a schema change.

## What's next (per the original brief's phasing)

- **Phase 2**: automation engine (if/then rules on stage/time), AI call
  summaries and reply suggestions on top of the existing `Call.aiSummary` /
  `Message` fields, campaign-level ROI reporting
- **Phase 3**: predictive scoring, a visual workflow builder, customer
  portal, full multi-tenant org switching, white-labeling
