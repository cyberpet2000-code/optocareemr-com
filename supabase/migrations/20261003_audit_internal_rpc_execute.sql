-- Audit hardening: remove anonymous RPC execution from internal SECURITY DEFINER functions.
-- Public feedback endpoints remain intentionally callable with opaque tokens.

REVOKE EXECUTE ON FUNCTION public.get_own_staff_feedback_rating(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_receptionist_patient_visits(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_receptionist_patient_visits_page(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_visit_audit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_daily_front_desk_report(uuid) FROM anon;

-- log_visit_audit is a trigger/helper, not an application RPC.
REVOKE EXECUTE ON FUNCTION public.log_visit_audit() FROM authenticated;

-- Explicitly preserve the intended public feedback token endpoints.
GRANT EXECUTE ON FUNCTION public.get_public_feedback_request(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_patient_feedback(
  text, integer, integer, integer, text, integer, text, text, integer, integer,
  boolean, boolean, text, integer, boolean, integer, boolean, integer, text, text,
  text, boolean
) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_patient_feedback(
  text, integer, integer, integer, integer, integer, integer, boolean, text, text
) TO anon;
