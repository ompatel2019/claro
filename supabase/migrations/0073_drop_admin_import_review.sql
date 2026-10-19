-- Requires Om/master sign-off before production application.
-- KILL_LIST E4: the authenticated wrapper admin_import_review has no caller; the
-- admin loader calls the service-only question_import_review (kept unchanged).
-- Exact signature, no CASCADE.
drop function if exists public.admin_import_review(double precision, jsonb);
