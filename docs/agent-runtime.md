# Local Agent Runtime (experimental)

The Cloudflare-hosted AL OMDA AI web app cannot safely spawn arbitrary operating-system processes or control a user's desktop. Those capabilities belong in a separate local runtime on the user's own computer. This first runtime is a small, opt-in foundation; it is not yet a complete autonomous agent and is not connected to the chat UI.

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
pnpm --filter @workspace/scripts agent:runtime
```

The runtime listens only on `127.0.0.1:4318`. Every endpoint except `GET /health` requires `Authorization: Bearer <OMDA_AGENT_TOKEN>`. The token must contain at least 32 characters.

## Available endpoints

- `GET /health` — local runtime status.
- `GET /v1/tools` — tool discovery.
- `POST /v1/files/list` — list workspace entries.
- `POST /v1/files/read` — read a UTF-8 workspace file (2 MB maximum).
- `POST /v1/files/write` — write a UTF-8 workspace file (2 MB maximum).
- `POST /v1/sessions/save` and `POST /v1/sessions/load` — persist and restore JSON session state under `.omda/sessions/`.
- `POST /v1/http/request` — make a bounded HTTPS GET, HEAD, or OPTIONS request to an exact allowlisted hostname.
- `POST /v1/terminal/execute` — run an approved executable with an argument array; disabled unless explicitly enabled.

All file paths are relative to the configured workspace. File tools reject paths and symlinks that escape it. HTTP research requires exact hostnames in `OMDA_AGENT_ALLOWED_HOSTS`; private/local DNS results and non-HTTPS targets are rejected. Redirects are revalidated.

## Terminal execution warning

Terminal execution is disabled by default. To opt in, set `OMDA_AGENT_EXECUTION=host`. The first release uses `spawn(..., { shell: false })`, a fixed executable allowlist, a workspace working directory, a timeout, and an output cap. This is **not an operating-system sandbox**: an allowed program or project script can still access anything permitted to your user account. Use a disposable OS account or isolated VM for untrusted code. Never expose this local service to the public internet.

## Not implemented yet

The runtime is the execution foundation only. The following integrations remain planned and must not be considered available yet:

- Chat-connected agent loop with tool selection, approvals, retries, and progress streaming.
- Browser automation and desktop control.
- MCP client/server support and installable Skills.
- Multi-agent delegation and parallel specialist runs.
- LM Studio and other OpenAI-compatible local model adapters.
- Background job supervisor and crash recovery beyond the JSON session store.
- HTTPFlow response comparison for different identities/roles and richer authorized recon workflows.
- Container-backed execution with resource, network, and filesystem isolation.

These capabilities will be added as separately testable modules rather than simulated in the chat interface.
