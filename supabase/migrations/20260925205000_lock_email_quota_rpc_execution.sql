-- Security hardening: email quota is server-side only.
-- This RPC is called by Edge Functions with the service role.
-- Browser-authenticated users must not be able to invoke or manipulate the quota directly.

REVOKE ALL ON FUNCTION public.try_consume_email_quota(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_email_quota(text, integer) TO service_role;
