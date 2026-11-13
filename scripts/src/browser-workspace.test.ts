import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertBrowserUrlAllowed, normalizeBrowserHost, normalizeBrowserWorkspacePolicy } from "./browser-workspace.js";

test("normalizes exact hostnames and rejects wildcard or URL input", () => {
  assert.equal(normalizeBrowserHost("Example.COM"), "example.com");
  assert.throws(() => normalizeBrowserHost("https://example.com/path"), /exact hostname/);
  assert.throws(() => normalizeBrowserHost("*.example.com"), /wildcards/);
  assert.throws(() => normalizeBrowserHost("example.com:8443"), /exact hostname/);
});
test("normalizes and deduplicates browser workspace permissions", () => {
  assert.deepEqual(normalizeBrowserWorkspacePolicy({ allowedHosts: ["Example.com", "example.com"] }), { version: 1, allowedHosts: ["example.com"] });
  assert.throws(() => normalizeBrowserWorkspacePolicy({ allowedHosts: Array(101).fill("example.com") }), /100 hostnames/);
});
test("blocks direct browser navigation to sites not explicitly allowed", () => {
  const policy = normalizeBrowserWorkspacePolicy({ allowedHosts: ["docs.example.com"] });
  assertBrowserUrlAllowed("playwright-browser", "browser_navigate", { url: "https://docs.example.com/guide" }, policy);
  assert.throws(() => assertBrowserUrlAllowed("playwright-browser", "browser_navigate", { url: "https://evil.example" }, policy), /navigation blocked/);
  assert.throws(() => assertBrowserUrlAllowed("playwright-browser", "browser_navigate", {}, policy), /explicit URL/);
});
test("requires at least one approved site before other browser actions", () => {
  assert.throws(() => assertBrowserUrlAllowed("playwright-browser", "browser_click", { selector: "button" }, normalizeBrowserWorkspacePolicy({})), /until at least one site/);
  assert.doesNotThrow(() => assertBrowserUrlAllowed("playwright-browser", "browser_click", { selector: "button" }, normalizeBrowserWorkspacePolicy({ allowedHosts: ["docs.example.com"] })));
});
test("does not apply browser site policy to unrelated MCP servers", () => {
  assert.doesNotThrow(() => assertBrowserUrlAllowed("project-tools", "navigate", { url: "https://other.example" }, normalizeBrowserWorkspacePolicy({})));
});
