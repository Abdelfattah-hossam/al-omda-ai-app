# Backups

The Supabase free plan has no automatic backups. Schema is in
`supabase/migrations/`. For data, run a logical export of the public tables
and store it encrypted outside Supabase. See the security report for the
current state of the scheduled export.
