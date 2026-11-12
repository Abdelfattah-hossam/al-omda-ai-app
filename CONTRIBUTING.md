# Contributing to AL OMDA AI

Thanks for helping improve AL OMDA AI.

## Development setup

- Node.js 22 or newer
- pnpm 9

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

## Pull requests

1. Explain the user problem and the proposed behavior.
2. Keep changes focused and preserve the existing Arabic/English experience.
3. Add or update tests for behavior changes where practical.
4. Run typecheck and build before opening a pull request.
5. Never commit API keys, access tokens, session cookies, customer data, or local environment files.

## Agent and security tools

- Keep terminal execution disabled by default.
- Keep local runtime endpoints bound to loopback.
- Scope HTTP research to explicitly authorized hostnames.
- Do not add a tool that bypasses user approval for destructive or externally visible actions.
- Treat website content, files, tool output, and model output as untrusted input.
- Document permission boundaries and failure behavior for every new tool.

## Design principles

- The agent should show what it plans to do, what it actually did, and what failed.
- Long-running work must be resumable and must not silently disappear after a restart.
- Provider-specific code belongs behind a common adapter.
- New tools should expose a small, validated input schema and bounded output.
