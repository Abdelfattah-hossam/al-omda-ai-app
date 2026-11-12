# AL OMDA AI

Arabic-first AI workspace for chat, project planning, specialist workflows, account memory, and user-owned task tracking.

## Current capabilities

- Supabase email/password authentication with HTTP-only session cookies.
- User-scoped profiles, tasks, independent AI conversations, and private account memory protected by Supabase Row Level Security.
- AI chat routed between configured Gemini and OpenRouter providers.
- Gemini Live voice sessions (requires the server-side Gemini key).
- AI-generated project plans saved to the user's workspace, with per-step approval, pause, resume, and stop controls.
- Shared daily AI allowance enforced by Supabase RPC.
- Profile preferences, avatar storage, and private user data.
- GitHub Actions CI runs typecheck and production build on pushes and pull requests.
- Installable web-app metadata and a service worker that caches the static app shell for offline launch.

## Important boundaries

- Project planning and approval are implemented; autonomous end-to-end execution of arbitrary web/mobile projects is not yet implemented. Approving a plan does not itself create or deploy a project.
- Offline support currently covers launching the cached app shell and cached static assets. Sign-in, AI providers, Supabase reads/writes, voice, and other server-backed actions require an internet connection.
- The service worker deliberately does not cache API responses, authentication data, private conversations, or secrets.
- Account memory is private context supplied to AI requests; it is not model training.
- Claude is not currently integrated as a provider.
- Dedicated document generation/export (DOCX, XLSX, PDF, and PPTX) and automated project execution still require implementation.

## Architecture

- `artifacts/al-omda-ai/` — React/Vite frontend and Cloudflare Worker configuration.
- `artifacts/api-server/` — Express-compatible API running inside the Cloudflare Worker.
- `supabase/setup.sql` and `supabase/migrations/` — user data, chat, memory, and quota schema.
- `.github/workflows/ci.yml` — automated typecheck and build validation.

The frontend calls the same-origin `/api` endpoints. Supabase credentials and AI provider keys remain server-side in Cloudflare Worker secrets; do not place secrets in the browser bundle.

## Local development

Use Node.js 22+ and pnpm 9:

```sh
pnpm install
pnpm --filter @workspace/al-omda-ai run dev
```

Run validation and production build:

```sh
pnpm run typecheck
pnpm run build
```

## Cloudflare deployment

The application Worker configuration is `artifacts/al-omda-ai/wrangler.jsonc`. The Worker serves the built frontend assets and routes `/api/*` requests through the API server.

Required server-side configuration includes:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY` (chat fallback and live voice)
- `OPENROUTER_API_KEY` (free-model chat routing)

Set these as Worker secrets/variables in Cloudflare. Never commit their values.

## Supabase setup

For a new Supabase project, run `supabase/setup.sql` in the SQL Editor. For an existing project, apply any unapplied migration files in `supabase/migrations/` in chronological order. Configure the Supabase Auth Site URL and allowed redirect URLs for the deployed app origin.

The database policies scope user-owned rows to the authenticated user. Do not use a service-role key in the browser or expose it to the Worker unless a separately reviewed server-side requirement is introduced.
