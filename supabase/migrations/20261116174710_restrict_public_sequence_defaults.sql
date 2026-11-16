alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
