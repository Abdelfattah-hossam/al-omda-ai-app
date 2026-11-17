import test from "node:test";
import assert from "node:assert/strict";
import { isAgentToolResultFailure, redactAgentToolFailureMessage } from "./agent-tool-failure.js";

test("redacts bearer tokens, provider keys and credentialed URLs from tool errors", () => {
  const message = redactAgentToolFailureMessage("Authorization: Bearer secret-token api_key=sk-or-v1-12345678901234567890 https://user:pass@example.com/path");
  assert.doesNotMatch(message, /secret-token|sk-or-v1|user:pass/);
  assert.match(message, /REDACTED/);
});

test("treats MCP isError and ordinary tool ok:false as failures", () => {
  assert.equal(isAgentToolResultFailure("mcp.call_tool", { isError: true }), true);
  assert.equal(isAgentToolResultFailure("files.write", { ok: false }), true);
});

test("does not misreport intentional HTTP status probes as tool execution failures", () => {
  assert.equal(isAgentToolResultFailure("http.request", { ok: false, status: 404 }), false);
  assert.equal(isAgentToolResultFailure("http.request", { isError: true, ok: false, status: 500 }), true);
});
