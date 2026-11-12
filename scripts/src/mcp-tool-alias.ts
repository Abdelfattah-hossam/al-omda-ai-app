import { createHash } from "node:crypto";

const registeredAliases = new Map<string, { serverName: string; toolName: string }>();

export function createMcpToolAlias(serverName: string, toolName: string): string {
  if (!serverName.trim() || !toolName.trim() || serverName.length > 128 || toolName.length > 128) {
    throw new Error("Invalid MCP server or tool name.");
  }
  const value = { serverName, toolName };
  const digest = createHash("sha256").update(JSON.stringify([serverName, toolName])).digest("base64url").slice(0, 22);
  const alias = "mcp_tool_" + digest;
  const existing = registeredAliases.get(alias);
  if (existing && (existing.serverName !== serverName || existing.toolName !== toolName)) {
    throw new Error("MCP tool alias collision; choose a different server or tool name.");
  }
  registeredAliases.set(alias, value);
  return alias;
}

export function parseMcpToolAlias(alias: string): { serverName: string; toolName: string } | null {
  if (!/^mcp_tool_[A-Za-z0-9_-]{22}$/.test(alias)) return null;
  const value = registeredAliases.get(alias);
  return value ? { ...value } : null;
}

export function mcpToolDisplayName(alias: string): string {
  const parsed = parseMcpToolAlias(alias);
  return parsed ? parsed.serverName + " / " + parsed.toolName : alias;
}
