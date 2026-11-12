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
export OMDA_AGENT_ALLOWED_HOSTS="example.com"
export OMDA_AGENT_APP_ORIGINS="https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
export OMDA_AGENT_MODEL_BASE_URL="http://127.0.0.1:1234/v1"
export OMDA_AGENT_MODEL_NAME="your-loaded-lm-studio-model-id"
# Optional second OpenAI-compatible endpoint if the primary model fails:
# export OMDA_AGENT_FALLBACK_MODEL_BASE_URL="https://api.example.com/v1"
# export OMDA_AGENT_FALLBACK_MODEL_NAME="free-or-backup-model"
# export OMDA_AGENT_FALLBACK_MODEL_API_KEY="set-in-your-shell-not-in-a-file"
pnpm --filter @workspace/scripts agent:runtime
```

## Start on Windows PowerShell

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:OMDA_AGENT_TOKEN = [Convert]::ToHexString($bytes).ToLower()
$env:OMDA_AGENT_WORKSPACE = "C:\Users\You\Projects\my-project"
$env:OMDA_AGENT_EXECUTION = "disabled"
$env:OMDA_AGENT_ALLOWED_HOSTS = "example.com"
$env:OMDA_AGENT_APP_ORIGINS = "https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
$env:OMDA_AGENT_MODEL_BASE_URL = "http://127.0.0.1:1234/v1"
$env:OMDA_AGENT_MODEL_NAME = "your-loaded-lm-studio-model-id"
# Optional fallback endpoint variables: OMDA_AGENT_FALLBACK_MODEL_BASE_URL, OMDA_AGENT_FALLBACK_MODEL_NAME, OMDA_AGENT_FALLBACK_MODEL_API_KEY
pnpm --filter @workspace/scripts agent:runtime
```

To enable MCP servers, set `OMDA_AGENT_MCP_COMMANDS` to an exact comma-separated allowlist of executable names (for example `node,npx`). Then create `.omda/mcp-servers.json` inside the workspace:

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

Only commands in `OMDA_AGENT_MCP_COMMANDS` can be launched. Environment values are passed only for names explicitly listed in `envFrom`; put secret values in the runtime environment, not the JSON file. MCP calls pause for user approval. HTTP role comparisons also require approval. Configure `.omda/http-roles.json` from `.omda/http-roles.example.json`, and place credential values only in environment variables named by `headersFromEnv`. The local role config is git-ignored. Treat installed MCP servers as trusted local programs.

The model endpoint defaults to LM Studio's OpenAI-compatible API at `http://127.0.0.1:1234/v1`. Set `OMDA_AGENT_MODEL_BASE_URL`, `OMDA_AGENT_MODEL_NAME`, and optionally `OMDA_AGENT_MODEL_API_KEY` for another OpenAI-compatible provider. An optional second endpoint can be configured with `OMDA_AGENT_FALLBACK_MODEL_BASE_URL`, `OMDA_AGENT_FALLBACK_MODEL_NAME`, and `OMDA_AGENT_FALLBACK_MODEL_API_KEY`. The Agents panel displays average generated tokens per second for completed model requests; this is not a live streaming counter. Local models do not require a provider API key.

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
- `POST /v1/http/compare` — compare an allowlisted endpoint across two or more named roles configured in `.omda/http-roles.json`.
- `POST /v1/agent/run` — start a tool-using run with `{ "goal": "..." }`.
- `POST /v1/agent/delegate` — run 2–4 concurrent read-only specialists with `{ "tasks": [{ "role": "Code reviewer", "goal": "..." }, { "role": "Security reviewer", "goal": "..." }] }`.
- `GET /v1/mcp/servers` and `GET /v1/mcp/tools` — inspect configured MCP servers and their advertised tools.
- `POST /v1/agent/continue` — resume a paused run with `{ "sessionId": "...", "approvedCallIds": ["..."] }`. Omitted pending call IDs are denied.
- `POST /v1/agent/resume` — restore a checkpointed session after restarting the local runtime.
- `GET /v1/agent/sessions` — list up to 100 saved Agent sessions with their last user request and pending-approval status.
- `POST /v1/files/list` — list workspace entries.
- `POST /v1/files/read` — read a UTF-8 workspace file (2 MB maximum).
- `POST /v1/files/write` — write a UTF-8 workspace file (2 MB maximum).
- `POST /v1/sessions/save` and `POST /v1/sessions/load` — persist and restore JSON session state under `.omda/sessions/`.
- `POST /v1/http/request` — make a bounded HTTPS GET, HEAD, or OPTIONS request to an exact allowlisted hostname.
- `POST /v1/terminal/execute` — run an approved executable with an argument array; disabled unless explicitly enabled.

All file paths are relative to the configured workspace. File tools reject paths and symlinks that escape it. HTTP research requires exact hostnames in `OMDA_AGENT_ALLOWED_HOSTS`. Private/local DNS results and non-HTTPS targets are rejected by default. `OMDA_AGENT_ALLOW_LOCAL_LAB_TARGETS=true` is an explicit exception for isolated local CTF labs; exact allowlisting is still required. Redirects are revalidated.

## Local CTF lab mode

Keep local targets disabled for normal browsing and bug-bounty work. Only when running an isolated local challenge, set the exact lab hosts and explicitly enable HTTP/private-address access:

```sh
export OMDA_AGENT_ALLOWED_HOSTS="127.0.0.1,localhost"
export OMDA_AGENT_ALLOW_LOCAL_LAB_TARGETS="true"
```

Do not add broad private-network ranges or enable this mode when testing ordinary public targets.

## Terminal execution warning

Terminal execution is disabled by default. To opt in, set `OMDA_AGENT_EXECUTION=host`. The first release uses `spawn(..., { shell: false })`, a fixed executable allowlist, a workspace working directory, a timeout, and an output cap. This is **not an operating-system sandbox**: an allowed program or project script can still access anything permitted to your user account. Use a disposable OS account or isolated VM for untrusted code. Never expose this local service to the public internet.

## Not implemented yet

The following are still planned and must not be considered available:

- Native browser automation and desktop control. A trusted browser MCP server can be connected as an interim integration.
- Write-capable multi-agent delegation with isolated workspaces and shared task state; current parallel specialists are read-only.
- Live streaming token output and real-time tokens-per-second display.
- HTTPFlow history and visual response-diff interface; the runtime comparison endpoint currently returns role-by-role status, headers, and bounded response bodies.
- Automatic model fallback across providers when a local model or free provider is unavailable.
- Background daemon/service installation, automatic app updates, and crash recovery beyond saved JSON agent sessions.
- Container-backed execution with resource, network, and filesystem isolation.

These capabilities will be added as separately testable modules rather than simulated in the chat interface.
