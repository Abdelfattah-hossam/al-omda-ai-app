import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mergeBrowserServerConfig, mergeDesktopServerConfig, parseBrowserName } from "./browser-config.js";

test("defaults to Chromium and accepts supported browser engines", () => {
  assert.equal(parseBrowserName(undefined), "chromium");
  assert.equal(parseBrowserName("FIREFOX"), "firefox");
  assert.equal(parseBrowserName("webkit"), "webkit");
  assert.throws(() => parseBrowserName("edge"), /Browser must be/);
});

test("adds browser MCP config without removing existing servers", () => {
  const existing = JSON.stringify({ servers: [{ name: "project-tools", command: "node", args: ["./server.js"] }] });
  const result = JSON.parse(mergeBrowserServerConfig(existing, "firefox"));
  assert.equal(result.servers.length, 2);
  assert.equal(result.servers[0].name, "project-tools");
  assert.deepEqual(result.servers[1].args, ["-y", "@playwright/mcp@latest", "--browser", "firefox"]);
});

test("updates only the browser server when it already exists", () => {
  const existing = JSON.stringify({ servers: [{ name: "playwright-browser", command: "npx", args: ["old"] }, { name: "other", command: "node", args: [] }] });
  const result = JSON.parse(mergeBrowserServerConfig(existing, "webkit"));
  assert.equal(result.servers.length, 2);
  assert.deepEqual(result.servers[0].args, ["-y", "@playwright/mcp@latest", "--browser", "webkit"]);
  assert.equal(result.servers[1].name, "other");
});

test("refuses malformed config instead of overwriting it", () => {
  assert.throws(() => mergeBrowserServerConfig("{broken", "chromium"), /valid JSON/);
  assert.throws(() => mergeBrowserServerConfig(JSON.stringify({ servers: "no" }), "chromium"), /servers array/);
});

test("adds desktop MCP server while preserving browser and project servers", () => {
  const existing = JSON.stringify({ servers: [
    { name: "playwright-browser", command: "npx", args: ["-y", "@playwright/mcp@latest", "--browser", "chromium"] },
    { name: "project-tools", command: "node", args: ["./tools/server.js"] },
  ] });
  const result = JSON.parse(mergeDesktopServerConfig(existing));
  assert.equal(result.servers.length, 3);
  assert.equal(result.servers[0].name, "playwright-browser");
  assert.equal(result.servers[1].name, "project-tools");
  assert.deepEqual(result.servers[2].args, ["-y", "@zavora-ai/computer-use-mcp"]);
});

test("updates the existing desktop server without duplicating it", () => {
  const existing = JSON.stringify({ servers: [{ name: "computer-use", command: "npx", args: ["old"] }] });
  const result = JSON.parse(mergeDesktopServerConfig(existing));
  assert.equal(result.servers.length, 1);
  assert.deepEqual(result.servers[0].args, ["-y", "@zavora-ai/computer-use-mcp"]);
});
