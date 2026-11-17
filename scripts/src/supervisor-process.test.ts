import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { runSupervisedCommand, terminateChildProcess } from "./supervisor-process.js";

test("runs an argument vector without a shell and returns bounded stdout", async () => {
  const output = await runSupervisedCommand(process.execPath, ["-e", "process.stdout.write('safe output')"], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 3000,
  });
  assert.equal(output, "safe output");
});

test("terminates a command that ignores SIGTERM after its hard timeout", async () => {
  const started = Date.now();
  await assert.rejects(
    runSupervisedCommand(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 100,
      killGraceMs: 100,
    }),
    /timed out after 100 ms/,
  );
  assert.ok(Date.now() - started < 3000, "A timed-out command must not hang the supervisor.");
});

test("escalates termination for a detached command process group", async (t) => {
  if (process.platform === "win32") {
    t.skip("Detached POSIX process groups are unavailable on Windows.");
    return;
  }
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const escalation = terminateChildProcess(child, 100, true);
  let timeoutHandle: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error("Process group did not terminate.")), 3000); });
  const result = await Promise.race([closed, timeout]);
  clearTimeout(escalation);
  clearTimeout(timeoutHandle!);
  assert.equal(result.signal, "SIGKILL");
});

test("rejects non-zero command exits with bounded diagnostic output", async () => {
  await assert.rejects(
    runSupervisedCommand(process.execPath, ["-e", "process.stderr.write('command failed'); process.exit(7)"], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 3000,
    }),
    /command failed/,
  );
});
