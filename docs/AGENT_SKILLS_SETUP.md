# Agent Skills and Claude Code setup

This repository now includes four project-scoped Agent Skills under `.agents/skills/`:
- `frontend-design` — Anthropic design workflow.
- `webapp-testing` — Anthropic Playwright browser verification workflow.
- `vercel-react-best-practices` — Vercel React/Next.js performance rules.
- `supabase-postgres-best-practices` — Supabase/Postgres schema, RLS, and performance rules.

The original upstream `SKILL.md` files are included with their source metadata/license notices. Check each upstream repository for updates and any additional bundled reference files.

## Superpowers plugin
Project Claude Code settings register `obra/superpowers-marketplace` and enable `superpowers@superpowers-marketplace`. After opening and trusting this repository in Claude Code, install/refresh the marketplace plugin if Claude Code has not installed it automatically:

```text
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

The plugin supplies planning, TDD, debugging, and review workflows. The repository's `AGENTS.md` keeps the core workflow available to other coding agents too.

## Local installation note
These are project files, not a global installation on every contributor's machine. The four skills are discoverable by Agent Skills-compatible tools that load `.agents/skills`; Claude Code may also need its skill links/installation step depending on its version and local setup. The Superpowers marketplace/plugin must be installed by Claude Code on the developer's machine. ChatGPT cannot execute Claude Code's `/plugin` commands or install plugins into a separate Claude Code runtime.

## Sources
- Anthropic skills: https://github.com/anthropics/skills
- Vercel agent skills: https://github.com/vercel-labs/agent-skills
- Supabase agent skills: https://github.com/supabase/agent-skills
- Superpowers marketplace: https://github.com/obra/superpowers-marketplace
