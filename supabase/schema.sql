-- =========================================================================
-- Job-Search Accountability CRM — Postgres schema for Supabase
-- =========================================================================
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent-ish: safe to re-run, but DROPs are commented out to avoid
-- accidental data loss. If you need a clean slate, uncomment the DROP block.
--
-- Design notes (read these — they explain a few honest deviations):
--   * Every user-owned row is tied to user_id = auth.uid() via RLS.
--   * The single user logs in with a Supabase magic link. RLS makes the app
--     safe even though it is "single user" — defense in depth.
--   * The Apps Script background half uses the SERVICE ROLE key, which
--     BYPASSES RLS entirely, so it can read/write on the user's behalf.
--   * `email_events` and `notifications` carry their own `user_id`. The spec's
--     data model did not list it, but it is REQUIRED for correct RLS on
--     `needs_review` events that have NO matched application_id yet. Without
--     it, an unmatched event would be invisible to the owner. This is a
--     deliberate, documented addition.
--   * `email_events.application_id` is NULLABLE on purpose: a low-confidence /
--     ambiguous email is stored with classification='needs_review' and no
--     application until the user confirms the match (hard behavior #2).
-- =========================================================================

-- ---- OPTIONAL clean slate (uncomment to wipe everything) -----------------
-- drop table if exists public.notifications cascade;
-- drop table if exists public.email_events cascade;
-- drop table if exists public.tasks cascade;
-- drop table if exists public.contacts cascade;
-- drop table if exists public.field_defs cascade;
-- drop table if exists public.applications cascade;
-- drop type if exists public.application_stage cascade;
-- drop type if exists public.task_type cascade;
-- drop type if exists public.task_status cascade;
-- drop type if exists public.email_direction cascade;
-- drop type if exists public.email_classification cascade;
-- drop type if exists public.field_type cascade;

-- gen_random_uuid() lives in pgcrypto; Supabase has it enabled, but be safe.
create extension if not exists pgcrypto;

-- ---- Enums ---------------------------------------------------------------
do $$ begin
  create type public.application_stage as enum
    ('applied','responded','screen','interview','final','offer','rejected','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_type as enum ('linkedin_outreach','follow_up','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('open','done','snoozed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.email_direction as enum ('in','out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.email_classification as enum
    ('reply','interview_invite','rejection','linkedin_notice','other','needs_review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.field_type as enum ('text','number','date','select');
exception when duplicate_object then null; end $$;

-- ---- updated_at helper ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =========================================================================
-- applications
-- =========================================================================
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company_name    text not null,
  role_title      text,
  jd_url          text,
  jd_summary      text,
  source          text,                       -- e.g. 'linkedin','referral','company site'
  date_applied    date,
  stage           public.application_stage not null default 'applied',
  email_domain    text,                       -- e.g. 'anduril.com' — used by the watcher to match mail
  salary_target   text,                       -- free text ("$180k base", "180-200k") on purpose
  links           jsonb not null default '[]'::jsonb,   -- [{label,url}]
  notes           text,
  outreach_notes  text,                       -- my dictated outreach thinking, captured verbatim-ish (NO drafting)
  custom_fields   jsonb not null default '{}'::jsonb,   -- keyed by field_defs.key
  follow_up_due   timestamptz,
  last_contact_at timestamptz,
  sent_confirmed  boolean not null default false,       -- set true when the watcher finds my outgoing mail
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists applications_user_idx        on public.applications (user_id);
create index if not exists applications_stage_idx        on public.applications (user_id, stage);
-- Case-insensitive domain lookup for the watcher:
create index if not exists applications_email_domain_idx on public.applications (lower(email_domain));

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- =========================================================================
-- contacts  (manual paste-in — name, role, optional LinkedIn URL; NO sourcing)
-- =========================================================================
create table if not exists public.contacts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  name           text not null,
  role           text,
  linkedin_url   text,
  email          text,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists contacts_application_idx on public.contacts (application_id);

-- =========================================================================
-- tasks  (the heartbeat — deadlines drive the reminders)
-- =========================================================================
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  title          text not null,
  type           public.task_type not null default 'custom',
  due_at         timestamptz,
  notes          text,
  status         public.task_status not null default 'open',
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
-- Overdue = status='open' AND due_at < now(). Index supports that scan.
create index if not exists tasks_open_due_idx    on public.tasks (status, due_at);
create index if not exists tasks_application_idx  on public.tasks (application_id);

-- =========================================================================
-- email_events  (one row per Gmail thread linked to an application)
-- =========================================================================
create table if not exists public.email_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  application_id  uuid references public.applications(id) on delete cascade,  -- NULL while needs_review
  gmail_thread_id text,
  last_message_at timestamptz,
  direction       public.email_direction,
  classification  public.email_classification not null default 'other',
  summary         text,
  raw_snippet     text,
  notified        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists email_events_application_idx on public.email_events (application_id);
create index if not exists email_events_user_idx        on public.email_events (user_id);
create index if not exists email_events_review_idx      on public.email_events (user_id, classification);
-- Upsert key for the watcher: at most one row per (user, thread).
create unique index if not exists email_events_thread_uniq
  on public.email_events (user_id, gmail_thread_id)
  where gmail_thread_id is not null;

-- =========================================================================
-- field_defs  (drives custom fields the user adds by voice)
-- =========================================================================
create table if not exists public.field_defs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,                  -- machine key stored inside applications.custom_fields
  label       text not null,                  -- human label rendered in the UI
  type        public.field_type not null default 'text',
  options     jsonb not null default '[]'::jsonb,  -- for type='select'
  applies_to  text not null default 'applications',
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists field_defs_user_idx on public.field_defs (user_id);

-- =========================================================================
-- notifications  (optional send log, used to dedupe + audit)
-- =========================================================================
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  type           text,            -- 'event' | 'digest' | ...
  message        text,
  sent_at        timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.applications  enable row level security;
alter table public.contacts      enable row level security;
alter table public.tasks         enable row level security;
alter table public.email_events  enable row level security;
alter table public.field_defs    enable row level security;
alter table public.notifications enable row level security;

-- applications: direct ownership
drop policy if exists applications_owner on public.applications;
create policy applications_owner on public.applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- contacts: ownership derived from parent application
drop policy if exists contacts_owner on public.contacts;
create policy contacts_owner on public.contacts
  for all
  using (application_id in (select id from public.applications where user_id = auth.uid()))
  with check (application_id in (select id from public.applications where user_id = auth.uid()));

-- tasks: ownership derived from parent application
drop policy if exists tasks_owner on public.tasks;
create policy tasks_owner on public.tasks
  for all
  using (application_id in (select id from public.applications where user_id = auth.uid()))
  with check (application_id in (select id from public.applications where user_id = auth.uid()));

-- email_events: direct ownership via user_id (covers unmatched needs_review rows)
drop policy if exists email_events_owner on public.email_events;
create policy email_events_owner on public.email_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- field_defs: direct ownership
drop policy if exists field_defs_owner on public.field_defs;
create policy field_defs_owner on public.field_defs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications: direct ownership
drop policy if exists notifications_owner on public.notifications;
create policy notifications_owner on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- Done. Next: run seed.sql (after you have logged in once so an auth user
-- exists), or create your first application from the app UI.
-- =========================================================================
