import assert from "node:assert/strict";
import test from "node:test";
import { hasCompletedPriorProjectStages } from "./project-stage-sequence.js";

test("allows the first stage without prerequisites", () => {
  assert.equal(hasCompletedPriorProjectStages([{ state: "pending" }], 0), true);
});

test("requires every earlier stage to be approved and have a saved result", () => {
  const steps = [
    { state: "approved", result: "Deliverable one", executionStatus: "succeeded" },
    { state: "approved", result: "Deliverable two", executionStatus: "succeeded" },
    { state: "pending" },
  ];
  assert.equal(hasCompletedPriorProjectStages(steps, 2), true);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved" }, steps[1]], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved", result: "saved but failed", executionStatus: "failed", executedAt: "2026-11-17T10:00:00Z" }], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved", result: "status missing" }], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "pending", result: "text", executedAt: "2026-11-17T10:00:00Z" }], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved", result: "   ", executedAt: "2026-11-17T10:00:00Z" }], 1), false);
});

test("accepts legacy completed stages with a saved result and execution timestamp", () => {
  const legacyStep = {
    state: "approved",
    result: "Saved legacy deliverable",
    executedAt: "2026-11-17T10:00:00Z",
  };
  assert.equal(hasCompletedPriorProjectStages([legacyStep, { state: "pending" }], 1), true);
});

test("rejects invalid stage indices", () => {
  const steps = [{ state: "approved", result: "done", executionStatus: "succeeded" }];
  assert.equal(hasCompletedPriorProjectStages(steps, -1), false);
  assert.equal(hasCompletedPriorProjectStages(steps, 1), false);
  assert.equal(hasCompletedPriorProjectStages(steps, 0.5), false);
});
