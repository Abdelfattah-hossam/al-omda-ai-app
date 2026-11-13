import { test } from "node:test";
import { strict as assert } from "node:assert";
import { compareHttpRoleResponses, redactResponseHeaders } from "./http-diff.js";

test("redacts authentication and session response headers", () => {
  const headers = redactResponseHeaders({
    "content-type": "application/json",
    "set-cookie": "session=private",
    "x-auth-token": "secret",
    "x-request-id": "req-1",
  });
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["set-cookie"], "[REDACTED]");
  assert.equal(headers["x-auth-token"], "[REDACTED]");
  assert.equal(headers["x-request-id"], "req-1");
});

test("compares status, body, and differing headers across roles", () => {
  const result = compareHttpRoleResponses([
    { role: "anonymous", status: 401, body: '{"error":"login"}', headers: { "content-type": "application/json", "cache-control": "private" }, durationMs: 10 },
    { role: "user", status: 200, body: '{"name":"user"}', headers: { "content-type": "application/json", "cache-control": "private" }, durationMs: 12 },
    { role: "admin", status: 200, body: '{"name":"admin"}', headers: { "content-type": "application/json", "cache-control": "no-store" }, durationMs: 14 },
  ]);
  assert.equal(result.sameStatus, false);
  assert.equal(result.sameBody, false);
  assert.deepEqual(result.statuses.map((item) => item.status), [401, 200, 200]);
  assert.equal(result.headerDifferences.length, 1);
  assert.equal(result.headerDifferences[0].header, "cache-control");
  assert.equal(result.bodyDiff.same, false);
  assert.equal(result.bodyDiff.snippets.length, 3);
});

test("reports identical responses without a diff excerpt", () => {
  const response = { role: "user", status: 200, body: "same", headers: {}, durationMs: 5 };
  const result = compareHttpRoleResponses([response, { ...response, role: "admin" }]);
  assert.equal(result.sameStatus, true);
  assert.equal(result.sameBody, true);
  assert.equal(result.bodyDiff.firstDifferenceAt, null);
  assert.equal(result.bodyDiff.snippets.length, 0);
});
