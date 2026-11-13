-- PeakAlert — background job every minute using Supabase pg_cron + pg_net (free on all plans).
-- Run AFTER deploying the app. Replace the two placeholders before running:
--   <APP_URL>      e.g. https://peakalert.vercel.app   (no trailing slash)
--   <CRON_SECRET>  the same value you set as CRON_SECRET in Vercel
-- The secret is stored in Supabase Vault, not in the job definition.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'peakalert_cron_secret');

select cron.schedule(
  'peakalert-refresh',
  '* * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'peakalert_cron_secret'),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Check runs:   select * from cron.job_run_details order by start_time desc limit 10;
-- Responses:    select status_code, content from net._http_response order by created desc limit 10;
-- Stop the job: select cron.unschedule('peakalert-refresh');
