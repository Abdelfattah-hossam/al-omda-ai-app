import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildLaunchAgentPlist, buildSystemdUserService, buildWindowsAgentLauncher, buildWindowsTaskRegistration, serializeServiceEnvironment } from "./desktop-service-config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const platform = process.platform;
const home = homedir();
const label = "ai.alomda.agent";
const taskName = "AL OMDA AI Agent";
const appOrigin = "https://al-omda-ai-app.abdelfattahhossam1.workers.dev";

function paths() {
  if (platform === "darwin") {
    const dir = join(home, "Library", "LaunchAgents");
    return { dir, service: join(dir, label + ".plist"), dataDir: join(home, "Library", "Application Support", "Al Omda"), logs: join(home, "Library", "Logs", "Al Omda") };
  }
  if (platform === "win32") {
    const dir = join(process.env.APPDATA || join(home, "AppData", "Roaming"), "AlOmda");
    return { dir, service: join(dir, "start-agent.ps1"), register: join(dir, "register-task.ps1"), dataDir: dir, logs: join(dir, "logs") };
  }
  const dir = join(home, ".config", "systemd", "user");
  const dataDir = join(home, ".config", "al-omda");
  return { dir, service: join(dir, "al-omda-agent.service"), dataDir, logs: join(home, ".local", "state", "al-omda") };
}
const locations = paths();
const envFile = join(locations.dataDir, "agent.env");

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true, shell: false, env: process.env });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(command + " exited with code " + code)));
  });
}
function parseEnvironment(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (/^[A-Z][A-Z0-9_]{1,80}$/.test(key)) result[key] = line.slice(index + 1);
  }
  return result;
}
async function ensureEnvironment(): Promise<Record<string, string>> {
  await mkdir(locations.dataDir, { recursive: true, mode: 0o700 });
  let current: Record<string, string> = {};
  try { current = parseEnvironment(await readFile(envFile, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const environment = {
    ...current,
    OMDA_AGENT_TOKEN: current.OMDA_AGENT_TOKEN || randomBytes(32).toString("hex"),
    OMDA_AGENT_WORKSPACE: current.OMDA_AGENT_WORKSPACE || repoRoot,
    OMDA_AGENT_EXECUTION: current.OMDA_AGENT_EXECUTION || "disabled",
    OMDA_AGENT_PORT: current.OMDA_AGENT_PORT || "4318",
    OMDA_AGENT_APP_ORIGINS: current.OMDA_AGENT_APP_ORIGINS || appOrigin,
    OMDA_AGENT_MCP_COMMANDS: current.OMDA_AGENT_MCP_COMMANDS || "node,npx",
  };
  await writeFile(envFile, serializeServiceEnvironment(environment), { encoding: "utf8", mode: 0o600 });
  if (platform !== "win32") await chmod(envFile, 0o600);
  return environment;
}
async function install(): Promise<void> {
  const environment = await ensureEnvironment();
  await mkdir(locations.dir, { recursive: true, mode: 0o700 });
  await mkdir(locations.logs, { recursive: true, mode: 0o700 });
  if (platform === "linux") {
    const content = buildSystemdUserService({ repoRoot, path: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", environment });
    await writeFile(locations.service, content, { encoding: "utf8", mode: 0o600 });
    await run("systemctl", ["--user", "daemon-reload"]);
    await run("systemctl", ["--user", "enable", "--now", "al-omda-agent.service"]);
  } else if (platform === "darwin") {
    const content = buildLaunchAgentPlist({ label, repoRoot, path: process.env.PATH || "/usr/bin:/bin", environment, logPath: join(locations.logs, "agent.log") });
    await writeFile(locations.service, content, { encoding: "utf8", mode: 0o600 });
    await chmod(locations.service, 0o600);
    await run("launchctl", ["bootout", "gui/" + process.getuid?.() + "/" + label]).catch(() => undefined);
    await run("launchctl", ["bootstrap", "gui/" + process.getuid?.(), locations.service]);
  } else if (platform === "win32") {
    const content = buildWindowsAgentLauncher({ repoRoot, envFile });
    await writeFile(locations.service, content, { encoding: "utf8", mode: 0o600 });
    const username = process.env.USERNAME?.trim();
    if (!username) throw new Error("Could not determine the current Windows account to secure the local token file.");
    await run("icacls.exe", [envFile, "/inheritance:r", "/grant:r", username + ":(F)", "*S-1-5-18:(F)"]);
    const registerScript = locations.register;
    if (!registerScript) throw new Error("Windows task registration path is unavailable.");
    const registration = buildWindowsTaskRegistration({ taskName, launcherPath: locations.service });
    await writeFile(registerScript, registration, { encoding: "utf8", mode: 0o600 });
    await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", registerScript]);
  } else {
    throw new Error("Desktop companion auto-start is supported on Windows, macOS, and Linux only.");
  }
  console.log("AL OMDA Agent service installed and started for the current user.");
  console.log("Workspace:", environment.OMDA_AGENT_WORKSPACE);
  console.log("Local token saved privately at:", envFile);
  console.log("Terminal execution remains disabled. Edit the environment file to configure local model providers, then restart the service.");
}
async function uninstall(): Promise<void> {
  if (platform === "linux") {
    await run("systemctl", ["--user", "disable", "--now", "al-omda-agent.service"]).catch(() => undefined);
    await rm(locations.service, { force: true });
    await run("systemctl", ["--user", "daemon-reload"]);
  } else if (platform === "darwin") {
    await run("launchctl", ["bootout", "gui/" + process.getuid?.() + "/" + label]).catch(() => undefined);
    await rm(locations.service, { force: true });
  } else if (platform === "win32") {
    await run("schtasks.exe", ["/End", "/TN", taskName]).catch(() => undefined);
    await run("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]).catch(() => undefined);
    await rm(locations.service, { force: true });
  } else throw new Error("Unsupported platform.");
  console.log("AL OMDA Agent auto-start removed. The local token and environment file were preserved:", envFile);
}
async function status(): Promise<void> {
  if (platform === "linux") await run("systemctl", ["--user", "status", "al-omda-agent.service", "--no-pager"]);
  else if (platform === "darwin") await run("launchctl", ["print", "gui/" + process.getuid?.() + "/" + label]);
  else if (platform === "win32") await run("schtasks.exe", ["/Query", "/TN", taskName, "/V", "/FO", "LIST"]);
  else throw new Error("Unsupported platform.");
}
async function restart(): Promise<void> {
  if (platform === "linux") await run("systemctl", ["--user", "restart", "al-omda-agent.service"]);
  else if (platform === "darwin") {
    await run("launchctl", ["kickstart", "-k", "gui/" + process.getuid?.() + "/" + label]);
  } else if (platform === "win32") {
    await run("schtasks.exe", ["/End", "/TN", taskName]).catch(() => undefined);
    await run("schtasks.exe", ["/Run", "/TN", taskName]);
  } else throw new Error("Unsupported platform.");
}
const action = process.argv[2] || "help";
try {
  if (action === "install") await install();
  else if (action === "uninstall") await uninstall();
  else if (action === "status") await status();
  else if (action === "restart") await restart();
  else console.log("Usage: pnpm --filter @workspace/scripts desktop:service -- <install|uninstall|status|restart>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
