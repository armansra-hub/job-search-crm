# Job-Search Accountability CRM

A personal, single-user web app that is really an **accountability engine with a
CRM attached**. It tracks every company you've applied to, nags you to follow up,
watches your Gmail for responses, and keeps you organized. The CRM data exists so
the reminders have something to act on — **tasks-with-deadlines are the heartbeat**.

> Built to a fixed spec. Where the spec contradicted itself, the locked behavior
> wins — see [One deliberate deviation](#one-deliberate-deviation-no-message-drafting).

---

## How it's split across three runtimes (and why)

| Runtime | Does | Why it has to be separate |
| --- | --- | --- |
| **Next.js on Vercel** | UI, voice capture, and server-side `/api` routes that hold the Anthropic key | The Anthropic key can't live in the browser |
| **Supabase** (Postgres + Auth + RLS) | Database + magic-link auth; syncs across machines | localStorage doesn't sync across computers |
| **Google Apps Script** (bound to your Gmail) | Always-on Gmail watcher + notifier + daily digest, on time-driven triggers | A web page can't run when closed or read Gmail; Apps Script runs *as you* with native Gmail + scheduling |

The Apps Script half is **fully self-contained** — it talks to Supabase directly
over REST and does **not** depend on the Vercel app being up.

---

## Repo layout

```
job-search-crm/
├─ supabase/
│  ├─ schema.sql          # tables, enums, indexes, RLS policies — run this first
│  └─ seed.sql            # one test application (run after first login)
├─ src/
│  ├─ app/
│  │  ├─ page.tsx         # the board (server component)
│  │  ├─ login/           # magic-link login + server action
│  │  ├─ auth/            # callback (code exchange) + signout
│  │  └─ api/             # parse-command, apply-command, summarize-jd,
│  │     │                #   applications, tasks, contacts, field-defs
│  ├─ components/         # Board, ApplicationCard, DetailDrawer, VoiceBar,
│  │                      #   CommandDiff, ApplicationForm, Tasks/Contacts, …
│  └─ lib/                # supabase clients, types, command model, data access
├─ apps-script/
│  ├─ Code.gs             # watcher + sent-confirm + daily digest + triggers
│  └─ appsscript.json     # manifest (V8 runtime + OAuth scopes)
└─ .env.example
```

---

## One deliberate deviation: NO message drafting

Build-order step 4 in the original brief said "Add JD summary + **message
drafting**," but the locked hard behavior #5 says **NO message drafting** — you
draft outreach elsewhere. **The locked behavior wins.** This app:

- **captures your outreach thinking** (who to contact, your angle, why you fit)
  verbatim-ish into `outreach_notes` so you can read it back and copy it out, and
- **does NOT** generate or send any outreach message for you.

The JD *summarizer* is built (that was never in conflict).

---

## Setup

Everything below marked **[manual]** is something this codebase cannot do for you.

### 0. Prerequisites

- **Node.js 18.17+** and npm. (This repo was authored in an environment without a
  Node runtime, so it has not been `npm install`-ed or built here — do that as your
  first step.)
- A **Supabase** account, a **Vercel** account, an **Anthropic** API key, and a
  **Google** account (the one whose Gmail you want watched).

### 1. Supabase — database + auth **[manual]**

1. Create a new Supabase project. Note your **Project URL**, **anon public key**,
   and **service_role key** (Project Settings ▸ API).
2. SQL Editor ▸ paste and run [`supabase/schema.sql`](supabase/schema.sql). This
   creates all tables, enums, indexes, and **Row Level Security** policies.
3. Authentication ▸ **URL Configuration**:
   - **Site URL:** `http://localhost:3000` for dev (change to your Vercel URL in prod).
   - **Redirect URLs:** add `http://localhost:3000/auth/callback` and, later,
     `https://YOUR-APP.vercel.app/auth/callback`.
4. Email auth (magic link) is on by default. For real magic-link emails in
   production, configure SMTP under Authentication ▸ Emails (optional for local
   testing — the dev inbox / logs show the link).

### 2. Run the web app locally

```bash
cd job-search-crm
cp .env.example .env.local      # then fill in the values
npm install
npm run dev                     # http://localhost:3000
npm run typecheck               # optional: tsc --noEmit
```

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # not used by the web app at runtime; kept for parity
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_REASONING=claude-sonnet-4-6
ANTHROPIC_MODEL_FAST=claude-haiku-4-5
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Sign in with the magic link, then (optional) run
[`supabase/seed.sql`](supabase/seed.sql) to get one test application.

### 3. Deploy to Vercel **[manual]**

1. Import the repo into Vercel (root = `job-search-crm/`).
2. Project Settings ▸ Environment Variables — set: `ANTHROPIC_API_KEY`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_MODEL_REASONING`,
   `ANTHROPIC_MODEL_FAST`, and `NEXT_PUBLIC_SITE_URL=https://YOUR-APP.vercel.app`.
3. Deploy, then add `https://YOUR-APP.vercel.app/auth/callback` to the Supabase
   Redirect URLs and update the Supabase **Site URL**.

### 4. Google Apps Script — the always-on half **[manual]**

1. Go to [script.google.com](https://script.google.com), **New project**, while
   signed in as the Google account whose Gmail you want watched.
2. Paste [`apps-script/Code.gs`](apps-script/Code.gs) into `Code.gs`. Enable
   *Project Settings ▸ Show "appsscript.json" manifest file* and paste
   [`apps-script/appsscript.json`](apps-script/appsscript.json) (set your
   `timeZone` — the 8am digest uses it).
3. Project Settings ▸ **Script Properties** — add:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NOTIFY_EMAIL`
   - recommended: `USER_ID` (your Supabase auth user UUID, from Authentication ▸
     Users). If omitted, the script derives it from your first application.
   - optional: `STALE_DAYS` (default 7), `WATCH_DAYS` (default 2),
     `ANTHROPIC_MODEL_FAST`.
4. Run `testConnection` once and approve the consent screen. Check the logs say
   Supabase OK / Anthropic OK and that you received the test email.
5. Run `installTriggers` once. This wires:
   - `runWatcher` every **15 minutes**, and
   - `runDigest` daily at **8am** (your manifest timezone).

That's it — close the tab; the triggers keep running on Google's infra.

---

## Manual setup checklist (the things Claude Code can't do)

- [ ] Create the Supabase project; copy URL, anon key, service-role key.
- [ ] Run `schema.sql` (and later `seed.sql`).
- [ ] Set the Supabase Site URL + Redirect URLs.
- [ ] Set Vercel env vars and deploy.
- [ ] Create the Apps Script project, paste `Code.gs` + `appsscript.json`, set
      Script Properties, authorize scopes, run `installTriggers`.

---

## How the voice / text command flow works

1. You speak or type a command in the bar at the top of the board.
2. The client POSTs `{ transcript }` to **`/api/parse-command`**, which builds a
   fresh state snapshot from the DB and asks Claude (Sonnet) to return a
   **structured diff** of proposed changes. **It writes nothing.**
3. The UI shows the diff (company, role, due dates, outreach notes, …) so you can
   catch a misheard company name.
4. You click **Apply** → **`/api/apply-command`** performs the confirmed writes.

This is the **confirm-before-apply** guarantee: voice/AI never mutates data
silently. New applications also auto-capture your dictated outreach intent into
`outreach_notes`, create any named contacts, and create the **48-hour LinkedIn
outreach task**.

You can also add custom fields by voice ("track expected salary for each
company") — these become `field_defs` + JSONB `custom_fields`, rendered
dynamically. **The app never rewrites its own source code or redeploys itself**;
new *capabilities* (vs. new *fields*) are out of scope for voice and handled by
re-running Claude Code.

---

## Anthropic models

- **Classification + thread summaries** (high volume, cheap): `claude-haiku-4-5`.
- **Command parsing + JD summaries** (need reasoning): `claude-sonnet-4-6`.

All configurable via env (`ANTHROPIC_MODEL_FAST` / `ANTHROPIC_MODEL_REASONING`
in the web app; `ANTHROPIC_MODEL_FAST` Script Property in Apps Script). Standard
`/v1/messages` endpoint.

---

## Security notes

- The **service-role key bypasses RLS** and lives in exactly two trusted places:
  Apps Script Script Properties and (optionally) Vercel server env. It is **never**
  `NEXT_PUBLIC_`-prefixed and never reaches the browser.
- The browser only ever uses the **anon key** + your logged-in session; **RLS**
  scopes every row to `auth.uid()`.
- The Anthropic key is only used inside server-side `/api` routes and Apps Script.
- The Apps Script manifest requests `https://mail.google.com/` because `GmailApp`
  **both reads and sends** mail in this script (search the inbox + send your
  alerts). That is a broad scope; it runs only as you, on your own account.

---

## Honest caveats (read these)

- **Voice is Chrome/Edge-only-ish.** The Web Speech API is unreliable in
  Safari/Firefox. A **text input is always available** as a fallback; the UI says
  so.
- **LinkedIn bodies are usually truncated** in the notification email. The watcher
  flags *arrival* and links it to a company when the subject/snippet names one —
  it often can't see the full message. Read it in LinkedIn.
- **No LinkedIn contact sourcing.** Contacts are added manually (name, role,
  optional LinkedIn URL). The app captures your outreach *thinking* as notes but
  **does not draft messages** — you draft those elsewhere.
- **Email→company matching is best-effort.** Clean sender-domain matches are
  trusted; ambiguous mail is sent to Claude, and **low-confidence / null matches
  become `needs_review`** and are surfaced for you to confirm — never auto-applied
  silently.
- **JD summarize from a URL** only sees server-rendered HTML. Many job boards
  (Greenhouse/Lever/Workday widgets, SPA career pages) render client-side, so the
  fetch can come back nearly empty — **paste the JD text** in that case (the form
  supports it).
- **Sent-mail confirmation has a small delay** (it runs on the 15-min watcher,
  not instantly).
- This environment had **no Node runtime**, so the web app was written but not
  built/run here. Run `npm install && npm run typecheck && npm run dev` to verify.

---

## Data model

See [`supabase/schema.sql`](supabase/schema.sql) for the authoritative schema.
Tables: `applications`, `contacts`, `tasks`, `email_events`, `field_defs`,
`notifications`. Two deliberate additions beyond the original field list, both
documented in the SQL: `email_events`/`notifications` carry their own `user_id`
(needed for correct RLS on unmatched `needs_review` events), and
`email_events.application_id` is nullable (an unmatched email has no application
until you confirm it).

The two board "sections" (Waiting on response / In conversation) plus a Closed
bucket are **filters over `stage`**, not separate tables.
