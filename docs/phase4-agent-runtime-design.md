# Phase 4 design sketch — AL OMDA agent runtime (register section 8)

Status: historical design, superseded by the implemented local runtime.
Updated 2026-11-22. See `agent-runtime.md` for current setup, security boundaries,
tool approvals, MCP, specialist skills and supervisor behavior. The original
sketch below is retained as design history, not a current feature-status report.

Current verification: the local runtime/supervisor integration suite passed
36 tests on 2026-11-22 using actual local processes and HTTP endpoints with
controlled model and MCP fixtures. This is not production-model acceptance or
a test on the owner's computer. The hosted web app does not run arbitrary
operating-system commands or silently control a physical device.

## Historical sketch

## What exists today (do not rebuild)

- Gated plan flow: plan task (status "review") with steps; each step is
  approved by the user before execution; out-of-order execution returns 409.
- Artifact fast-path: chat file requests create an approved artifact task and
  deliver the file immediately (kept consistent by the Phase 2 fix).
- Task registry + workspace assets with cascading deletes.
- "Local Agent mode" UI shell: runtime URL + token inputs, session save via
  /api/agent/* routes, test-connection and saved-sessions flows. The bridge
  protocol to a user-machine runtime is stubbed but the UI contract exists.
- Provider failover lib with per-task model policy (ai-model-policy.ts,
  provider-failover.ts) — the natural home for per-agent model choice.

## Register requirements (section 8) mapped to design decisions

1. Real Agent Runtime + actual execution (8.1-8.3): a supervised executor
   that runs code, commands and tests — not text generation. Two tiers:
   - Cloud tier: sandboxed execution in the Worker is not possible; use a
     per-task isolated micro-sandbox (free option: Cloudflare Workers
     isolate-per-request + restricted tool set; heavier option: user-hosted
     executor). Decision deferred — cost and abuse analysis needed first.
   - Device tier: the existing Local Agent mode bridge — the runtime runs on
     the user's computer and executes with local tools after approval.
2. Tools: web, files, terminal, HTTP (8.4): a typed tool registry shared by
   both tiers; every tool declares risk class (read / write / external /
   destructive) which drives the approval gate.
3. MCP (8.5, 8.15): the tool registry speaks MCP so external MCP servers can
   be attached per task; device tier hosts the MCP client.
4. Skills (8.6): versioned skill packs (prompt + tool allowlist + output
   contract) stored in the repo, loaded per task specialty.
5. Supervisor + parallel agents (8.7-8.9, 8.16, 8.18): one supervisor per
   project decomposes the approved plan into step tasks, assigns them to
   specialist agents (existing specialties), runs independent steps in
   parallel with a concurrency cap, and serializes steps that share state.
6. Planning (8.10): reuse the current plan schema; supervisor consumes only
   user-approved plans.
7. Tool Approval (8.11, 8.17): risk-classed approvals — reads auto-approve,
   writes/external/destructive require explicit user approval in the task
   plan UI; approvals are per-action with recorded decisions.
8. Pre-execution disclosure (8.12): before each gated action the UI shows the
   exact tool, inputs and blast radius in Arabic.
9. Execution logging (8.13): append-only per-task execution log (tool, input
   hash, result, duration) surfaced in the task timeline; feeds the existing
   audit log page.

## Constraints from the register

- Free solutions first (10.10): prefer the device tier and free quotas.
- Keep all existing functions (10.7): Phase 4 adds; it must not change chat
  scroll/movement or the current plan/approval UX.
- Test-gated phases (10.4): each tier ships behind its own CI tests and a
  live verification pass.

## Proposed build order

1. Execution log + disclosure UI (foundation for trust).
2. Device-tier runtime protocol completion (the bridge is already stubbed).
3. Tool registry + risk classes + approval gate.
4. Supervisor with sequential execution; parallelism last.
5. MCP attach after the registry is stable.

## Open questions for the owner

- Cloud-tier execution: acceptable to stay device-only at first? (free)
- Which external MCP servers, if any, does he actually use?
