-- =========================================================================
-- Seed data — one test application + a contact + the 48h LinkedIn task.
-- =========================================================================
-- PREREQUISITE: you must have logged into the app at least once (magic link)
-- so a row exists in auth.users. This script attaches the seed to the most
-- recently created auth user. Run it in the Supabase SQL editor.
-- Safe to run once; running again creates duplicate seed rows.
-- =========================================================================

do $$
declare
  uid uuid;
  app_id uuid;
begin
  select id into uid from auth.users order by created_at desc limit 1;
  if uid is null then
    raise exception 'No auth user found. Log into the app once (magic link), then re-run seed.sql.';
  end if;

  insert into public.applications
    (user_id, company_name, role_title, jd_url, jd_summary, source, date_applied,
     stage, email_domain, salary_target, links, outreach_notes, follow_up_due)
  values
    (uid, 'Anduril', 'Forward Deployed Engineer',
     'https://www.anduril.com/careers/',
     'FDE role embedding with customers to deploy Lattice; mix of software + field work. Looks for autonomy, comfort with ambiguity, defense-tech interest.',
     'company site', current_date - 1,
     'applied', 'anduril.com', '$190k base + equity',
     '[{"label":"Careers","url":"https://www.anduril.com/careers/"}]'::jsonb,
     'Want to reach out to a current FDE on the team — angle: my field-deploy experience + I shipped a hardware-in-the-loop tool. Why I fit: I like being where the customer is, not behind a desk.',
     now() + interval '2 days')
  returning id into app_id;

  insert into public.contacts (application_id, name, role, linkedin_url, notes)
  values (app_id, 'Jordan Rivera', 'FDE, Lattice', 'https://www.linkedin.com/in/example-jordan/',
          'Pasted in manually — found via a mutual connection. Have NOT messaged yet.');

  -- The 48-hour LinkedIn outreach task (the heartbeat reminder).
  insert into public.tasks (application_id, title, type, due_at, notes, status)
  values (app_id, 'Message a contact at Anduril on LinkedIn',
          'linkedin_outreach', now() + interval '48 hours',
          'Use the outreach notes captured with this application. Draft the message yourself elsewhere.',
          'open');

  raise notice 'Seeded application % for user %', app_id, uid;
end $$;
