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
`password123` (also `sarah@`, `mike@`, `john@unifycrm.dev`, same password).

## What's implemented

- **Leads** — list/filter, manual create, CSV import (dedupe by phone/email,
  auto-normalizes phone, auto-creates company/source/campaign), round-robin
  auto-assignment
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
- **Settings** — users & roles (Admin/Manager/Agent/QA/Marketing), message
  templates, integration credential forms
- **Lead scoring** — a rule-based 0–100 score (reply activity, answered
  calls, call duration, pricing questions, stage) that recalculates after
  every message/call/stage change. It's a deterministic stand-in for the
  brief's "AI lead scoring" — same inputs, not model-driven yet — see
  `src/lib/scoring.ts` for where to swap in a real model call.

## Connecting real channels

Every send/receive path already exists; only the credentials are missing.
Until you add them, sends are **simulated** (logged to the timeline,
clearly marked) so the whole app works in a demo before any integration is
connected.

| Channel | Send | Receive (webhook) | Where to configure |
|---|---|---|---|
| WhatsApp | `src/lib/integrations/whatsapp.ts` → Meta Cloud API | `POST /api/webhooks/whatsapp` (Meta calls this) | Settings → Integrations, or `WHATSAPP_*` env vars |
| SMS | `src/lib/integrations/sms.ts` → Twilio | `POST /api/webhooks/sms` (Twilio calls this) | Settings → Integrations, or `TWILIO_*` env vars |
| Email | `src/lib/integrations/email.ts` (simulated only) | `POST /api/webhooks/email` (generic relay) | Needs an OAuth connect flow (Gmail/Graph) — see comments in that file for the missing piece |
| Zoom Phone | Call logging exists; click-to-call/recordings need the Zoom API | — | Settings → Integrations, or `ZOOM_*` env vars |

Point your WhatsApp Business app's webhook at
`https://<your-domain>/api/webhooks/whatsapp` and your Twilio number's
"a message comes in" webhook at `https://<your-domain>/api/webhooks/sms`.

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
