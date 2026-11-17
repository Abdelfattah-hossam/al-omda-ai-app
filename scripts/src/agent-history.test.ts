import test from "node:test";
import assert from "node:assert/strict";
import { ensureAssistantToolCallMessage } from "./agent-history.js";

test("adds a missing assistant tool_calls message before synthetic tool results", () => {
  const call = { id: "call-1", type: "function", function: { name: "files.write", arguments: "{}" } };
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: "Create a file." }];
  ensureAssistantToolCallMessage(messages, [call]);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, "assistant");
  assert.deepEqual(messages[1].tool_calls, [call]);
});

test("does not duplicate tool calls already present in assistant history", () => {
  const call = { id: "call-1", type: "function", function: { name: "files.write", arguments: "{}" } };
  const messages: Array<Record<string, unknown>> = [{ role: "assistant", content: "", tool_calls: [call] }];
  ensureAssistantToolCallMessage(messages, [call]);
  assert.equal(messages.length, 1);
});
