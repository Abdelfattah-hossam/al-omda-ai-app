# Local Agent Runtime (experimental)

The Cloudflare-hosted AL OMDA AI web app cannot safely spawn arbitrary operating-system processes or control a user's desktop. Those capabilities belong in a separate local runtime on the user's own computer. This runtime is an opt-in execution companion. It is available from both the Agents workspace controls and the regular chat's Local Agent mode; hosted chat remains the default when Local Agent mode is off.

## Requirements

- Node.js 22+
- pnpm 9
- A local project folder to use as the agent workspace

## Start on macOS/Linux

```sh
export OMDA_AGENT_TOKEN="$(openssl rand -hex 32)"
export OMDA_AGENT_WORKSPACE="$HOME/projects/my-project"
export OMDA_AGENT_EXECUTION="disabled"
export OMDA_AGENT_ALLOWED_HOSTS="example.com,search-provider.example"
# Optional Bing-compatible Search API (the endpoint host must be in the allowlist above):
# export OMDA_AGENT_SEARCH_BASE_URL="https://search-provider.example/v7.0/search"
# export OMDA_AGENT_SEARCH_API_KEY="keep-this-secret-in-your-shell"
export OMDA_AGENT_APP_ORIGINS="https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
export OMDA_AGENT_MODEL_BASE_URL="http://127.0.0.1:1234/v1"
export OMDA_AGENT_MODEL_NAME="your-loaded-lm-studio-model-id"
# Optional second OpenAI-compatible endpoint if the primary model fails:
# export OMDA_AGENT_FALLBACK_MODEL_BASE_URL="https://api.example.com/v1"
# export OMDA_AGENT_FALLBACK_MODEL_NAME="free-or-backup-model"
# export OMDA_AGENT_FALLBACK_MODEL_API_KEY="set-in-your-shell-not-in-a-file"
pnpm --filter @workspace/scripts agent:runtime
```

The local runtime applies an exact browser-origin allowlist for CORS and browser Private Network Access preflights. Configure only the deployed app origin and local development origins you actually use. Wildcards, `null`, path-bearing URLs, credentialed URLs, and non-HTTPS remote origins are ignored rather than broadening the allowlist. Local HTTP origins are accepted only for loopback development (`localhost`, `127.0.0.1`, or `::1`).

## Start on Windows PowerShell

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:OMDA_AGENT_TOKEN = [Convert]::ToHexString($bytes).ToLower()
$env:OMDA_AGENT_WORKSPACE = "C:\Users\You\Projects\my-project"
$env:OMDA_AGENT_EXECUTION = "disabled"
$env:OMDA_AGENT_ALLOWED_HOSTS = "example.com,search-provider.example"
# Optional Bing-compatible Search API (the endpoint host must be allowlisted above):
# $env:OMDA_AGENT_SEARCH_BASE_URL = "https://search-provider.example/v7.0/search"
# $env:OMDA_AGENT_SEARCH_API_KEY = "keep-this-secret-in-your-shell"
$env:OMDA_AGENT_APP_ORIGINS = "https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
$env:OMDA_AGENT_MODEL_BASE_URL = "http://127.0.0.1:1234/v1"
$env:OMDA_AGENT_MODEL_NAME = "your-loaded-lm-studio-model-id"
# Optional fallback endpoint variables: OMDA_AGENT_FALLBACK_MODEL_BASE_URL, OMDA_AGENT_FALLBACK_MODEL_NAME, OMDA_AGENT_FALLBACK_MODEL_API_KEY
pnpm --filter @workspace/scripts agent:runtime
```

To enable MCP servers, set `OMDA_AGENT_MCP_COMMANDS` to an exact comma-separated allowlist of executable names (for example `node,npx`).

### Web search (Bing-compatible API)

Set `OMDA_AGENT_SEARCH_BASE_URL` to the provider's HTTPS search endpoint and add only that endpoint hostname to `OMDA_AGENT_ALLOWED_HOSTS`. If the provider uses the standard Bing Web Search authentication header, set `OMDA_AGENT_SEARCH_API_KEY`; the key is read only by the local runtime and is never included in model prompts or tool output.

The agent exposes `web.search` to the lead agent and read-only specialists. It accepts `query`, optional `count` (clamped to 1–10), optional locale `market` (for example `en-US`), and `safeSearch` (`Strict` by default). Results are normalized to title, URL, snippet, and optional publication date.

Security controls: HTTPS only, exact hostname allowlisting, DNS checks that reject private/local resolutions, redirects disabled, 12-second timeout, 150 KB response cap, and at most 10 returned results. For authorized HTTP role comparisons, credential-like request headers are accepted only from the local role configuration, and authenticated requests fail closed on cross-origin redirects so role credentials cannot be forwarded to another allowlisted host. The provider must implement the Bing Web Search response shape (`webPages.value`) or the documented compatible `results`/`value` arrays. Other provider-specific authentication headers are not inferred; use a compatible gateway that accepts the standard Bing subscription header or adapt the local integration deliberately.


### Local CTF analysis helpers

The Agent has bounded local tools for Base64/Base64URL, hex, URL, ROT13, Caesar, binary, HTML-entity, and Unicode decoding; all Caesar shifts; common hash-format identification; and JWT header/payload decoding. These helpers process only the supplied text and do not perform network calls, password cracking, or signature verification. Hash identification is heuristic, and JWT output is explicitly marked unverified.

### Passive Web Recon and security research

The Agent includes read-only tools for DNS A/AAAA/CNAME/MX/NS/TXT lookups, validated TLS certificate inspection, common HTTP security-header analysis, and `robots.txt` retrieval. Each hostname/URL must be explicitly allowlisted. DNS results containing private or reserved addresses are rejected by default; TLS inspection pins the connection to a validated resolved address and verifies the certificate. HTTP checks remain bounded and use the existing request allowlist.

These are passive reconnaissance and configuration-review helpers for authorized bug bounty and lab work. They do not perform port scanning, brute-force discovery, exploitation, or out-of-scope testing. The user remains responsible for confirming program scope and authorization before adding a target to the allowlist.

### Dynamic MCP tool discovery

The runtime advertises configured MCP tools directly to the model as function tools when their input schemas are valid and within size limits. This lets the Agent choose a specific browser or desktop action without a separate discovery round-trip. Every direct MCP tool call still pauses for explicit user approval; the generic `mcp.call_tool` remains available as a fallback. MCP servers are local programs, so configure only servers you trust.

### Browser automation through Playwright MCP

A setup helper creates or updates the Playwright MCP entry without deleting other MCP servers already configured in your workspace.

From the repository root, run one of:

```sh
pnpm --filter @workspace/scripts browser:setup -- chromium
pnpm --filter @workspace/scripts browser:setup -- firefox
pnpm --filter @workspace/scripts browser:setup -- webkit
```

The command writes `.omda/mcp-servers.json` under `OMDA_AGENT_WORKSPACE` (or the current directory when that variable is unset). It refuses to overwrite malformed JSON. The browser MCP package is fetched by `npx` on first launch; install the matching Playwright browser runtime if prompted.

Add `npx` to the exact executable allowlist in `OMDA_AGENT_MCP_COMMANDS` (for example `node,npx`, preserving any other MCP executables you already use), restart the local Agent runtime, and ask it to list MCP tools. Browser actions then run on the computer hosting the runtime, not inside the Cloudflare Worker. MCP tool calls require explicit approval. Use a dedicated browser profile and only access accounts and sites you own or are authorized to test. Do not place credentials in browser URLs or prompts.

### Install the desktop companion as a user service

The optional service installer can start the local Agent supervisor automatically when the current user signs in. It does not install a graphical desktop app and it does not enable terminal execution.

From the repository root:

```sh
pnpm --filter @workspace/scripts desktop:service -- install
pnpm --filter @workspace/scripts desktop:service -- status
pnpm --filter @workspace/scripts desktop:service -- restart
pnpm --filter @workspace/scripts desktop:service -- uninstall
```

Supported targets are Linux user-level systemd, macOS LaunchAgents, and Windows Task Scheduler (current user). The installer generates a 256-bit local bearer token if one does not already exist and stores it in a private per-user environment file. The workspace is set to the current repository; execution remains disabled by default. Uninstall removes the auto-start entry but intentionally preserves the token and environment file. On Linux and macOS, the service definition contains a private copy of the environment values, so rerun the install command after editing the environment file; on Windows the launcher reads the file at each sign-in, and the installer restricts the token file ACL to the current account and SYSTEM. Review the generated service and environment file before enabling this on a shared computer. This setup has not yet been validated on physical Windows/macOS/Linux devices in CI.

### Browser Workspace site permissions

When the local runtime is connected in the Agents workspace, open **Browser Workspace** and select **Refresh** to inspect the configured `playwright-browser` MCP server and its advertised tools. Add exact hostnames such as `docs.example.com` (not full URLs, wildcard domains, ports, or paths) to allow direct browser-tool URLs for those hosts. Remove a hostname to block subsequent direct URL calls to it. The policy is stored in `.omda/browser-workspace.json` inside the local workspace with restrictive file permissions.

The policy is deny-by-default: direct browser-tool navigation requires an explicit URL and an exact approved hostname; browser actions are blocked until at least one hostname is approved. MCP tool calls still require their normal per-action approval. This is an additional guardrail, not a complete network sandbox: a page may navigate through its own links or scripts, and this hostname check does not replace operating-system/network isolation. Use a dedicated browser profile, avoid sensitive sessions, and approve only sites you are authorized to access. Browser profile switching, tab thumbnails, and cross-device browser streaming are not implemented by this workspace yet.

### Multiple remote and local model providers

The runtime tries providers in this order: the primary environment configuration, providers listed in `.omda/models.json`, then the optional fallback environment configuration. All providers use the OpenAI-compatible Chat Completions streaming interface. Configure no more than eight additional providers.

Copy `.omda/models.example.json` to `.omda/models.json`. Each entry contains a display `name`, an OpenAI-compatible `baseUrl`, a `model`, and optionally an `apiKeyEnv` variable name. The file stores only the environment variable name, never the secret. If a named key is not set, that provider is skipped. Remote providers must use HTTPS; plain HTTP is accepted only for loopback endpoints such as LM Studio or Ollama on `127.0.0.1` or `localhost`. Credentials, URL query strings, and fragments are rejected.

The Agents workspace **Model Router** panel lists configured provider names, models, local/remote type, and whether a key is available without exposing the key or full endpoint URL. The runtime tries the next provider when a request fails before any output is streamed; it does not silently switch after partial output has already reached the user.

### Local supervisor, crash restart, and safe auto-update

For a supervised local runtime, start:

```sh
pnpm --filter @workspace/scripts agent:supervisor
```

The supervisor restarts the local Agent runtime after an unexpected exit using bounded backoff. To enable automatic source updates, explicitly set `OMDA_AGENT_AUTO_UPDATE=true`; the default is off. The check interval is controlled by `OMDA_AGENT_UPDATE_INTERVAL_HOURS` (1–168, default 24).

Before updating, it requires the runtime to be idle, the checkout to be on a clean `main` branch with no local commits ahead, and `origin` to be an HTTPS GitHub remote. It fetches `origin/main`, fast-forwards only, runs `pnpm install --frozen-lockfile` and `pnpm build`, and rolls back to the previous commit if installation or build fails. It defers rather than overwriting local edits or interrupting an active Agent task.

The supervisor updates the local Git checkout and restarts the local runtime; it does **not** deploy the Cloudflare website. Keep the supervisor process running. Closing its terminal stops supervision; a platform-specific user service/Task Scheduler installer is still a future improvement. Use a dedicated checkout and review your Git remote before enabling automatic updates.

### Parallel specialist agents

The main Agent can call `agent.delegate` to split a complex request into 2–4 independent specialist investigations. They run concurrently and can read workspace files, use Skills, inspect allowlisted HTTPS targets, and use the configured web search. Specialists are deliberately read-only: they cannot write files, execute terminal commands, or call arbitrary MCP tools. The lead Agent combines their evidence and performs any required changes through its normal approval gate. The Agents workspace also exposes a manual two-specialist delegation form with live progress.

The current browser bridge is Playwright MCP over local stdio. It provides browser control through the MCP tools; it is not yet a native browser panel with integrated tab thumbnails, profile management, or cross-device remote control.

### Desktop control through Computer Use MCP

The optional desktop companion uses the MIT-licensed `@zavora-ai/computer-use-mcp` MCP server for native app discovery, screenshots, accessibility controls, mouse, keyboard, clipboard, window targeting, and app scripting on supported Windows, macOS, and Linux desktops.

From the repository root, run:

```sh
pnpm --filter @workspace/scripts desktop:setup
```

This adds or updates only the `computer-use` entry in `.omda/mcp-servers.json` and preserves the other configured servers. Add `npx` to `OMDA_AGENT_MCP_COMMANDS` (preserving any other allowed commands), then restart the local runtime. The first launch fetches the package and its platform-specific native module; do not disable optional npm dependencies.

Before use:
- Windows: run in a signed-in interactive desktop session. Elevated/protected windows may require matching privileges.
- macOS: grant the launching host app the Accessibility and Screen Recording permissions requested by macOS. Input Monitoring may be needed for user-activity detection.
- Linux: use a supported X11/Wayland session and install the platform prerequisites requested by the server.

Screenshot/image results are forwarded as bounded image inputs to the configured model. Use a vision-capable model for visual desktop tasks; text-only models can still use the companion's accessibility and text tools where available.

All desktop MCP calls pass through the AL OMDA runtime's explicit per-call approval gate. The desktop server also provides its own user-active pause/stop safeguards on supported platforms; use its documented emergency stop shortcut `Ctrl+Alt+Escape`. Do not expose its optional HTTP console endpoint to a network: the stdio MCP mode is the configured integration. Desktop actions can affect real applications and files, so use a dedicated, signed-in workstation and supervise the session.

This integration is a local MCP companion, not yet a native AL OMDA desktop app or background service.

```json
{
  "servers": [
    {
      "name": "project-tools",
      "command": "node",
      "args": ["./tools/mcp-server.js"],
      "envFrom": ["PROJECT_MCP_TOKEN"]
    }
  ]
}
```

Only commands in `OMDA_AGENT_MCP_COMMANDS` can be launched. Environment values are passed only for names explicitly listed in `envFrom`; put secret values in the runtime environment, not the JSON file. MCP calls pause for user approval. HTTP role comparisons also require approval. Configure `.omda/http-roles.json` from `.omda/http-roles.example.json`, and place credential values only in environment variables named by `headersFromEnv`. The local role config is git-ignored. The Agents workspace HTTPFlow panel loads only role names, lets you compare selected roles, and displays status, body length, first body difference, and differing response headers. Authentication/session-related response headers are redacted before returning results. Comparison remains limited to GET, HEAD, and OPTIONS. Treat installed MCP servers as trusted local programs.

The model endpoint defaults to LM Studio's OpenAI-compatible API at `http://127.0.0.1:1234/v1`. Set `OMDA_AGENT_MODEL_BASE_URL`, `OMDA_AGENT_MODEL_NAME`, and optionally `OMDA_AGENT_MODEL_API_KEY` for another OpenAI-compatible provider. An optional second endpoint can be configured with `OMDA_AGENT_FALLBACK_MODEL_BASE_URL`, `OMDA_AGENT_FALLBACK_MODEL_NAME`, and `OMDA_AGENT_FALLBACK_MODEL_API_KEY`. The chat and Agents workspace now display streamed text and an approximate live tokens-per-second rate (estimated from streamed characters). When the model provider includes usage in its stream, the completed request also reports its average generated tokens per second. The live estimate is approximate, not provider-token accounting. Local models do not require a provider API key.

### Use the local Agent from the main chat

1. Start the runtime on the same computer that contains the project workspace.
2. Set `OMDA_AGENT_APP_ORIGINS` to the exact origin of the deployed AL OMDA app (the default deployment origin is shown below); do not use a wildcard.
3. Open AL OMDA AI on that same computer, open Chat, enable **Local Agent mode**, enter `http://127.0.0.1:4318`, and paste the runtime token.
4. Send a task. The local Agent can inspect the configured workspace and use its enabled tools. File writes, terminal commands, MCP calls, and authenticated HTTP role comparisons pause for explicit approval in the chat.
5. The chat remembers the last Agent session ID in this browser so a later message can resume it. The secret token remains only in page memory and must be entered again after a reload.

This browser bridge is intentionally local-first: a browser on a phone talks to the phone's own loopback address, not the desktop running the runtime. To use a desktop workspace from a phone or another device, a separately authenticated and encrypted remote companion/tunnel is still required. Image attachments are currently handled by hosted chat, not local Agent mode.

The runtime listens only on `127.0.0.1:4318`. For browser access, set `OMDA_AGENT_APP_ORIGINS` to an exact comma-separated list of trusted AL OMDA app origins; no wildcard is supported. Command-line clients do not need an Origin header. Every endpoint except `GET /health` requires `Authorization: Bearer <OMDA_AGENT_TOKEN>`. The token must contain at least 32 characters.

## Available endpoints

- `GET /health` — local runtime status.
- `GET /v1/tools` — tool discovery, including available Skills.
- `GET /v1/http/roles` — list configured role names without exposing credential environment variables.
- `POST /v1/http/compare` — compare an allowlisted endpoint across two or more named roles configured in `.omda/http-roles.json`; save a sanitized audit summary.
- `GET /v1/http/history?limit=100` — list up to 100 saved HTTPFlow audit summaries.
- `DELETE /v1/http/history` — clear the saved HTTPFlow audit history.
- `POST /v1/agent/run` — start a tool-using run with `{ "goal": "..." }`.
- `POST /v1/agent/stream` — stream `token`, `status`, `complete`, and `error` events for `{ "action": "run|resume|continue|delegate", ... }`; the existing JSON endpoints remain available for compatibility.
- `POST /v1/agent/delegate` — run 2–4 concurrent read-only specialists with `{ "tasks": [{ "role": "Code reviewer", "goal": "..." }, { "role": "Security reviewer", "goal": "..." }] }`.
- `GET /v1/mcp/servers` and `GET /v1/mcp/tools` — inspect configured MCP servers and their advertised tools.
- `POST /v1/agent/continue` — resume a paused run with `{ "sessionId": "...", "approvedCallIds": ["..."] }`. Omitted pending call IDs are denied.
- `POST /v1/agent/resume` — restore a checkpointed session after restarting the local runtime.
- `GET /v1/agent/sessions` — list up to 100 saved Agent sessions with their last user request and pending-approval status.
- `GET /v1/runtime/status` — authenticated active-run count used by the supervisor to defer updates while work is in progress.
- `POST /v1/files/list` — list workspace entries.
- `POST /v1/files/read` — read a UTF-8 workspace file (2 MB maximum).
- `POST /v1/files/write` — write a UTF-8 workspace file (2 MB maximum).
- `POST /v1/sessions/save` and `POST /v1/sessions/load` — persist and restore JSON session state under `.omda/sessions/`.
- `web.search` agent tool — query a configured Bing-compatible Search API over HTTPS; the endpoint hostname must be allowlisted and the API key remains in the local runtime environment.
- `POST /v1/http/request` — make a bounded HTTPS GET, HEAD, or OPTIONS request to an exact allowlisted hostname.
- `POST /v1/terminal/execute` — run an approved executable with an argument array; disabled unless explicitly enabled.

HTTPFlow audit summaries are stored in `.omda/httpflow-history.json` inside the configured workspace, capped at 100 records, and written with restrictive permissions and atomic replacement. They retain the target origin/path, method, role names, status codes, timings, body lengths, and names of changed headers; URL query strings/fragments, response bodies, and header values are not persisted. The Agents workspace can export the summaries as JSON or clear them. All history endpoints require the bearer token.

All file paths are relative to the configured workspace. File tools reject paths and symlinks that escape it. HTTP research requires exact hostnames in `OMDA_AGENT_ALLOWED_HOSTS`. Private/local DNS results and non-HTTPS targets are rejected by default. `OMDA_AGENT_ALLOW_LOCAL_LAB_TARGETS=true` is an explicit exception for isolated local CTF labs; exact allowlisting is still required. Redirects are revalidated.

## Local CTF lab mode

Keep local targets disabled for normal browsing and bug-bounty work. Only when running an isolated local challenge, set the exact lab hosts and explicitly enable HTTP/private-address access:

```sh
export OMDA_AGENT_ALLOWED_HOSTS="127.0.0.1,localhost"
export OMDA_AGENT_ALLOW_LOCAL_LAB_TARGETS="true"
```

Do not add broad private-network ranges or enable this mode when testing ordinary public targets.

## Terminal execution warning

Terminal execution is disabled by default. To opt in, set `OMDA_AGENT_EXECUTION=host`. The runtime uses `spawn(..., { shell: false })`, a fixed executable allowlist, a workspace working directory, a timeout, and an output cap. Its child-process environment preserves the Windows `SYSTEMROOT`, `COMSPEC`, `PATHEXT`, user temp/app-data paths, and supported desktop session variables while excluding API keys and arbitrary `NODE_OPTIONS`. This is **not an operating-system sandbox**: an allowed program or project script can still access anything permitted to your user account. Use a disposable OS account or isolated VM for untrusted code. Never expose this local service to the public internet.

## Current limitations

The following are not yet built into the AL OMDA web app itself:

- Native browser/desktop panels, built-in browser profile and tab management, and remote cross-device desktop control. Optional Playwright and Computer Use MCP companions can provide local integrations when installed and configured.
- Write-capable multi-agent delegation with isolated workspaces and shared task state; current parallel specialists run concurrently with read-only tools and return evidence traces. The lead agent retains the normal approval workflow for changes.
- Provider-accurate live token counts and exact real-time tokens-per-second. Model text is streamed live; the chat's speed display is an estimate while generating, while actual provider usage metrics are reported after completion when available.
- Persistent HTTPFlow comparison history and export; the Agents workspace now has a visual role/body/header diff, while the runtime comparison endpoint returns bounded role-by-role responses.
- Broad automatic model routing across multiple providers. The current optional fallback is a second OpenAI-compatible endpoint.
- Background daemon/service installation, automatic app updates, and crash recovery beyond saved JSON agent sessions.
- Container-backed execution with resource, network, and filesystem isolation.

These capabilities will be added as separately testable modules rather than simulated in the chat interface.
