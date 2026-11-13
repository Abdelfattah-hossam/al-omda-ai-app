import assert from "node:assert/strict";
import { test } from "node:test";
import { createHttpFlowHistoryRecord, normalizeHttpFlowHistory } from "./httpflow-history.js";

test("HTTPFlow history removes query strings, fragments, credentials, and response contents", () => {
  const record = createHttpFlowHistoryRecord({
    id: "record-1",
    createdAt: "2026-11-13T09:00:00.000Z",
    url: "https://user:password@example.com/private/path?access_token=secret#fragment",
    method: "GET",
    roles: ["anonymous", "admin"],
    responses: [
      { role: "anonymous", status: 200, durationMs: 12.4, body: "private body text", bodyLength: 17 },
      { role: "admin", status: 403, durationMs: 25, body: "different private body", bodyLength: 22 },
    ],
    comparison: {
      sameStatus: false,
      sameBody: false,
      bodyDiff: { firstDifferenceAt: 0, snippets: [{ role: "admin", excerpt: "secret response excerpt" }] },
      headerDifferences: [{ header: "set-cookie", values: [{ role: "admin", value: "session-secret" }] }, { header: "content-type" }],
    },
  });

  assert.equal(record.target, "https://example.com/private/path");
  assert.equal(record.comparison.bodyDifferenceAt, 0);
  assert.deepEqual(record.comparison.changedHeaders, ["set-cookie", "content-type"]);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /access_token|password|private body|secret response|session-secret|fragment/);
  assert.equal(record.responses[0].bodyLength, 17);
});

test("HTTPFlow history normalization rejects unsafe targets and malformed records", () => {
  const records = normalizeHttpFlowHistory([
    { id: "ok_1", createdAt: "2026-11-13T09:00:00.000Z", target: "https://example.com/path", method: "HEAD", roles: ["user"], responses: [{ role: "user", status: 200, durationMs: 2, bodyLength: 0 }], comparison: { sameStatus: true, sameBody: true, bodyDifferenceAt: null, changedHeaders: [] } },
    { id: "bad", createdAt: "not-a-date", target: "https://example.com/path", method: "GET", roles: [], responses: [], comparison: {} },
    { id: "query", createdAt: "2026-11-13T09:00:00.000Z", target: "https://example.com/path?token=secret", method: "GET", roles: [], responses: [], comparison: {} },
    { id: "../escape", createdAt: "2026-11-13T09:00:00.000Z", target: "https://example.com/path", method: "GET", roles: [], responses: [], comparison: {} },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "ok_1");
});

test("HTTPFlow history keeps the newest bounded set of records", () => {
  const input = Array.from({ length: 150 }, (_, index) => ({
    id: "record-" + index,
    createdAt: "2026-11-13T09:00:00.000Z",
    target: "https://example.com/" + index,
    method: "OPTIONS",
    roles: [],
    responses: [],
    comparison: { sameStatus: true, sameBody: true, bodyDifferenceAt: null, changedHeaders: [] },
  }));
  assert.equal(normalizeHttpFlowHistory(input).length, 100);
});
