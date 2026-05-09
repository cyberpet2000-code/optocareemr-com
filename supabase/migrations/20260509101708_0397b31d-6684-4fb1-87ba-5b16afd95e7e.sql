CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'optocare-daily-summary';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'optocare-daily-summary',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://avogfzqizuusqzjivhqj.supabase.co/functions/v1/send-daily-summary',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2b2dmenFpenV1c3F6aml2aHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTQ0MTgsImV4cCI6MjA5MDU3MDQxOH0._mQQxxm-raT1p_fqowfQu65Tww_8nLduDuYJBKyzo2U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);