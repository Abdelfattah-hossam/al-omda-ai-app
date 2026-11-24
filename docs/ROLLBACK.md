# Rollback

Production deploys run only after CI passes on `main`
(`.github/workflows/deploy-cloudflare.yml`, triggered by the CI workflow).

To roll back a bad release:

1. Fast path (Cloudflare dashboard): Workers & Pages, project `zahin` (and
   `al-omda-ai-app` for the Worker), Deployments, pick the last good
   deployment, "Rollback to this deployment".
2. Code path: `git revert <bad-commit>` and push to `main`. CI runs, then the
   deploy workflow ships the revert.
3. Database changes live in `supabase/migrations/`. Write a new forward
   migration to undo a bad one. Do not edit applied migrations.
4. Backups: see `docs/BACKUPS.md`.
