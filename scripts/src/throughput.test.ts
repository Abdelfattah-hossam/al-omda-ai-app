import { test } from "node:test";
import { strict as assert } from "node:assert";
import { addThroughputSample, calculateTokensPerSecond, createThroughputAccumulator } from "./throughput.js";

test("aggregates only matched completion-token and generation-duration samples", () => {
  const result = createThroughputAccumulator();
  addThroughputSample(result, 100, 1000);
  addThroughputSample(result, 50, 500);
  assert.equal(calculateTokensPerSecond(result), 100);
});

test("returns unknown when any contributing turn has missing usage metadata", () => {
  const result = createThroughputAccumulator();
  addThroughputSample(result, 20, 1000);
  addThroughputSample(result, null, 500);
  assert.equal(calculateTokensPerSecond(result), null);
});

test("returns unknown when tool-generation tokens have no measured interval", () => {
  const result = createThroughputAccumulator();
  addThroughputSample(result, 100, 0);
  addThroughputSample(result, 20, 1000);
  assert.equal(calculateTokensPerSecond(result), null);
});

test("returns unknown when no positive generation interval is available", () => {
  const result = createThroughputAccumulator();
  addThroughputSample(result, 0, 0);
  assert.equal(calculateTokensPerSecond(result), null);
});

test("rejects negative and non-finite usage samples", () => {
  for (const [tokens, duration] of [[-5, 100], [10, Number.NaN], [10, Number.POSITIVE_INFINITY], [10, -1]] as const) {
    const result = createThroughputAccumulator();
    addThroughputSample(result, tokens, duration);
    assert.equal(result.hasCompleteUsage, false);
    assert.equal(calculateTokensPerSecond(result), null);
  }
});
