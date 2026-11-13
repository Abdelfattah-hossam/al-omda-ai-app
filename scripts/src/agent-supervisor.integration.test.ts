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
