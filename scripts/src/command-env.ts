const COMMAND_ENV_KEYS = [
  "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
  "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT",
  "TEMP", "TMP", "TMPDIR",
  "LANG", "LC_ALL", "TERM", "COLORTERM",
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY",
] as const;

export function buildCommandEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = { CI: "1", NO_COLOR: "1" };
  for (const key of COMMAND_ENV_KEYS) {
    const value = source[key] ?? (key === "PATH" ? source.Path : undefined);
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  return result;
}
