alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
