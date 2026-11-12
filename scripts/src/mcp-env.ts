const INHERITED_MCP_ENV = [
  "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP",
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
  "XAUTHORITY", "SWAYSOCK", "HYPRLAND_INSTANCE_SIGNATURE",
  "COMPUTER_USE_PROFILE", "COMPUTER_USE_STATUS_CARD",
] as const;

export function buildMcpEnvironment(
  source: Record<string, string | undefined>,
  explicitlyAllowed: string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of INHERITED_MCP_ENV) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  for (const key of explicitlyAllowed) {
    if (!/^[A-Z_][A-Z0-9_]{0,80}$/.test(key)) continue;
    const value = source[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  return result;
}
