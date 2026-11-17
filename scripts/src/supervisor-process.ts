import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";

export type SupervisedCommandOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  killGraceMs?: number;
  outputLimit?: number;
};

/** Runs a fixed argument vector without a shell and enforces a hard timeout. */
export function runSupervisedCommand(command: string, args: string[], options: SupervisedCommandOptions): Promise<string> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 120000);
  const killGraceMs = Math.max(1, options.killGraceMs ?? 3000);
  const outputLimit = Math.max(1024, options.outputLimit ?? 100000);
  return new Promise((resolveResult, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      timeoutTimer = null;
      killTimer = null;
    };
    const append = (current: string, chunk: Buffer) =>
      current.length >= outputLimit ? current : current + chunk.toString("utf8").slice(0, outputLimit - current.length);

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, killGraceMs);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      clearTimers();
      reject(error);
    });
    child.once("close", (code) => {
      clearTimers();
      if (timedOut) {
        reject(new Error(command + " timed out after " + timeoutMs + " ms."));
      } else if (code === 0) {
        resolveResult(stdout.trim());
      } else {
        reject(new Error((stderr || stdout || command + " failed").slice(0, 1200)));
      }
    });
  });
}
