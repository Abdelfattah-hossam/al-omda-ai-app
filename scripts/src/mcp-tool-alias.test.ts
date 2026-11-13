import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createMcpToolAlias, mcpToolDisplayName, parseMcpToolAlias } from "./mcp-tool-alias.js";

test("encodes MCP server and tool names into a safe function alias", () => {
  const alias = createMcpToolAlias("desktop-tools", "computer.screenshot");
  assert.match(alias, /^mcp_tool_[A-Za-z0-9_-]+$/);
  assert.deepEqual(parseMcpToolAlias(alias), { serverName: "desktop-tools", toolName: "computer.screenshot" });
  assert.equal(mcpToolDisplayName(alias), "desktop-tools / computer.screenshot");
  assert.ok(alias.length <= 64);
});

test("rejects malformed aliases and invalid names", () => {
  assert.equal(parseMcpToolAlias("mcp.tool.not-base64-json"), null);
  assert.equal(parseMcpToolAlias("mcp.tool." + "a".repeat(600)), null);
  assert.throws(() => createMcpToolAlias("", "tool"), /Invalid MCP/);
  assert.throws(() => createMcpToolAlias("s".repeat(129), "tool"), /Invalid MCP/);
});
