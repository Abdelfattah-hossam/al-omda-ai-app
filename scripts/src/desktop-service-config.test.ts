import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { buildLaunchAgentPlist, buildSystemdUserService, buildWindowsAgentLauncher, buildWindowsTaskRegistration, serializeServiceEnvironment } from "./desktop-service-config.js";

test("systemd user service starts the supervisor and restarts failures", () => {
  const result = buildSystemdUserService({ repoRoot: "/home/user/My Project", path: "/usr/bin:/home/user/.local/bin", environment: { OMDA_AGENT_TOKEN: "safe-token" } });
  assert.match(result, /agent:supervisor/);
  assert.match(result, /Restart=on-failure/);
  assert.match(result, /OMDA_AGENT_TOKEN=safe-token/);
  assert.match(result, /WorkingDirectory="\/home\/user\/My Project"/);
});

test("launch agent uses escaped plist values and starts at login", () => {
  const result = buildLaunchAgentPlist({ label: "ai.alomda.agent", repoRoot: "/Users/A&B/Project", path: "/opt/homebrew/bin", environment: { OMDA_AGENT_TOKEN: "token<&" }, logPath: "/Users/A&B/agent.log" });
  assert.match(result, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(result, /<key>KeepAlive<\/key><true\/>/);
  assert.match(result, /A&amp;B/);
  assert.match(result, /token&lt;&amp;/);
});

test("Windows launcher safely quotes paths with apostrophes", () => {
  const result = buildWindowsAgentLauncher({ repoRoot: "C:\\Users\\O'Neil\\Project", envFile: "C:\\Users\\O'Neil\\agent.env", logFile: "C:\\Users\\O'Neil\\logs\\agent.log" });
  assert.match(result, /O''Neil/);
  assert.match(result, /^\$logFile = 'C:\\Users\\O''Neil\\logs\\agent\.log'$/m);
  assert.match(result, /agent:supervisor/);
  assert.match(result, /if \(\$logDirectory\) \{ New-Item -ItemType Directory/);
  assert.match(result, /agent:supervisor 2>&1 \| ForEach-Object/);
  assert.match(result, /-ge 5MB/);
  assert.match(result, /System\.IO\.Directory\]::GetFiles/);
  assert.match(result, /StartsWith\(\$archiveName/);
  assert.match(result, /ErrorActionPreference = 'Continue'/);
  assert.match(result, /Select-Object -Skip 3/);
  assert.match(result, /Add-Content -LiteralPath \$logFile/);
});

test("service environment serializer keeps only safe single-line values", () => {
  assert.equal(serializeServiceEnvironment({ OMDA_AGENT_TOKEN: "abc", bad: "no", OMDA_AGENT_EXTRA: "line1\nline2" }), "OMDA_AGENT_TOKEN=abc\n");
});

test("Windows scheduled task restarts a crashed agent and runs as the signed-in user", () => {
  const result = buildWindowsTaskRegistration({ taskName: "Munjizly Agent", launcherPath: "C:\\Users\\O'Neil\\Al Omda\\start-agent.ps1" });
  assert.match(result, /-RestartCount 5/);
  assert.match(result, /-RestartInterval \(New-TimeSpan -Minutes 1\)/);
  assert.match(result, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(result, /-LogonType Interactive/);
  assert.match(result, /O''Neil/);
  assert.match(result, /Start-ScheduledTask/);
});


const pwshProbe = spawnSync("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], { encoding: "utf8" });
const hasPowerShell = !pwshProbe.error && pwshProbe.status === 0;

test("Windows launcher smoke test rotates logs, captures output, and propagates exit status", { skip: !hasPowerShell }, () => {
  const root = mkdtempSync(join(tmpdir(), "omda-windows-launcher-"));
  try {
    const bin = join(root, "bin");
    const logs = join(root, "Operator[1]");
    const launcher = join(root, "start-agent.ps1");
    const envFile = join(root, "agent.env");
    const logFile = join(logs, "agent.log");
    const fakePnpm = join(bin, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
    const repoRoot = join(root, "project");
    mkdirSync(bin, { recursive: true });
    mkdirSync(repoRoot, { recursive: true });
    writeFileSync(envFile, "OMDA_AGENT_TOKEN=test-token\n");
    if (process.platform === "win32") {
      writeFileSync(fakePnpm, "@echo off\r\necho stdout-line\r\necho stderr-line 1>&2\r\nexit /b 7\r\n");
    } else {
      writeFileSync(fakePnpm, "#!/bin/sh\nprintf \'stdout-line\\n\'\nprintf \'stderr-line\\n\' >&2\nexit 7\n");
      chmodSync(fakePnpm, 0o755);
    }
    mkdirSync(logs, { recursive: true });
    for (let index = 0; index < 3; index++) writeFileSync(join(logs, "agent.log.2025010" + (index + 1) + "-000000-000.bak"), "old-" + index);
    writeFileSync(logFile, "x".repeat(5 * 1024 * 1024 + 1));
    writeFileSync(launcher, buildWindowsAgentLauncher({ repoRoot, envFile, logFile }));
    const run = spawnSync("pwsh", ["-NoProfile", "-File", launcher], {
      cwd: root,
      env: { ...process.env, PATH: bin + (process.platform === "win32" ? ";" : ":") + process.env.PATH },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(run.status, 7, run.stderr || run.stdout);
    const output = readFileSync(logFile, "utf8");
    assert.match(output, /stdout-line/);
    assert.match(output, /stderr-line/);
    const archives = readdirSync(logs).filter((name) => name.endsWith(".bak"));
    assert.equal(archives.length, 3);
    assert.ok(archives.some((name) => readFileSync(join(logs, name), "utf8").length === 5 * 1024 * 1024 + 1));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
