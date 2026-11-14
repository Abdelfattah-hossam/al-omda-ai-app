import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const supervisorPath = join(dirname(fileURLToPath(import.meta.url)), "agent-supervisor.ts");

test("supervisor restarts the runtime after an unexpected process exit", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "omda-supervisor-test-"));
  const bin = join(workspace, "bin");
  const marker = join(workspace, "runtime-starts.txt");
  const fakePnpm = join(bin, "pnpm");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin, { recursive: true }));
  await writeFile(fakePnpm, `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.OMDA_SUPERVISOR_TEST_MARKER, "start\\n");
process.exit(1);
`, "utf8");
  await chmod(fakePnpm, 0o755);

  let supervisor: ChildProcess | null = null;
  let output = "";
  try {
    supervisor = spawn(process.execPath, ["--import", "tsx", supervisorPath], {
      cwd: dirname(dirname(supervisorPath)),
      env: {
        ...process.env,
        PATH: bin + delimiter + (process.env.PATH || ""),
        OMDA_SUPERVISOR_TEST_MARKER: marker,
        OMDA_AGENT_AUTO_UPDATE: "false",
        OMDA_AGENT_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    supervisor.stdout?.on("data", (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-4000); });
    supervisor.stderr?.on("data", (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-4000); });

    const deadline = Date.now() + 6000;
    let starts = 0;
    while (Date.now() < deadline) {
      try {
        starts = (await readFile(marker, "utf8")).trim().split("\n").filter(Boolean).length;
      } catch { /* The first supervised process may not have started yet. */ }
      if (starts >= 2) break;
      if (supervisor.exitCode !== null) throw new Error("Supervisor exited unexpectedly: " + output);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(starts >= 2, "Expected the supervisor to restart the failed runtime. Output: " + output);
  } finally {
    if (supervisor && supervisor.exitCode === null) {
      supervisor.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => supervisor?.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (supervisor.exitCode === null) supervisor.kill("SIGKILL");
    }
    await rm(workspace, { recursive: true, force: true });
  }
});


test("supervisor shutdown stops the runtime without scheduling another restart", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "omda-supervisor-shutdown-test-"));
  const bin = join(workspace, "bin");
  const marker = join(workspace, "runtime-starts.txt");
  const runtimePidPath = join(workspace, "runtime.pid");
  const fakePnpm = join(bin, "pnpm");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin, { recursive: true }));
  await writeFile(fakePnpm, [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    'fs.appendFileSync(process.env.OMDA_SUPERVISOR_TEST_MARKER, "start\\n");',
    'require("node:fs").writeFileSync(process.env.OMDA_SUPERVISOR_TEST_PID, String(process.pid));',
    'process.on("SIGTERM", () => process.exit(0));',
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), "utf8");
  await chmod(fakePnpm, 0o755);

  let supervisor: ChildProcess | null = null;
  let output = "";
  try {
    supervisor = spawn(process.execPath, ["--import", "tsx", supervisorPath], {
      cwd: dirname(dirname(supervisorPath)),
      env: {
        ...process.env,
        PATH: bin + delimiter + (process.env.PATH || ""),
        OMDA_SUPERVISOR_TEST_MARKER: marker,
        OMDA_SUPERVISOR_TEST_PID: runtimePidPath,
        OMDA_AGENT_AUTO_UPDATE: "false",
        OMDA_AGENT_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    supervisor.stdout?.on("data", (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-4000); });
    supervisor.stderr?.on("data", (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-4000); });

    const deadline = Date.now() + 4000;
    let started = false;
    while (Date.now() < deadline) {
      try {
        started = (await readFile(marker, "utf8")).trim().length > 0;
      } catch { /* Wait for the supervised runtime to start. */ }
      if (started) break;
      if (supervisor.exitCode !== null) throw new Error("Supervisor exited before runtime startup: " + output);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(started, "Expected the runtime to start before shutdown. Output: " + output);

    const exited = new Promise<number | null>((resolve) => {
      supervisor?.once("exit", (code) => resolve(code));
    });
    supervisor.kill("SIGTERM");
    const exitCode = await Promise.race([
      exited,
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 4000)),
    ]);
    assert.notEqual(exitCode, "timeout", "Supervisor did not exit after SIGTERM. Output: " + output);
    assert.equal(exitCode, 0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal((await readFile(marker, "utf8")).trim().split("\n").filter(Boolean).length, 1);
  } finally {
    if (supervisor && supervisor.exitCode === null && supervisor.signalCode === null) {
      supervisor.kill("SIGKILL");
      await new Promise<void>((resolve) => supervisor?.once("exit", () => resolve()));
    }
    try {
      const pid = Number(await readFile(runtimePidPath, "utf8"));
      if (Number.isInteger(pid) && pid > 1) {
        if (process.platform === "win32") process.kill(pid, "SIGKILL");
        else process.kill(-pid, "SIGKILL");
      }
    } catch { /* The supervised runtime may already have exited. */ }
    await rm(workspace, { recursive: true, force: true });
  }
});
