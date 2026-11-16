import assert from "node:assert/strict";
import test from "node:test";
import { buildBoundedChatContext } from "./chat-context";

test("keeps the newest messages within the message-count limit", () => {
  const result = buildBoundedChatContext([
    { role: "user", content: "old" },
    { role: "assistant", content: "middle" },
    { role: "user", content: "latest" },
  ], { maxMessages: 2 });
  assert.deepEqual(result, [
    { role: "assistant", content: "middle" },
    { role: "user", content: "latest" },
  ]);
});

test("bounds every message and aggregate context while retaining the latest request", () => {
  const result = buildBoundedChatContext([
    { role: "user", content: "a".repeat(20) },
    { role: "assistant", content: "b".repeat(20) },
    { role: "user", content: "c".repeat(20) },
  ], { maxMessageChars: 12, maxTotalChars: 20 });
  assert.ok(result.every((message) => message.content.length <= 12));
  assert.ok(result.reduce((sum, message) => sum + message.content.length, 0) <= 20);
  assert.equal(result.at(-1)?.content, "c".repeat(12));
});

test("returns an empty context for empty input and clamps invalid limits", () => {
  assert.deepEqual(buildBoundedChatContext([]), []);
  assert.deepEqual(buildBoundedChatContext([{ role: "user", content: "hello" }], { maxTotalChars: 0 }), [
    { role: "user", content: "hello" },
  ]);
});
