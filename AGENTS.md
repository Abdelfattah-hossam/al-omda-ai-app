# Al Omda AI — Agent Engineering Rules

These rules apply to every coding agent working in this repository.

## Mandatory workflow
1. Understand the request and inspect the existing implementation before changing files.
2. For multi-file or architectural work, write a concise plan with scope, risks, tests, and rollback before implementation. Use the Superpowers brainstorming/planning workflow when available.
3. Write or update focused tests before/alongside implementation; reproduce bugs first where practical. Use test-driven development for bug fixes and non-trivial behavior.
4. Implement the smallest safe change. Do not refactor unrelated modules.
5. Run targeted tests, type checks, build, and relevant browser tests. Report exact commands and outcomes; never claim a test ran when it did not.
6. Review the diff for security, accessibility, responsive behavior, regressions, and accidental scope expansion.
7. For UI changes, capture desktop and mobile screenshots and inspect them when browser tooling is available.

## Skill routing
- UI/visual design: load `.agents/skills/frontend-design/SKILL.md` before designing or changing visual UI. Respect the user's existing visual direction; avoid generic templates and do not redesign unrelated screens.
- React/TypeScript performance: load `.agents/skills/vercel-react-best-practices/SKILL.md` before writing or reviewing React components, data fetching, bundles, rendering, or client state.
- Supabase/Postgres: load `.agents/skills/supabase-postgres-best-practices/SKILL.md` before any SQL, schema, migration, RLS, index, trigger, function, or query change. Review tenant isolation and RLS tests.
- Browser verification: load `.agents/skills/webapp-testing/SKILL.md` for web UI testing, browser interactions, screenshots, and console/network diagnostics. Use real browser evidence.
- Planning, TDD, debugging, and review: use the Superpowers plugin when installed. Do not skip the plan/test/review cycle because the plugin is unavailable; follow this file manually.

## Al Omda non-regression constraints
- Do not change chat scrolling, scroll anchoring, composer positioning, message movement, or route-transition behavior unless the user explicitly asks.
- Preserve desktop/mobile behavior and Arabic RTL/English LTR.
- Do not invent integration success, external credentials, test evidence, provider availability, or deployment status.
- Never copy production secrets into preview/test environments. Use isolated test credentials and data.
- Keep free-first service choices unless the user approves a paid dependency.
- Before publishing, require successful CI and explicit authorization when the action changes production behavior or data.
