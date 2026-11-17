-- Remove inherited PUBLIC and direct anon execution from existing public-schema functions.
-- Trigger functions remain usable by their triggers without granting client EXECUTE.
revoke execute on all functions in schema public from public, anon;
