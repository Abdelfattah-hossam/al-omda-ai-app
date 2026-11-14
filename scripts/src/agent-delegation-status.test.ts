import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getDelegationRunStatus } from "./agent-delegation-status.js";

test("reports completed only when every specialist succeeds", () => {
  assert.equal(getDelegationRunStatus(["completed", "completed"]), "completed");
});

test("reports partial when specialist outcomes are mixed", () => {
  assert.equal(getDelegationRunStatus(["completed", "failed"]), "partial");
  assert.equal(getDelegationRunStatus(["completed", "running"]), "partial");
});

test("reports failed when no specialist completes", () => {
  assert.equal(getDelegationRunStatus(["failed", "failed"]), "failed");
  assert.equal(getDelegationRunStatus([]), "failed");
});
