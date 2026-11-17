-- This full revoke supersedes the narrower sequence privilege revoke in 20261116174710.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
