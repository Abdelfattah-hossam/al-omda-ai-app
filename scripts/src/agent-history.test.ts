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

test("merges missing tool calls into the existing assistant batch", () => {
  const first = { id: "call-1", type: "function", function: { name: "files.read", arguments: "{}" } };
  const second = { id: "call-2", type: "function", function: { name: "files.write", arguments: "{}" } };
  const messages: Array<Record<string, unknown>> = [{ role: "assistant", content: "", tool_calls: [first] }];
  ensureAssistantToolCallMessage(messages, [first, second]);
  assert.equal(messages.length, 1);
  assert.deepEqual((messages[0].tool_calls as unknown[]).map((call) => (call as { id: string }).id), ["call-1", "call-2"]);
});


test("does not merge a new batch into an earlier assistant tool message", () => {
  const first = { id: "call-1", type: "function", function: { name: "files.read", arguments: "{}" } };
  const second = { id: "call-2", type: "function", function: { name: "files.write", arguments: "{}" } };
  const messages: Array<Record<string, unknown>> = [
    { role: "assistant", content: "", tool_calls: [first] },
    { role: "tool", tool_call_id: "call-1", content: "{}" },
    { role: "user", content: "Continue." },
  ];
  ensureAssistantToolCallMessage(messages, [second]);
  assert.equal(messages.length, 4);
  assert.deepEqual(messages[0].tool_calls, [first]);
  assert.deepEqual(messages[3].tool_calls, [second]);
});
