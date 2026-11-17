-- Application tables are private to authenticated, row-scoped access; anon receives no table privileges.
revoke all on all tables in schema public from anon;
