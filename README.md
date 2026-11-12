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
- Cross-platform terminal child-process environment with Windows system/temp/app-data and desktop session support, while excluding API secrets.
- Automatic parallel delegation to 2–4 read-only specialist agents; the lead Agent synthesizes findings and owns all approved writes.
- Streaming local Agent responses in the main chat and Agents workspace, with a live estimated tokens-per-second indicator and final provider usage when available.
- Parallel read-only delegation to 2–4 specialist agents.
- Opt-in MCP stdio tool discovery and calls, with user approval for MCP actions.
- Direct model-visible MCP function discovery from configured tool schemas, with per-call approval and generic call fallback.
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

## Implemented foundation

- Local Agent runtime integrated with the Agents workspace and regular chat, including authenticated streaming, explicit approval for sensitive actions, saved sessions, resume, and session discovery.
- Local workspace file tools, optional terminal execution, checkpoint persistence, MCP stdio integration, and built-in Skills.
- Optional Playwright browser and desktop Computer Use MCP setup scripts. These connect locally installed companions; they are not hosted browser or remote desktop services.
- Read-only parallel specialist delegation (2–4 agents) with evidence traces. The lead agent retains write and terminal permissions behind the normal approval workflow.
- Optional Bing-compatible web search with bounded results, HTTPS-only provider endpoint, allowlisted host, disabled redirects, timeout, and response-size limits.
- Authorized HTTP role comparison, bounded HTTP inspection, sensitive-header redaction, and DNS/IP safety checks for private IPv4/IPv6 destinations.
- OpenAI-compatible streamed model output, primary/fallback endpoint support, and provider usage metrics when returned by the model.
- Multi-provider model routing through `.omda/models.json`, including HTTPS remote providers, LM Studio/Ollama loopback models, and environment-only API key references.
- Optional local supervisor with crash-restart backoff and safe auto-update checks; updates are deferred for dirty worktrees or active Agent runs and rolled back if the build fails.

## Remaining roadmap

1. Native browser workspace with built-in tab/profile management and per-site permissions beyond the optional Playwright MCP companion.
2. A dedicated desktop companion installer, clear permission controls, secure remote access, and polished cross-platform UX beyond the optional Computer Use MCP integration.
3. Write-capable multi-agent delegation with isolated workspaces, shared task state, and per-agent approval routing.
4. Broader provider adapters and policy-based routing across Gemini, OpenRouter, Anthropic, OpenAI-compatible endpoints, and local model managers.
5. Persistent HTTPFlow history, export, and audit trail; the current Agents workspace already provides visual role/body/header diffs.
6. Provider-accurate live token counts and live tokens-per-second; current UI speed while streaming is an estimate, with actual usage metrics when the provider returns them.
7. Platform service/Task Scheduler installation, signed update verification, and recovery if the supervisor itself exits; the current local supervisor supports opt-in fast-forward updates and runtime crash restarts.
8. Container-backed execution with resource, network, and filesystem isolation.
9. Expanded runtime integration tests, including real local model, browser, desktop, and deployment smoke tests.

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
# Or run the supervisor with crash recovery:
pnpm --filter @workspace/scripts agent:supervisor
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
