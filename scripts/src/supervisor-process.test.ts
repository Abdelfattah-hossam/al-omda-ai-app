import assert from "node:assert/strict";
import test from "node:test";
import { runSupervisedCommand } from "./supervisor-process.js";

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
