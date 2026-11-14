import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

const runtimePath = join(dirname(fileURLToPath(import.meta.url)), "agent-runtime.ts");
const allowedOrigin = "http://127.0.0.1:3000";
const token = "test-token-that-is-long-enough-for-runtime-authentication-0123456789";

type RuntimeHandle = {
  child: ChildProcess;
  baseUrl: string;
  workspace: string;
  stderr: string;
};

let runtime: RuntimeHandle;

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startRuntime(extraEnv: NodeJS.ProcessEnv = {}): Promise<RuntimeHandle> {
  const workspace = typeof extraEnv.OMDA_AGENT_WORKSPACE === "string"
    ? extraEnv.OMDA_AGENT_WORKSPACE
    : await mkdtemp(join(tmpdir(), "omda-agent-runtime-test-"));
  const port = await reservePort();
  const child = spawn(process.execPath, ["--import", "tsx", runtimePath], {
    cwd: dirname(dirname(runtimePath)),
    env: {
      ...process.env,
      OMDA_AGENT_TOKEN: token,
      OMDA_AGENT_PORT: String(port),
      OMDA_AGENT_WORKSPACE: workspace,
      OMDA_AGENT_EXECUTION: "disabled",
      OMDA_AGENT_APP_ORIGINS: allowedOrigin,
      OMDA_AGENT_ALLOWED_HOSTS: "",
      OMDA_AGENT_MCP_COMMANDS: "",
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const handle: RuntimeHandle = { child, baseUrl: `http://127.0.0.1:${port}`, workspace, stderr: "" };
  child.stderr?.on("data", (chunk: Buffer) => {
    handle.stderr = (handle.stderr + chunk.toString("utf8")).slice(-4000);
  });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await rm(workspace, { recursive: true, force: true });
      throw new Error("Agent runtime exited during startup: " + handle.stderr);
    }
    try {
      const response = await fetch(handle.baseUrl + "/health", { signal: AbortSignal.timeout(500) });
      if (response.ok) return handle;
    } catch {
      // The local runtime may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGKILL");
  await rm(workspace, { recursive: true, force: true });
  throw new Error("Agent runtime did not become healthy: " + handle.stderr);
}

async function stopRuntime(handle: RuntimeHandle): Promise<void> {
  if (handle.child.exitCode === null) {
    handle.child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => handle.child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
  }
  await rm(handle.workspace, { recursive: true, force: true });
}

async function writeFileForMcp(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(runtime.baseUrl + path, options);
}

async function post(path: string, body: unknown, authenticated = true): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("local Agent runtime HTTP integration", () => {
  before(async () => {
    runtime = await startRuntime();
  });

  after(async () => {
    await stopRuntime(runtime);
  });

  test("exposes only the health probe without a bearer token", async () => {
    const health = await request("/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok: boolean }).ok, true);

    const protectedStatus = await request("/v1/runtime/status");
    assert.equal(protectedStatus.status, 401);
  });

  test("accepts a valid bearer token for protected runtime status", async () => {
    const response = await request("/v1/runtime/status", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { activeRuns: number }).activeRuns, 0);
  });

  test("reads and writes files inside the configured workspace", async () => {
    const write = await post("/v1/files/write", { path: "nested/example.txt", content: "safe workspace content" });
    assert.equal(write.status, 200);
    assert.equal((await readFile(join(runtime.workspace, "nested", "example.txt"), "utf8")), "safe workspace content");

    const read = await post("/v1/files/read", { path: "nested/example.txt" });
    assert.equal(read.status, 200);
    assert.equal((await read.json() as { content: string }).content, "safe workspace content");
  });

  test("rejects parent traversal and symlink escapes", async () => {
    const traversal = await post("/v1/files/read", { path: "../outside.txt" });
    assert.equal(traversal.status, 400);

    const outside = await mkdtemp(join(tmpdir(), "omda-agent-outside-test-"));
    try {
      await symlink(outside, join(runtime.workspace, "escape"), "dir");
      const escapedWrite = await post("/v1/files/write", { path: "escape/should-not-exist.txt", content: "nope" });
      assert.equal(escapedWrite.status, 400);
      await assert.rejects(readFile(join(outside, "should-not-exist.txt"), "utf8"));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("enforces the exact browser origin allowlist and permits authenticated history deletion preflight", async () => {
    const allowed = await request("/v1/runtime/status", {
      method: "OPTIONS",
      headers: { origin: allowedOrigin, "access-control-request-private-network": "true", "access-control-request-method": "DELETE" },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(allowed.headers.get("access-control-allow-private-network"), "true");
    assert.match(allowed.headers.get("access-control-allow-methods") || "", /DELETE/);

    const denied = await request("/v1/runtime/status", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    });
    assert.equal(denied.status, 403);
  });

  test("persists sanitized HTTPFlow comparisons and supports authenticated history export and clearing", async () => {
    const target = createHttpServer((req, res) => {
      const role = String(req.headers["x-role"] || "anonymous");
      res.writeHead(200, { "content-type": "application/json", "x-audit-value": role });
      res.end(JSON.stringify({ privateResponse: "private-response-" + role }));
    });
    await new Promise<void>((resolve, reject) => {
      target.once("error", reject);
      target.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (target.address() as AddressInfo).port;
    const historyRuntime = await startRuntime({
      OMDA_AGENT_ALLOWED_HOSTS: "127.0.0.1",
      OMDA_AGENT_ALLOW_LOCAL_LAB_TARGETS: "true",
      OMDA_TEST_ADMIN_ROLE: "admin-secret-value",
    });
    try {
      await mkdir(join(historyRuntime.workspace, ".omda"), { recursive: true });
      await writeFile(join(historyRuntime.workspace, ".omda", "http-roles.json"), JSON.stringify({
        roles: [
          { name: "anonymous" },
          { name: "admin", headersFromEnv: { "x-role": "OMDA_TEST_ADMIN_ROLE" } },
        ],
      }), "utf8");

      const comparison = await fetch(historyRuntime.baseUrl + "/v1/http/compare", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:" + port + "/private?access_token=query-secret#fragment", method: "GET", roles: ["anonymous", "admin"] }),
      });
      assert.equal(comparison.status, 200);
      const comparisonData = await comparison.json() as { historySaved: boolean };
      assert.equal(comparisonData.historySaved, true);

      const listed = await fetch(historyRuntime.baseUrl + "/v1/http/history", {
        headers: { authorization: "Bearer " + token },
      });
      assert.equal(listed.status, 200);
      const payload = await listed.json() as { records: Array<{ target: string; responses: unknown[]; comparison: { sameBody: boolean; changedHeaders: string[] } }> };
      assert.equal(payload.records.length, 1);
      assert.equal(payload.records[0].target, "http://127.0.0.1:" + port + "/private");
      assert.equal(payload.records[0].comparison.sameBody, false);
      assert.ok(payload.records[0].comparison.changedHeaders.includes("x-audit-value"));
      const serialized = JSON.stringify(payload.records[0]);
      assert.doesNotMatch(serialized, /query-secret|access_token|fragment|private-response|admin-secret-value/);
      assert.equal(payload.records[0].responses.length, 2);

      const cleared = await fetch(historyRuntime.baseUrl + "/v1/http/history", {
        method: "DELETE",
        headers: { authorization: "Bearer " + token },
      });
      assert.equal(cleared.status, 200);
      const afterClear = await fetch(historyRuntime.baseUrl + "/v1/http/history", {
        headers: { authorization: "Bearer " + token },
      });
      assert.deepEqual((await afterClear.json() as { records: unknown[] }).records, []);
    } finally {
      await stopRuntime(historyRuntime);
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  });

  test("persists, lists, and reloads a valid agent session", async () => {
    const state = {
      createdAt: "2026-11-13T00:00:00.000Z",
      messages: [
        { role: "user", content: "Continue the integration test task" },
        { role: "assistant", content: "Checkpoint saved" },
      ],
    };
    const saved = await post("/v1/sessions/save", { id: "integration-session-1", state });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json() as { ok: boolean }).ok, true);

    const loaded = await post("/v1/sessions/load", { id: "integration-session-1" });
    assert.equal(loaded.status, 200);
    const payload = await loaded.json() as { state: { messages: Array<{ content: string }> } };
    assert.equal(payload.state.messages[0].content, "Continue the integration test task");

    const listed = await request("/v1/agent/sessions", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(listed.status, 200);
    const sessions = (await listed.json() as { sessions: Array<{ id: string; lastMessage: string }> }).sessions;
    assert.ok(sessions.some((session) => session.id === "integration-session-1" && session.lastMessage === "Continue the integration test task"));
  });

  test("rejects malformed session identifiers and keeps terminal execution disabled", async () => {
    const invalidSession = await post("/v1/sessions/load", { id: "../outside" });
    assert.equal(invalidSession.status, 400);

    const terminal = await post("/v1/terminal/execute", { command: "git", args: ["status", "--short"] });
    assert.equal(terminal.status, 400);
    assert.match((await terminal.json() as { error: string }).error, /execution is disabled/i);
  });

});


type MockModelHandle = { server: HttpServer; baseUrl: string; requests: number };
async function startMockModel(
  responder: (requestNumber: number, body: Record<string, unknown>) => { status?: number; payload?: unknown },
): Promise<MockModelHandle> {
  const server = createHttpServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
    mock.requests++;
    const response = responder(mock.requests, body);
    res.statusCode = response.status || 200;
    if (response.status && response.status >= 400) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(response.payload || { error: { message: "mock provider unavailable" } }));
      return;
    }
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    const payload = response.payload || { choices: [{ delta: { content: "Mock model completed the task." }, finish_reason: "stop" }] };
    res.write("data: " + JSON.stringify(payload) + "\n\n");
    res.end("data: [DONE]\n\n");
  });
  const mock = { server, baseUrl: "", requests: 0 };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  mock.baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/v1";
  return mock;
}

async function stopMockModel(mock: MockModelHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => mock.server.close((error) => error ? reject(error) : resolve()));
}

test("approval gate pauses writes and executes only the exact approved call", async () => {
  const mock = await startMockModel((requestNumber) => requestNumber === 1
    ? { payload: { choices: [{ delta: { tool_calls: [{ index: 0, id: "write-call-1", type: "function", function: { name: "files.write", arguments: JSON.stringify({ path: "approved.txt", content: "approved content" }) } }] }, finish_reason: "tool_calls" }] } }
    : { payload: { choices: [{ delta: { content: "The requested action was handled." }, finish_reason: "stop" }] } });
  const isolated = await startRuntime({
    OMDA_AGENT_MODEL_BASE_URL: mock.baseUrl,
    OMDA_AGENT_MODEL_NAME: "mock-model",
  });
  try {
    const started = await postTo(isolated, "/v1/agent/run", { goal: "Create approved.txt" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string; tool: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending.length, 1);
    assert.equal(pending.pending[0].id, "write-call-1");
    await assert.rejects(readFile(join(isolated.workspace, "approved.txt"), "utf8"));

    const denied = await postTo(isolated, "/v1/agent/continue", { sessionId: pending.sessionId, approvedCallIds: [] });
    assert.equal(denied.status, 200);
    assert.equal((await denied.json() as { status: string }).status, "completed");
    await assert.rejects(readFile(join(isolated.workspace, "approved.txt"), "utf8"));
    assert.equal(mock.requests, 2);
  } finally {
    await stopRuntime(isolated);
    await stopMockModel(mock);
  }
});

test("approval gate executes a write only after the exact pending call is approved", async () => {
  const mock = await startMockModel((requestNumber) => requestNumber === 1
    ? { payload: { choices: [{ delta: { tool_calls: [{ index: 0, id: "write-call-approved", type: "function", function: { name: "files.write", arguments: JSON.stringify({ path: "approved-after-consent.txt", content: "written only after approval" }) } }] }, finish_reason: "tool_calls" }] } }
    : { payload: { choices: [{ delta: { content: "The approved file was created." }, finish_reason: "stop" }] } });
  const isolated = await startRuntime({
    OMDA_AGENT_MODEL_BASE_URL: mock.baseUrl,
    OMDA_AGENT_MODEL_NAME: "mock-model",
  });
  try {
    const started = await postTo(isolated, "/v1/agent/run", { goal: "Create approved-after-consent.txt" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending.length, 1);
    await assert.rejects(readFile(join(isolated.workspace, "approved-after-consent.txt"), "utf8"));

    const continued = await postTo(isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["write-call-approved"],
    });
    const continuedBody = await continued.text();
    assert.equal(continued.status, 200, continuedBody + "\n" + isolated.stderr);
    const result = JSON.parse(continuedBody) as { status: string; message: string };
    assert.equal(result.status, "completed");
    assert.equal(result.message, "The approved file was created.");
    assert.equal(await readFile(join(isolated.workspace, "approved-after-consent.txt"), "utf8"), "written only after approval");
    assert.equal(mock.requests, 2);
  } finally {
    await stopRuntime(isolated);
    await stopMockModel(mock);
  }
});

test("does not replay an approved side effect when the follow-up model request fails", async () => {
  const mock = await startMockModel((requestNumber) => requestNumber === 1
    ? { payload: { choices: [{ delta: { tool_calls: [{ index: 0, id: "write-call-once", type: "function", function: { name: "files.write", arguments: JSON.stringify({ path: "write-once.txt", content: "executed once" }) } }] }, finish_reason: "tool_calls" }] } }
    : { status: 503, payload: { error: { message: "model unavailable after approved action" } } });
  const isolated = await startRuntime({
    OMDA_AGENT_MODEL_BASE_URL: mock.baseUrl,
    OMDA_AGENT_MODEL_NAME: "mock-model",
  });
  try {
    const started = await postTo(isolated, "/v1/agent/run", { goal: "Create write-once.txt" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending[0].id, "write-call-once");

    const continued = await postTo(isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["write-call-once"],
    });
    assert.equal(continued.status, 400);
    assert.equal(await readFile(join(isolated.workspace, "write-once.txt"), "utf8"), "executed once");
    assert.equal(mock.requests, 2);

    const replay = await postTo(isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["write-call-once"],
    });
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /no pending approval request/i);
    assert.equal(await readFile(join(isolated.workspace, "write-once.txt"), "utf8"), "executed once");
    assert.equal(mock.requests, 2);
  } finally {
    await stopRuntime(isolated);
    await stopMockModel(mock);
  }
});

test("model runtime fails over to the configured fallback without exposing credentials", async () => {
  const primary = await startMockModel(() => ({ status: 503, payload: { error: { message: "primary unavailable" } } }));
  const fallback = await startMockModel((_requestNumber, body) => {
    assert.equal(body.model, "fallback-test-model");
    return { payload: { choices: [{ delta: { content: "Fallback provider succeeded." }, finish_reason: "stop" }] } };
  });
  const isolated = await startRuntime({
    OMDA_AGENT_MODEL_BASE_URL: primary.baseUrl,
    OMDA_AGENT_MODEL_NAME: "primary-test-model",
    OMDA_AGENT_MODEL_API_KEY: "primary-secret-test-value",
    OMDA_AGENT_FALLBACK_MODEL_BASE_URL: fallback.baseUrl,
    OMDA_AGENT_FALLBACK_MODEL_NAME: "fallback-test-model",
    OMDA_AGENT_FALLBACK_MODEL_API_KEY: "fallback-secret-test-value",
  });
  try {
    const response = await postTo(isolated, "/v1/agent/run", { goal: "Say hello after checking provider availability." });
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody + "\n" + isolated.stderr);
    const result = JSON.parse(responseBody) as { status: string; message: string; usage: { provider: string } };
    assert.equal(result.status, "completed");
    assert.equal(result.message, "Fallback provider succeeded.");
    assert.equal(result.usage.provider, "fallback");
    assert.equal(primary.requests, 1);
    assert.equal(fallback.requests, 1);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("primary-secret-test-value"), false);
    assert.equal(serialized.includes("fallback-secret-test-value"), false);
  } finally {
    await stopRuntime(isolated);
    await stopMockModel(primary);
    await stopMockModel(fallback);
  }
});

test("skips a provider during its cooldown on the next agent request", async () => {
  const primary = await startMockModel(() => ({ status: 503, payload: { error: { message: "primary unavailable" } } }));
  const fallback = await startMockModel((requestNumber) => ({
    payload: { choices: [{ delta: { content: "Fallback response " + requestNumber }, finish_reason: "stop" }] },
  }));
  const isolated = await startRuntime({
    OMDA_AGENT_MODEL_BASE_URL: primary.baseUrl,
    OMDA_AGENT_MODEL_NAME: "primary-cooldown-test-model",
    OMDA_AGENT_FALLBACK_MODEL_BASE_URL: fallback.baseUrl,
    OMDA_AGENT_FALLBACK_MODEL_NAME: "fallback-cooldown-test-model",
  });
  try {
    const first = await postTo(isolated, "/v1/agent/run", { goal: "Answer the first request." });
    const firstBody = await first.text();
    assert.equal(first.status, 200, firstBody + "\n" + isolated.stderr);
    assert.equal((JSON.parse(firstBody) as { message: string }).message, "Fallback response 1");

    const second = await postTo(isolated, "/v1/agent/run", { goal: "Answer the second request." });
    const secondBody = await second.text();
    assert.equal(second.status, 200, secondBody + "\n" + isolated.stderr);
    assert.equal((JSON.parse(secondBody) as { message: string }).message, "Fallback response 2");

    assert.equal(primary.requests, 1, "The unavailable primary should be skipped while its cooldown is active.");
    assert.equal(fallback.requests, 2, "The healthy fallback should handle both requests.");
  } finally {
    await stopRuntime(isolated);
    await stopMockModel(primary);
    await stopMockModel(fallback);
  }
});

test("container execution invokes Docker with restrictive isolation flags and only the approved command", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "omda-docker-runtime-test-"));
  const bin = join(workspace, "bin");
  const markerPath = join(workspace, "docker-args.json");
  await mkdir(bin, { recursive: true });
  const fakeDocker = join(bin, "docker");
  await writeFile(fakeDocker, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.OMDA_DOCKER_TEST_ARGS, JSON.stringify(process.argv.slice(2)));
process.stdout.write("container-command-ok");
`, "utf8");
  await chmod(fakeDocker, 0o755);
  const isolated = await startRuntime({
    OMDA_AGENT_EXECUTION: "container",
    OMDA_AGENT_SANDBOX_IMAGE: "node:22-bookworm-slim",
    OMDA_DOCKER_TEST_ARGS: markerPath,
    PATH: bin + delimiter + (process.env.PATH || ""),
  });
  try {
    const response = await postTo(isolated, "/v1/terminal/execute", { command: "pnpm", args: ["--version"], cwd: "." });
    assert.equal(response.status, 200);
    const result = await response.json() as { ok: boolean; stdout: string; isolation: string; image: string };
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "container-command-ok");
    assert.equal(result.isolation, "docker");
    assert.equal(result.image, "node:22-bookworm-slim");
    const args = JSON.parse(await readFile(markerPath, "utf8")) as string[];
    for (const flag of ["--network=none", "--cpus=1", "--memory=512m", "--memory-swap=512m", "--pids-limit=128", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges"]) {
      assert.ok(args.includes(flag), "missing Docker isolation flag: " + flag);
    }
    assert.ok(args.includes("--pull=never"), "the runtime must not pull arbitrary images during execution");
    assert.ok(args.includes("pnpm"));
    assert.ok(args.includes("--version"));
    assert.equal(args.includes("--privileged"), false);
    assert.equal(args.some((arg) => arg.includes("primary-secret-test-value")), false);
  } finally {
    await stopRuntime(isolated);
    await rm(workspace, { recursive: true, force: true });
  }
});

async function postTo(handle: RuntimeHandle, path: string, body: unknown): Promise<Response> {
  return fetch(handle.baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
}


describe("MCP runtime integration", () => {
  let isolated: RuntimeHandle;
  let counterPath: string;

  before(async () => {
    const workspace = await mkdtemp(join(tmpdir(), "omda-mcp-runtime-test-"));
    const scriptPath = join(workspace, "mock-mcp-server.mjs");
    counterPath = join(workspace, "mcp-starts.txt");
    const mockServer = `
import { createReadStream, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";
const counter = process.env.MCP_TEST_COUNTER;
let starts = 0;
try { starts = Number(readFileSync(counter, "utf8")) || 0; } catch {}
starts += 1;
writeFileSync(counter, String(starts));
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method === "initialize" && message.id !== undefined) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mock", version: "1.0" } } }) + "\\n");
  } else if (message.method === "tools/list" && message.id !== undefined) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "ping", description: "Mock health tool", inputSchema: { type: "object", properties: {} } }] } }) + "\\n");
    if (starts === 1) setTimeout(() => process.exit(0), 30);
  }
});
`;
    await writeFileForMcp(scriptPath, mockServer);
    await writeFileForMcp(join(workspace, ".omda", "mcp-servers.json"), JSON.stringify({
      servers: [{ name: "mock", command: process.execPath, args: [scriptPath], envFrom: ["MCP_TEST_COUNTER"] }]
    }));
    isolated = await startRuntime({
      OMDA_AGENT_WORKSPACE: workspace,
      OMDA_AGENT_MCP_COMMANDS: process.execPath,
      MCP_TEST_COUNTER: counterPath,
    });
  });

  after(async () => {
    await stopRuntime(isolated);
  });

  test("reconnects to an MCP server after its process exits", async () => {
    const first = await fetch(isolated.baseUrl + "/v1/mcp/tools", { headers: { authorization: "Bearer " + token } });
    assert.equal(first.status, 200);
    const firstBody = await first.json() as { servers: Array<{ tools: Array<{ name: string }> }> };
    assert.ok(firstBody.servers.some((server) => server.tools.some((tool) => tool.name === "ping")));

    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = await fetch(isolated.baseUrl + "/v1/mcp/tools", { headers: { authorization: "Bearer " + token } });
    assert.equal(second.status, 200);
    const secondBody = await second.json() as { servers: Array<{ tools: Array<{ name: string }> }> };
    assert.ok(secondBody.servers.some((server) => server.tools.some((tool) => tool.name === "ping")));
    assert.equal(await readFile(counterPath, "utf8"), "2");
  });
});


async function startMcpApprovalFixture(goal: string) {
  const workspace = await mkdtemp(join(tmpdir(), "omda-mcp-approval-test-"));
  const scriptPath = join(workspace, "mock-mcp-server.cjs");
  const callsPath = join(workspace, "mcp-calls.txt");
  const argsPath = join(workspace, "mcp-call-args.json");
  const mockServer = [
    'const { readFileSync, writeFileSync } = require("node:fs");',
    'const readline = require("node:readline");',
    'const rl = readline.createInterface({ input: process.stdin });',
    'rl.on("line", (line) => {',
    '  let message;',
    '  try { message = JSON.parse(line); } catch { return; }',
    '  if (message.method === "initialize" && message.id !== undefined) {',
    '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "approval-mock", version: "1.0" } } }) + "\\n");',
    '  } else if (message.method === "tools/list" && message.id !== undefined) {',
    '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "write_note", description: "Write a note to the configured test sink", inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"], additionalProperties: false } }] } }) + "\\n");',
    '  } else if (message.method === "tools/call" && message.id !== undefined) {',
    '    let count = 0;',
    '    try { count = Number(readFileSync(process.env.MCP_TEST_CALLS, "utf8")) || 0; } catch {}',
    '    writeFileSync(process.env.MCP_TEST_CALLS, String(count + 1));',
    '    writeFileSync(process.env.MCP_TEST_ARGS, JSON.stringify(message.params.arguments));',
    '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "mock note saved" }] } }) + "\\n");',
    '  }',
    '});',
  ].join("\n");
  await writeFileForMcp(scriptPath, mockServer);
  await writeFileForMcp(join(workspace, ".omda", "mcp-servers.json"), JSON.stringify({
    servers: [{ name: "mock", command: process.execPath, args: [scriptPath], envFrom: ["MCP_TEST_CALLS", "MCP_TEST_ARGS"] }],
  }));
  const model = await startMockModel((requestNumber) => requestNumber === 1
    ? { payload: { choices: [{ delta: { tool_calls: [{ index: 0, id: "mcp-write-call", type: "function", function: { name: "mcp.call_tool", arguments: JSON.stringify({ serverName: "mock", toolName: "write_note", arguments: { content: goal } }) } }] }, finish_reason: "tool_calls" }] } }
    : { payload: { choices: [{ delta: { content: "MCP approval flow completed." }, finish_reason: "stop" }] } });
  const isolated = await startRuntime({
    OMDA_AGENT_WORKSPACE: workspace,
    OMDA_AGENT_MCP_COMMANDS: process.execPath,
    MCP_TEST_CALLS: callsPath,
    MCP_TEST_ARGS: argsPath,
    OMDA_AGENT_MODEL_BASE_URL: model.baseUrl,
    OMDA_AGENT_MODEL_NAME: "mock-model",
  });
  return { workspace, callsPath, argsPath, model, isolated };
}

test("MCP tool execution remains paused until the exact pending call is approved", async () => {
  const fixture = await startMcpApprovalFixture("approved MCP content");
  try {
    const started = await postTo(fixture.isolated, "/v1/agent/run", { goal: "Use the MCP note tool" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + fixture.isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string; tool: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending.length, 1);
    assert.equal(pending.pending[0].id, "mcp-write-call");
    assert.equal(pending.pending[0].tool, "mcp.call_tool");
    await assert.rejects(readFile(fixture.callsPath, "utf8"));

    const continued = await postTo(fixture.isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["mcp-write-call"],
    });
    const continuedBody = await continued.text();
    assert.equal(continued.status, 200, continuedBody + "\n" + fixture.isolated.stderr);
    assert.equal((JSON.parse(continuedBody) as { status: string }).status, "completed");
    assert.equal(await readFile(fixture.callsPath, "utf8"), "1");
    assert.deepEqual(JSON.parse(await readFile(fixture.argsPath, "utf8")), { content: "approved MCP content" });
    assert.equal(fixture.model.requests, 2);
  } finally {
    await stopRuntime(fixture.isolated);
    await stopMockModel(fixture.model);
    await rm(fixture.workspace, { recursive: true, force: true });
  }
});

test("denying an MCP tool approval never invokes the configured MCP server tool", async () => {
  const fixture = await startMcpApprovalFixture("must not be written");
  try {
    const started = await postTo(fixture.isolated, "/v1/agent/run", { goal: "Use the MCP note tool" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + fixture.isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending[0].id, "mcp-write-call");
    await assert.rejects(readFile(fixture.callsPath, "utf8"));

    const denied = await postTo(fixture.isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: [],
    });
    const deniedBody = await denied.text();
    assert.equal(denied.status, 200, deniedBody + "\n" + fixture.isolated.stderr);
    assert.equal((JSON.parse(deniedBody) as { status: string }).status, "completed");
    await assert.rejects(readFile(fixture.callsPath, "utf8"));
    assert.equal(fixture.model.requests, 2);
  } finally {
    await stopRuntime(fixture.isolated);
    await stopMockModel(fixture.model);
    await rm(fixture.workspace, { recursive: true, force: true });
  }
});


test("concurrent approval submissions cannot execute the same pending MCP action twice", async () => {
  const fixture = await startMcpApprovalFixture("execute exactly once");
  try {
    const started = await postTo(fixture.isolated, "/v1/agent/run", { goal: "Use the MCP note tool" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + fixture.isolated.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending[0].id, "mcp-write-call");

    const submitApproval = () => postTo(fixture.isolated, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["mcp-write-call"],
    });
    const [first, second] = await Promise.all([submitApproval(), submitApproval()]);
    const responses = await Promise.all([first.text(), second.text()]);
    const successful = [first, second].filter((response) => response.status === 200);
    const rejected = [first, second].filter((response) => response.status === 400);
    assert.equal(successful.length, 1, responses.join("\n"));
    assert.equal(rejected.length, 1, responses.join("\n"));
    const successIndex = first.status === 200 ? 0 : 1;
    assert.equal((JSON.parse(responses[successIndex]) as { status: string }).status, "completed");
    assert.match(responses[1 - successIndex], /already processing an approval/);
    assert.equal(await readFile(fixture.callsPath, "utf8"), "1");
    assert.equal(fixture.model.requests, 2);
  } finally {
    await stopRuntime(fixture.isolated);
    await stopMockModel(fixture.model);
    await rm(fixture.workspace, { recursive: true, force: true });
  }
});


test("host command mode uses an argument vector and does not forward provider secrets", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "omda-host-command-test-"));
  const bin = join(fixtureRoot, "bin");
  const markerPath = join(fixtureRoot, "command-result.json");
  const injectedPath = join(fixtureRoot, "shell-injection-ran");
  await mkdir(bin, { recursive: true });
  const fakePnpm = join(bin, "pnpm");
  const markerLiteral = JSON.stringify(markerPath);
  await writeFile(fakePnpm, [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    'fs.writeFileSync(' + markerLiteral + ', JSON.stringify({ args: process.argv.slice(2), openAiKey: process.env.OPENAI_API_KEY || null, geminiKey: process.env.GEMINI_API_KEY || null }));',
    'process.stdout.write("host-command-ok");',
    "",
  ].join("\n"), "utf8");
  await chmod(fakePnpm, 0o755);

  const isolated = await startRuntime({
    OMDA_AGENT_EXECUTION: "host",
    PATH: bin + delimiter + (process.env.PATH || ""),
    OPENAI_API_KEY: "must-not-reach-child",
    GEMINI_API_KEY: "must-not-reach-child",
  });
  try {
    const payload = ["--version", ";", "touch", injectedPath];
    const response = await postTo(isolated, "/v1/terminal/execute", { command: "pnpm", args: payload, cwd: "." });
    assert.equal(response.status, 200);
    const result = await response.json() as { ok: boolean; stdout: string; isolation: string };
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "host-command-ok");
    assert.equal(result.isolation, "host");
    const recorded = JSON.parse(await readFile(markerPath, "utf8")) as { args: string[]; openAiKey: string | null; geminiKey: string | null };
    assert.deepEqual(recorded.args, payload);
    assert.equal(recorded.openAiKey, null);
    assert.equal(recorded.geminiKey, null);
    await assert.rejects(readFile(injectedPath, "utf8"), { code: "ENOENT" });

    const shell = await postTo(isolated, "/v1/terminal/execute", { command: "sh", args: ["-c", "touch " + injectedPath], cwd: "." });
    assert.equal(shell.status, 400);
    assert.match((await shell.json() as { error: string }).error, /not permitted/i);
    await assert.rejects(readFile(injectedPath, "utf8"), { code: "ENOENT" });
  } finally {
    await stopRuntime(isolated);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});


test("pending MCP approval survives an Agent Runtime restart and can be resumed", async () => {
  const fixture = await startMcpApprovalFixture("resume after restart");
  let active = fixture.isolated;
  const stopProcessWithoutDeletingWorkspace = async (handle: RuntimeHandle) => {
    if (handle.child.exitCode !== null) return;
    handle.child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => handle.child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
  };
  try {
    const started = await postTo(active, "/v1/agent/run", { goal: "Use the MCP note tool" });
    const startedBody = await started.text();
    assert.equal(started.status, 200, startedBody + "\n" + active.stderr);
    const pending = JSON.parse(startedBody) as { status: string; sessionId: string; pending: Array<{ id: string }> };
    assert.equal(pending.status, "approval_required");
    assert.equal(pending.pending[0].id, "mcp-write-call");
    await assert.rejects(readFile(fixture.callsPath, "utf8"), { code: "ENOENT" });

    await stopProcessWithoutDeletingWorkspace(active);
    active = await startRuntime({
      OMDA_AGENT_WORKSPACE: fixture.workspace,
      OMDA_AGENT_MCP_COMMANDS: process.execPath,
      MCP_TEST_CALLS: fixture.callsPath,
      MCP_TEST_ARGS: fixture.argsPath,
      OMDA_AGENT_MODEL_BASE_URL: fixture.model.baseUrl,
      OMDA_AGENT_MODEL_NAME: "mock-model",
    });

    // A workspace user can observe a session ID and plant the old predictable
    // temp filename. Session persistence must never follow that symlink.
    const outside = await mkdtemp(join(tmpdir(), "omda-session-symlink-test-"));
    const outsideSentinel = join(outside, "sentinel.txt");
    const sessionsDirectory = join(fixture.workspace, ".omda", "sessions");
    await mkdir(sessionsDirectory, { recursive: true });
    await writeFile(outsideSentinel, "must remain unchanged", "utf8");
    await symlink(outsideSentinel, join(sessionsDirectory, pending.sessionId + ".json.tmp"));

    const continued = await postTo(active, "/v1/agent/continue", {
      sessionId: pending.sessionId,
      approvedCallIds: ["mcp-write-call"],
    });
    const continuedBody = await continued.text();
    assert.equal(continued.status, 200, continuedBody + "\n" + active.stderr);
    assert.equal((JSON.parse(continuedBody) as { status: string }).status, "completed");
    assert.equal(await readFile(outsideSentinel, "utf8"), "must remain unchanged");
    assert.equal(await readFile(fixture.callsPath, "utf8"), "1");
    await rm(outside, { recursive: true, force: true });
    assert.deepEqual(JSON.parse(await readFile(fixture.argsPath, "utf8")), { content: "resume after restart" });
    assert.equal(fixture.model.requests, 2);
  } finally {
    await stopRuntime(active);
    await stopMockModel(fixture.model);
    await rm(fixture.workspace, { recursive: true, force: true });
  }
});
