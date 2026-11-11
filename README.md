# AL OMDA AI

An Arabic-first marketplace and workspace for reviewing work plans from specialist agents. The current MVP is a browser-only preview: it includes Business, Development, Design, Marketing, Research, and Personal Assistant specialties, with per-step approval controls and local task history.

## Current MVP boundaries

- Arabic is the default language; English is available from the language switch.
- Requests create specialty-specific example plans in the browser.
- Users can edit, approve, or reject each step, and pause, resume, or stop a task.
- Tasks and profile preferences are stored in that browser's `localStorage`.
- No AI provider, external actions, sign-in, shared database, or remote persistence is connected. Plan approval is not task execution.
- No API keys or credentials are needed to run the current preview.

## Run locally

Use Node.js 24 and pnpm from the repository root:

```sh
pnpm install
pnpm --filter @workspace/al-omda-ai run dev
```

Create a static production build:

```sh
pnpm --filter @workspace/al-omda-ai run build
```

Build output: `artifacts/al-omda-ai/dist/public`.

## GitHub and Cloudflare Pages

The repository is already initialized for Git. To publish it through GitHub and Cloudflare:

1. Create or choose a GitHub repository and connect it through Replit's Git controls. Review the staged files before the first push; do not commit credentials or generated build output.
2. In Cloudflare Pages, create a project connected to that repository. The repository root is the project root.
3. Set the build command to `pnpm --filter @workspace/al-omda-ai run build`.
4. Set the output directory to `artifacts/al-omda-ai/dist/public` and use Node.js 24 with pnpm.
5. Deploy the static site. No application secrets are needed for this preview.

The Vite build defaults to the domain root when `BASE_PATH` is not supplied, which matches the current Cloudflare Pages setup. The Pages deployment hosts the UI only; it does not deploy this workspace's separate API server or provide shared user data.

## Supabase authentication and storage

The API server now supports email/password Supabase Auth, user-owned profile/task records, and private profile-avatar storage. The browser calls the same-origin `/api` service; Supabase credentials and session tokens stay on the server in Replit Secrets / HTTP-only cookies. The server uses the signed-in user's access token with Supabase RLS; it does not use a service-role key.

### One-time Supabase setup

1. In the Supabase project, open **SQL Editor** and run `supabase/setup.sql`. It creates the profile and task tables, the new-user profile trigger, user-scoped RLS policies, and a private `user-avatars` bucket. The script does not delete user records.
2. In Supabase **Authentication → URL Configuration**, set the Site URL to the app address used for email confirmation. Add any development or production app addresses to the allowed redirect URLs before testing email confirmation.
3. In **Project Settings → API Keys**, copy the Project URL and the publishable key. Add `SUPABASE_URL` as a shared environment variable and `SUPABASE_PUBLISHABLE_KEY` as a Replit Secret for the API server. Do not use the `service_role` or secret key.
4. Restart the API server and open the app's **Profile → Supabase account** panel. Create an account or sign in; if email confirmation is enabled, confirm the address and then sign in.
5. Test with a profile edit, a proposed task, one approval, and an avatar upload. The account should only see its own records and image. The plan itself remains a local deterministic preview—not AI output or task execution.

No paid service is required by this integration code. Supabase plan limits and email delivery options are controlled by Supabase and can change; check the project dashboard before scaling usage.

### Hosting boundary

The Replit preview routes `/api` to `artifacts/api-server`. Cloudflare Pages currently serves only the static UI and does not host that API. For a Cloudflare deployment, the API must also be deployed to a server-side runtime and `/api` routed to it; the browser bundle must not receive Supabase keys or session tokens. The static preview still works locally when Supabase settings are absent, and clearly remains local-only.

## Project structure

- `artifacts/al-omda-ai/` — AL OMDA AI web app
- `artifacts/api-server/` — same-origin API for Supabase auth, user-scoped data, and private avatars
- `lib/` — shared API, database, and validation packages from the workspace scaffold

