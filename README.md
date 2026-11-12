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
- Automatic parallel delegation to 2–4 read-only specialist agents; the lead Agent synthesizes findings and owns all approved writes.
- Streaming local Agent responses in the main chat and Agents workspace, with a live estimated tokens-per-second indicator and final provider usage when available.
- Parallel read-only delegation to 2–4 specialist agents.
- Opt-in MCP stdio tool discovery and calls, with user approval for MCP actions.
- One-command Playwright MCP setup for Chromium, Firefox, or WebKit, preserving other configured MCP servers.
- Optional native desktop control through the MIT-licensed Computer Use MCP companion (screen, accessibility, mouse, keyboard, clipboard, and app/window tools), gated by local Agent MCP approvals.
- Authorized HTTP role comparison using credentials loaded from local environment variables, plus explicit local CTF lab mode.
- HTTPFlow panel for comparing configured roles with status/body/header differences and sensitive response-header redaction.
- Optional Bing-compatible web search with HTTPS-only endpoint validation, exact hostname allowlisting, bounded results, and API keys kept in the local runtime environment.
- OpenAI-compatible local model endpoints such as LM Studio (no provider API key required when running locally), optional fallback model endpoint, and average tokens-per-second reporting.
- Resumable JSON session storage, including a UI action to restore the last saved local-agent session after restarting the runtime.
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

The following are future goals, not claims of existing functionality:

1. Extend the basic Local Agent integration in regular chat (task submission, explicit approvals, saved-session resume/listing) with retries, cancellation, and durable job status.
2. Add native browser automation for Chromium/Firefox with explicit per-site permissions and tab management; MCP browser servers are the interim route.
3. Add desktop control through a separately installed, permissioned companion.
4. Expand MCP beyond local stdio transport with remote transports, server lifecycle management, and a safer install/update experience.
5. Add write-capable specialist delegation with isolated workspaces, shared task state, and per-agent approval routing.
6. Expand provider adapters and routing across Gemini, OpenRouter, Anthropic, OpenAI-compatible endpoints, LM Studio, and other local models.
7. Add richer HTTPFlow history and visual response diffs, plus additional authorized recon workflows with explicit scope and audit logs.
8. Add provider-accurate live token accounting and real-time generation speed; the current UI shows a character-based live estimate.
9. Add background job supervision, service installation, automatic updates, and stronger crash recovery.
10. Add container-backed execution with resource, network, and filesystem isolation.

## Security model

- Never commit API keys, access tokens, Supabase secrets, or local runtime tokens.
- The local runtime binds to `127.0.0.1` and requires a bearer token.
- Terminal execution is disabled unless the operator explicitly opts in.
- HTTP inspection is limited to explicitly allowlisted hostnames; HTTP/private targets require a separate local-CTF opt-in.
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
