import assert from "node:assert/strict";
import test from "node:test";
import { buildBoundedChatContext, combineReplyAndPlan, hasConversationUpdatedAtChanged, truncateTextAtCodePointBoundary, truncateTextFromStartAtCodePointBoundary, truncateTextWithEllipsis } from "./chat-context";

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
    { role: "user", content: "o" },
  ]);
});

test("truncates without splitting a surrogate pair", () => {
  assert.equal(truncateTextAtCodePointBoundary("abc😀tail", 4), "abc");
  assert.equal(truncateTextAtCodePointBoundary("abc😀tail", 5), "abc😀");
});

test("adds an ellipsis only when text exceeds the available budget", () => {
  assert.equal(truncateTextWithEllipsis("abc", 3), "abc");
  assert.equal(truncateTextWithEllipsis("abc😀tail", 5), "abc…");
  assert.equal(truncateTextWithEllipsis("abc😀tail", 6), "abc😀…");
  assert.equal(truncateTextWithEllipsis("abc", 0), "");
});

test("retains a newest image-only user message so its attachment stays on the correct turn", () => {
  const result = buildBoundedChatContext([
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
    { role: "user", content: "" },
  ]);
  assert.deepEqual(result.at(-1), { role: "user", content: "" });
  assert.equal(result.length, 3);
});

test("skips whitespace-only fragments at the aggregate context boundary", () => {
  const result = buildBoundedChatContext([
    { role: "user", content: "a".repeat(10) },
    { role: "assistant", content: "b".repeat(9) + "\n" },
    { role: "user", content: "newer" },
  ], { maxTotalChars: 6 });
  assert.deepEqual(result, [{ role: "user", content: "newer" }]);
  assert.ok(result.every((message) => message.content.trim().length > 0));
});

test("chat sync detects changed deliverables but ignores per-device blob URLs", async () => {
  const { getChatMessageSyncSignature } = await import("./chat-context");
  const shared = {
    role: "assistant" as const,
    content: "The workbook is ready.",
    spreadsheetData: { title: "Report", columns: ["Amount"], rows: [[10]] },
    documentData: { title: "Doc", paragraphs: ["A"], columns: [], rows: [] },
    presentationData: { title: "Slides", slides: [{ title: "Intro", bullets: ["A"] }] },
    sourceData: { title: "Source", name: "main.ts", language: "ts", code: "export {}" },
    appData: { title: "App", html: "<main/>" },
    taskId: "task-1",
    taskTitle: "Build app",
  };
  const local = [{ ...shared, attachment: { name: "report.xlsx", url: "blob:local-device-url" } }];
  const remote = [{ ...shared, attachment: { name: "report.xlsx", url: "blob:other-device-url" } }];
  const signature = (items: typeof local) => getChatMessageSyncSignature(items);
  assert.equal(signature(local), signature(remote));
  const transientRemote = { ...remote[0], provider: "different model", agentPending: { pending: true }, spreadsheetData: { rows: [[10]], columns: ["Amount"], title: "Report" } };
  assert.equal(signature(local), getChatMessageSyncSignature([transientRemote]));
  assert.notEqual(signature(local), signature([{ ...remote[0], spreadsheetData: { ...remote[0].spreadsheetData, rows: [[20]] } }]));
});

test("truncates from the start without beginning inside an emoji surrogate pair", () => {
  assert.equal(truncateTextFromStartAtCodePointBoundary("abc😀d", 2), "d");
  assert.equal(truncateTextFromStartAtCodePointBoundary("abc😀d", 3), "😀d");
});

test("trims trailing whitespace before deciding whether an ellipsis is needed", () => {
  assert.equal(truncateTextWithEllipsis("abc   ", 4), "abc");
});

test("reserves visible space for the assistant reply when a plan is long", () => {
  const combined = combineReplyAndPlan("Here is the key result.", "P".repeat(9000), 100);
  assert.ok(combined.startsWith("Here is the key result."));
  assert.ok(combined.length <= 100);
  assert.ok(combined.includes("P"));
});

test("uses available space efficiently when the plan is short", () => {
  assert.equal(combineReplyAndPlan("A concise answer.", "A short plan.", 100), "A concise answer.A short plan.");
});

test("per-message tail truncation never starts inside an emoji surrogate pair", () => {
  const result = buildBoundedChatContext([
    { role: "user", content: "a".repeat(7) + "😀" + "b".repeat(7) },
  ], { maxMessageChars: 8 });
  const content = result[0].content;
  assert.equal(content, "b".repeat(7));
  assert.doesNotMatch(content, /^[\uDC00-\uDFFF]/);
  assert.doesNotMatch(content, /[\uD800-\uDBFF]$/);
});

test("conversation payloads are fetched only when the persisted revision changes", () => {
  assert.equal(hasConversationUpdatedAtChanged("2026-11-16T10:00:00Z", "2026-11-16T10:00:00Z"), false);
  assert.equal(hasConversationUpdatedAtChanged("2026-11-16T10:00:01Z", "2026-11-16T10:00:00Z"), true);
  assert.equal(hasConversationUpdatedAtChanged("", "2026-11-16T10:00:00Z"), true);
  assert.equal(hasConversationUpdatedAtChanged("", ""), false);
  assert.equal(hasConversationUpdatedAtChanged("2026-11-16T10:00:00Z", ""), true);
});

test("conversation list comparison ignores unrelated large message payloads", () => {
  const current = [{ id: "a", title: "Chat", updated_at: "2026-11-17T10:00:00Z" }];
  const unchanged = [{ id: "a", title: "Chat", updated_at: "2026-11-17T10:00:00Z" }];
  const changed = [{ id: "a", title: "Renamed", updated_at: "2026-11-17T10:00:00Z" }];
  assert.equal(hasConversationListChanged(current, unchanged), false);
  assert.equal(hasConversationListChanged(current, changed), true);
  assert.equal(hasConversationListChanged(current, []), true);
});
