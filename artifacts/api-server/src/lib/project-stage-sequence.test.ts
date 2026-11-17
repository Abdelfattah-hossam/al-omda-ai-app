import assert from "node:assert/strict";
import test from "node:test";
import { hasCompletedPriorProjectStages } from "./project-stage-sequence.js";

test("allows the first stage without prerequisites", () => {
  assert.equal(hasCompletedPriorProjectStages([{ state: "pending" }], 0), true);
});

test("requires every earlier stage to be approved and have a saved result", () => {
  const steps = [
    { state: "approved", result: "Deliverable one" },
    { state: "approved", result: "Deliverable two" },
    { state: "pending" },
  ];
  assert.equal(hasCompletedPriorProjectStages(steps, 2), true);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved" }, steps[1]], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "pending", result: "text" }], 1), false);
  assert.equal(hasCompletedPriorProjectStages([{ state: "approved", result: "   " }], 1), false);
});

test("rejects invalid stage indices", () => {
  const steps = [{ state: "approved", result: "done" }];
  assert.equal(hasCompletedPriorProjectStages(steps, -1), false);
  assert.equal(hasCompletedPriorProjectStages(steps, 1), false);
  assert.equal(hasCompletedPriorProjectStages(steps, 0.5), false);
});
