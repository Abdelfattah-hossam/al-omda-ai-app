import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getDelegationRunStatus } from "./agent-delegation-status.js";

test("reports completed only when every specialist succeeds", () => {
  assert.equal(getDelegationRunStatus(["completed", "completed"]), "completed");
});

test("reports running while any specialist is non-terminal", () => {
  assert.equal(getDelegationRunStatus(["pending", "pending"]), "running");
  assert.equal(getDelegationRunStatus(["completed", "running"]), "running");
  assert.equal(getDelegationRunStatus(["failed", "pending"]), "running");
});

test("reports partial only for terminal mixed outcomes", () => {
  assert.equal(getDelegationRunStatus(["completed", "failed"]), "partial");
  assert.equal(getDelegationRunStatus(["completed", "completed", "failed"]), "partial");
});

test("reports failed when no specialist completes", () => {
  assert.equal(getDelegationRunStatus(["failed", "failed"]), "failed");
  assert.equal(getDelegationRunStatus([]), "failed");
});
