import test from "node:test";
import assert from "node:assert/strict";
import { mergeBrowserServerConfig, parseBrowserName } from "./browser-config.js";

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
