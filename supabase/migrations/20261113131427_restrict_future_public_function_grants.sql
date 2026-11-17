-- Prevent newly created public-schema functions owned by postgres from inheriting client EXECUTE.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
