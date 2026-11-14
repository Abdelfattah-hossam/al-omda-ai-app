import { test } from "node:test";
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
  assert.match(result, /agent:supervisor/);
  assert.match(result, /New-Item -ItemType Directory/);
  assert.match(result, /agent\\*>> \\$logFile/);
});

test("service environment serializer keeps only safe single-line values", () => {
  assert.equal(serializeServiceEnvironment({ OMDA_AGENT_TOKEN: "abc", bad: "no", OMDA_AGENT_EXTRA: "line1\nline2" }), "OMDA_AGENT_TOKEN=abc\n");
});

test("Windows scheduled task restarts a crashed agent and runs as the signed-in user", () => {
  const result = buildWindowsTaskRegistration({ taskName: "AL OMDA AI Agent", launcherPath: "C:\\Users\\O'Neil\\Al Omda\\start-agent.ps1" });
  assert.match(result, /-RestartCount 5/);
  assert.match(result, /-RestartInterval \(New-TimeSpan -Minutes 1\)/);
  assert.match(result, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(result, /-LogonType Interactive/);
  assert.match(result, /O''Neil/);
  assert.match(result, /Start-ScheduledTask/);
});
