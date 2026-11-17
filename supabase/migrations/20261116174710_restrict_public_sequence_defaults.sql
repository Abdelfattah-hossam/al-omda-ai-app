-- Preserved because this migration was already applied to Supabase. The later 20261116174738 migration supersedes it with REVOKE ALL.
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
