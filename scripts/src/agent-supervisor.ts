import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommandEnvironment } from "./command-env.js";
import { decideSafeUpdate } from "./update-policy.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const token = process.env.OMDA_AGENT_TOKEN?.trim() || "";
const autoUpdate = process.env.OMDA_AGENT_AUTO_UPDATE === "true";
const intervalHours = Math.max(1, Math.min(168, Number(process.env.OMDA_AGENT_UPDATE_INTERVAL_HOURS || 24) || 24));
const intervalMs = intervalHours * 60 * 60 * 1000;
let runtime: ChildProcess | null = null;
let stopping = false;
let updating = false;
let restartTimer: NodeJS.Timeout | null = null;
let restartAttempts = 0;
let updateInProgress = false;
let initialUpdateTimer: NodeJS.Timeout | null = null;
let updateIntervalTimer: NodeJS.Timeout | null = null;

function runCommand(command: string, args: string[], timeoutMs = 120000): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: buildCommandEnvironment(process.env),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { if (stdout.length < 100000) stdout += chunk.toString("utf8").slice(0, 100000 - stdout.length); });
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < 100000) stderr += chunk.toString("utf8").slice(0, 100000 - stderr.length); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveResult(stdout.trim());
      else reject(new Error((stderr || stdout || command + " failed").slice(0, 1200)));
    });
  });
}

function runPnpm(args: string[], timeoutMs = 10 * 60 * 1000): Promise<string> {
  if (process.platform === "win32") {
    const comspec = process.env.COMSPEC || "cmd.exe";
    // Arguments are fixed by this updater; no user-provided text enters this command string.
    return runCommand(comspec, ["/d", "/s", "/c", "pnpm " + args.join(" ")], timeoutMs);
  }
  return runCommand("pnpm", args, timeoutMs);
}

function startRuntime(): void {
  if (stopping || runtime) return;
  const command = process.platform === "win32" ? (process.env.COMSPEC || "cmd.exe") : "pnpm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm --filter @workspace/scripts agent:runtime"]
    : ["--filter", "@workspace/scripts", "agent:runtime"];
  const child = spawn(command, args, {
    cwd: repoRoot, shell: false, windowsHide: true, stdio: "inherit",
    env: process.env, detached: process.platform !== "win32",
  });
  runtime = child;
  child.once("error", (error) => {
    console.error("[AL OMDA supervisor] Runtime start failed:", error.message);
    if (runtime === child) runtime = null;
    scheduleRestart();
  });
  child.once("exit", (code, signal) => {
    if (runtime === child) runtime = null;
    if (!stopping && !updating) {
      console.warn("[AL OMDA supervisor] Runtime exited:", code, signal || "");
      scheduleRestart();
    }
  });
}

function scheduleRestart(): void {
  if (stopping || updating || restartTimer) return;
  const delay = Math.min(30000, 1000 * (2 ** Math.min(restartAttempts, 5)));
  restartAttempts++;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startRuntime();
  }, delay);
}

async function stopRuntime(): Promise<void> {
  const child = runtime;
  runtime = null;
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    await runCommand("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], 15000).catch(() => undefined);
  } else if (child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
  await new Promise<void>((resolveExit) => {
    if (child.exitCode !== null) return resolveExit();
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveExit();
    }, 8000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
  });
}

async function getActiveRunCount(): Promise<number | null> {
  if (!token) return null;
  try {
    const response = await fetch("http://127.0.0.1:4318/v1/runtime/status", {
      headers: { authorization: "Bearer " + token },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json() as { activeRuns?: unknown };
    return typeof data.activeRuns === "number" && Number.isFinite(data.activeRuns) ? data.activeRuns : null;
  } catch { return null; }
}

async function checkAndApplyUpdate(): Promise<void> {
  if (!autoUpdate || updateInProgress || stopping || !runtime) return;
  updateInProgress = true;
  try {
    const branch = await runCommand("git", ["branch", "--show-current"], 15000);
    const status = await runCommand("git", ["status", "--porcelain", "--untracked-files=all"], 15000);
    const remote = await runCommand("git", ["remote", "get-url", "origin"], 15000);
    if (!/^https:\/\/github\.com\//i.test(remote)) {
      console.info("[AL OMDA supervisor] Auto-update skipped: origin must be an HTTPS GitHub remote.");
      return;
    }
    await runCommand("git", ["fetch", "--quiet", "origin", "main"], 120000);
    const behind = Number(await runCommand("git", ["rev-list", "--count", "HEAD..origin/main"], 15000));
    const ahead = Number(await runCommand("git", ["rev-list", "--count", "origin/main..HEAD"], 15000));
    const activeRuns = await getActiveRunCount();
    const decision = decideSafeUpdate({
      enabled: true, branch, workingTreeClean: status.length === 0,
      behind: Number.isFinite(behind) ? behind : 0,
      ahead: Number.isFinite(ahead) ? ahead : 0,
      activeRuns: activeRuns === null ? 1 : activeRuns,
    });
    if (!decision.apply) {
      console.info("[AL OMDA supervisor] Auto-update deferred:", decision.reason);
      return;
    }

    const previousCommit = await runCommand("git", ["rev-parse", "HEAD"], 15000);
    updating = true;
    await stopRuntime();
    try {
      await runCommand("git", ["merge", "--ff-only", "origin/main"], 60000);
      await runPnpm(["install", "--frozen-lockfile"]);
      await runPnpm(["build"]);
      restartAttempts = 0;
      console.info("[AL OMDA supervisor] Updated successfully to", await runCommand("git", ["rev-parse", "--short", "HEAD"], 15000));
    } catch (error) {
      console.error("[AL OMDA supervisor] Update failed; rolling back:", error instanceof Error ? error.message : error);
      await runCommand("git", ["reset", "--hard", previousCommit], 30000).catch((rollbackError) => {
        console.error("[AL OMDA supervisor] Rollback failed:", rollbackError instanceof Error ? rollbackError.message : rollbackError);
      });
      await runPnpm(["install", "--frozen-lockfile"]).catch(() => undefined);
    } finally {
      updating = false;
      startRuntime();
    }
  } catch (error) {
    console.warn("[AL OMDA supervisor] Update check failed:", error instanceof Error ? error.message : error);
  } finally {
    updateInProgress = false;
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (initialUpdateTimer) clearTimeout(initialUpdateTimer);
  if (updateIntervalTimer) clearInterval(updateIntervalTimer);
  await stopRuntime();
  process.exitCode = 0;
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

console.info("[AL OMDA supervisor] Starting local Agent runtime. Crash recovery is enabled.");
if (autoUpdate) console.info("[AL OMDA supervisor] Safe auto-update is enabled; interval:", intervalHours, "hours.");
else console.info("[AL OMDA supervisor] Auto-update is disabled. Set OMDA_AGENT_AUTO_UPDATE=true to enable it.");
startRuntime();
if (autoUpdate) {
  initialUpdateTimer = setTimeout(() => { void checkAndApplyUpdate(); }, 120000);
  updateIntervalTimer = setInterval(() => { void checkAndApplyUpdate(); }, intervalMs);
}
