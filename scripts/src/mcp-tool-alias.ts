export function createMcpToolAlias(serverName: string, toolName: string): string {
  if (!serverName.trim() || !toolName.trim() || serverName.length > 128 || toolName.length > 128) {
    throw new Error("Invalid MCP server or tool name.");
  }
  const encoded = Buffer.from(JSON.stringify([serverName, toolName]), "utf8").toString("base64url");
  if (encoded.length > 48) throw new Error("MCP server and tool names are too long for direct model tool advertisement.");
  return "mcp_tool_" + encoded;
}

export function parseMcpToolAlias(alias: string): { serverName: string; toolName: string } | null {
  if (!alias.startsWith("mcp_tool_") || alias.length > 512) return null;
  try {
    const value = JSON.parse(Buffer.from(alias.slice("mcp_tool_".length), "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 128)) return null;
    return { serverName: value[0], toolName: value[1] };
  } catch { return null; }
}

export function mcpToolDisplayName(alias: string): string {
  const parsed = parseMcpToolAlias(alias);
  return parsed ? parsed.serverName + " / " + parsed.toolName : alias;
}
