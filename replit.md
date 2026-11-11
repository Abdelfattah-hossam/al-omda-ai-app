# AL OMDA AI

Arabic-first AI agent marketplace and task workspace. The current MVP is a local browser preview with per-step plan approvals; it does not connect to an AI provider or execute external actions.

## Run & Operate

- `pnpm --filter @workspace/al-omda-ai run dev` — run the web preview
- `pnpm --filter @workspace/al-omda-ai run build` — build the static web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The web preview has no required secrets or external account setup.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/al-omda-ai/src/App.tsx` — app views, bilingual strings, local demo data, and task approval behavior
- `artifacts/al-omda-ai/src/index.css` — dark theme, RTL-aware layout, and responsive styles
- `README.md` — local run instructions and future GitHub, Cloudflare Pages, and Supabase setup notes

## Architecture decisions

- Keep the app usable as a clearly labeled local preview when Supabase is not configured.
- Route Supabase Auth, profile/task data, and private avatar storage through the API server; keep the publishable key server-side and never use a service-role key.
- Apply user-scoped RLS and use the signed-in user's token for database and storage calls.
- Clearly label deterministic plans and seeded tasks as previews; approval is not execution.
- Treat Cloudflare Pages as a static UI target until the `/api` service is also hosted and routed.

## Product

Users can explore six specialist categories, draft a request, inspect a proposed plan, and approve, reject, or edit each step. They can pause or stop tasks, review task history, and set local profile and language preferences.

## User preferences

- Arabic-first with full RTL support and an English language option.
- Never expose API keys or secrets in frontend code.
- Do not claim AI integrations work until configured; do not perform external actions without explicit approval.

## Gotchas

- Task and profile data currently live only in browser `localStorage`; they are not shared between devices or users.
- `supabase/setup.sql` is the manual SQL setup for profiles, tasks, RLS, and the private avatar bucket.
- Replit preview routes `/api` to the API server. Cloudflare Pages alone does not host the API.
- For Cloudflare Pages, use the build settings documented in `README.md`; the Vite config defaults to the domain root without workflow-provided `BASE_PATH`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
