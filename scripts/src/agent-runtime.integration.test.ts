import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

async function startRuntime(): Promise<RuntimeHandle> {
  const workspace = await mkdtemp(join(tmpdir(), "omda-agent-runtime-test-"));
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

  test("enforces the exact browser origin allowlist for preflight requests", async () => {
    const allowed = await request("/v1/runtime/status", {
      method: "OPTIONS",
      headers: { origin: allowedOrigin, "access-control-request-private-network": "true" },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(allowed.headers.get("access-control-allow-private-network"), "true");

    const denied = await request("/v1/runtime/status", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    });
    assert.equal(denied.status, 403);
  });
});
