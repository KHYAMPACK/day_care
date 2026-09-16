-- seed_demo_auth_user() is a dev/seed-script helper (scripts/seed-demo-school.mjs) that
-- inserts directly into auth.users/auth.identities with a caller-supplied password and
-- creates a public.profiles row with role='teacher'. It was left granted to PUBLIC, which
-- Postgres extends to anon and authenticated — meaning anyone with the project's public
-- anon key (embedded in the frontend bundle, not a secret) could call it over PostgREST
-- and create themselves a working teacher login with no auth at all. The seed script
-- already authenticates with the service-role key, which is unaffected by this revoke.

revoke execute on function public.seed_demo_auth_user(uuid, text, text, text) from public;
revoke execute on function public.seed_demo_auth_user(uuid, text, text, text) from anon;
revoke execute on function public.seed_demo_auth_user(uuid, text, text, text) from authenticated;
