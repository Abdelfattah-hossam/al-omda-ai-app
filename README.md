# AL OMDA AI

**An Arabic-first, open-source AI workspace evolving into a tool-using agent platform.**

AL OMDA AI combines an AI chat workspace, user-owned project tracking, and a separate local runtime foundation for tools that must run on the user's computer.

> Status: active development / experimental agent runtime. The current web app is not yet a full autonomous coding or desktop agent. See the implementation boundaries below.

## What works today

- Arabic/English React web application.
- Supabase email/password authentication with HTTP-only session cookies.
- User-scoped profiles, tasks, conversations, and private account memory protected by Supabase Row Level Security.
- AI chat routed through configured Gemini and OpenRouter providers.
- Gemini Live voice sessions when the server-side Gemini key is configured.
- AI-generated project plans with per-step approval, pause, resume, and stop controls.
- Daily AI allowance enforced through Supabase RPC.
- User workspace, profile preferences, and avatar storage.
- Document and spreadsheet export flows with fallbacks.
- Installable web-app shell and GitHub Actions typecheck/build validation.

## Local agent runtime (experimental)

A separate Node.js runtime now provides the first local tools:

- Workspace file listing, reading, and writing with path and symlink checks.
- Tool discovery through `GET /v1/tools` and project Skills from `.omda/skills/`.
- A model-driven tool loop with saved sessions and approval gates for file writes and terminal commands.
- Parallel read-only delegation to 2–4 specialist agents.
- OpenAI-compatible local model endpoints such as LM Studio (no provider API key required when running locally).
- Resumable JSON session storage.
- Scoped HTTPS inspection for exact authorized hostnames.
- Optional terminal command execution, disabled by default.

The Agents workspace includes a local-runtime connection panel for testing the connection, submitting a task, and approving or denying requested file/terminal actions. See [Local Agent Runtime](docs/agent-runtime.md) for setup, endpoints, local model configuration, and security boundaries.

## Architecture

- `artifacts/al-omda-ai/` — React/Vite frontend and Cloudflare Worker configuration.
- `artifacts/api-server/` — Express-compatible API running inside the Cloudflare Worker.
- `scripts/src/agent-runtime.ts` — local Node.js runtime for workspace tools.
- `supabase/` — database setup and migrations.
- `.github/workflows/ci.yml` — typecheck and production build validation.

The Cloudflare Worker serves the web application and API. It cannot directly control a user's desktop or safely run arbitrary local processes. Those capabilities require the local runtime or a separately installed desktop companion.

## Roadmap

The following are goals, not claims of existing functionality:

1. Connect the local runtime to an agent loop with validated tool calls, approval gates, streaming progress, retries, and cancellation.
2. Add browser automation for Chromium/Firefox with explicit per-site permissions and tab management.
3. Add desktop control through a separately installed, permissioned companion.
4. Add MCP client support and a versioned Skills format.
5. Add specialist agents for coding, testing, project analysis, documentation, and authorized security research.
6. Add parallel multi-agent orchestration with shared task state and isolated workspaces.
7. Add provider adapters for Gemini, OpenRouter, Anthropic, OpenAI-compatible endpoints, LM Studio, and local models.
8. Add scoped HTTPFlow comparison, authorized web recon, and CTF workflows with audit logs and safety limits.
9. Add background job supervision, durable checkpoints, and restart recovery.
10. Add release/update channels, migration checks, and signed update verification.

## Security model

- Never commit API keys, access tokens, Supabase secrets, or local runtime tokens.
- The local runtime binds to `127.0.0.1` and requires a bearer token.
- Terminal execution is disabled unless the operator explicitly opts in.
- HTTP inspection is limited to HTTPS hostnames explicitly allowlisted by the operator.
- Security research features are for assets you own or are explicitly authorized to test.
- Use a disposable account or VM when running untrusted code; host execution is not a sandbox.

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Requirements: Node.js 22+ and pnpm 9.

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

Run the local runtime separately:

```sh
pnpm --filter @workspace/scripts agent:runtime
```

## Configuration

The web app uses server-side Cloudflare Worker configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

The local runtime uses environment variables documented in [docs/agent-runtime.md](docs/agent-runtime.md). Never put server secrets in the browser bundle or commit real values.

## License

MIT. See [LICENSE](LICENSE).
