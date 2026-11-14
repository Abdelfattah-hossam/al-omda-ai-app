export type ServiceEnvironment = Record<string, string>;

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function systemdQuote(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "").replace(/\r/g, "") + '"';
}
function psQuote(value: string): string {
  return "'" + value.replace(/'/g, "''").replace(/[\r\n]/g, "") + "'";
}

export function buildSystemdUserService(options: { repoRoot: string; path: string; environment: ServiceEnvironment }): string {
  const env = Object.entries(options.environment).map(([key, value]) => "Environment=" + systemdQuote(key + "=" + value)).join("\n");
  return [
    "[Unit]", "Description=AL OMDA AI Local Agent", "After=network-online.target", "",
    "[Service]", "Type=simple", "WorkingDirectory=" + systemdQuote(options.repoRoot),
    "Environment=" + systemdQuote("PATH=" + (options.path || "/usr/local/bin:/usr/bin:/bin")),
    env, "ExecStart=/usr/bin/env pnpm --filter @workspace/scripts agent:supervisor",
    "Restart=on-failure", "RestartSec=5", "KillMode=mixed", "",
    "[Install]", "WantedBy=default.target", "",
  ].filter(Boolean).join("\n");
}

export function buildLaunchAgentPlist(options: { label: string; repoRoot: string; path: string; environment: ServiceEnvironment; logPath: string }): string {
  const env = Object.entries({ PATH: options.path, ...options.environment }).map(([key, value]) =>
    "<key>" + xml(key) + "</key><string>" + xml(value) + "</string>").join("");
  const args = ["/usr/bin/env", "pnpm", "--filter", "@workspace/scripts", "agent:supervisor"];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    "<key>Label</key><string>" + xml(options.label) + "</string>",
    "<key>ProgramArguments</key><array>" + args.map((arg) => "<string>" + xml(arg) + "</string>").join("") + "</array>",
    "<key>WorkingDirectory</key><string>" + xml(options.repoRoot) + "</string>",
    "<key>EnvironmentVariables</key><dict>" + env + "</dict>",
    "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>",
    "<key>StandardOutPath</key><string>" + xml(options.logPath) + "</string>",
    "<key>StandardErrorPath</key><string>" + xml(options.logPath) + "</string>",
    "</dict></plist>", "",
  ].join("\n");
}

export function buildWindowsAgentLauncher(options: { repoRoot: string; envFile: string; logFile: string }): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$envFile = " + psQuote(options.envFile),
    "$logFile = " + psQuote(options.logFile),
    "Get-Content -LiteralPath $envFile | ForEach-Object {",
    "  if ($_ -match '^([A-Z0-9_]+)=(.*)

export function serializeServiceEnvironment(environment: ServiceEnvironment): string {
  return Object.entries(environment)
    .filter(([key, value]) => /^[A-Z][A-Z0-9_]{1,80}$/.test(key) && !/[\r\n]/.test(value))
    .map(([key, value]) => key + "=" + value)
    .join("\n") + "\n";
}

export function buildWindowsTaskRegistration(options: { taskName: string; launcherPath: string }): string {
  const launcherArgs = "-NoProfile -ExecutionPolicy Bypass -File \"" + options.launcherPath.replace(/"/g, "\"\"") + "\"";
  return [
    "$ErrorActionPreference = 'Stop'",
    "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument " + psQuote(launcherArgs),
    "$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew",
    "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited",
    "Register-ScheduledTask -TaskName " + psQuote(options.taskName) + " -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null",
    "Start-ScheduledTask -TaskName " + psQuote(options.taskName),
    "",
  ].join("\n");
}
) { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }",
    "}",
    "$logDirectory = Split-Path -Parent $logFile",
    "New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null",
    "Set-Location -LiteralPath " + psQuote(options.repoRoot),
    "& pnpm --filter @workspace/scripts agent:supervisor *>> $logFile",
    "exit $LASTEXITCODE", "",
  ].join("\n");
}

export function serializeServiceEnvironment(environment: ServiceEnvironment): string {
  return Object.entries(environment)
    .filter(([key, value]) => /^[A-Z][A-Z0-9_]{1,80}$/.test(key) && !/[\r\n]/.test(value))
    .map(([key, value]) => key + "=" + value)
    .join("\n") + "\n";
}

export function buildWindowsTaskRegistration(options: { taskName: string; launcherPath: string }): string {
  const launcherArgs = "-NoProfile -ExecutionPolicy Bypass -File \"" + options.launcherPath.replace(/"/g, "\"\"") + "\"";
  return [
    "$ErrorActionPreference = 'Stop'",
    "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument " + psQuote(launcherArgs),
    "$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew",
    "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited",
    "Register-ScheduledTask -TaskName " + psQuote(options.taskName) + " -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null",
    "Start-ScheduledTask -TaskName " + psQuote(options.taskName),
    "",
  ].join("\n");
}
