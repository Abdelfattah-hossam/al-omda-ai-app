import test from "node:test";
import assert from "node:assert/strict";
import {
  getHostedModelTemperature,
  inferHostedModelPurpose,
  parseHostedAuditIssues,
  shouldAuditChatRequest,
} from "./ai-model-policy.js";

test("routes precision and research requests to conservative temperature groups", () => {
  assert.equal(inferHostedModelPurpose("Review a legal contract under UAE law"), "precision");
  assert.equal(inferHostedModelPurpose("Calculate structural engineering loads"), "precision");
  assert.equal(inferHostedModelPurpose("Review a clinical diagnosis"), "precision");
  assert.equal(inferHostedModelPurpose("Build and debug a TypeScript API"), "precision");
  assert.equal(inferHostedModelPurpose("Analyze cash flow and ROI"), "precision");
  assert.equal(inferHostedModelPurpose("Research and compare three providers"), "research");
  assert.equal(inferHostedModelPurpose("Hello, how are you?"), "general");
});

test("sets precision temperatures within the requested 0.1 to 0.3 range", () => {
  const original = process.env.OMDA_PRECISE_TEMPERATURE;
  try {
    delete process.env.OMDA_PRECISE_TEMPERATURE;
    assert.equal(getHostedModelTemperature("Prepare a legal contract"), 0.2);
    process.env.OMDA_PRECISE_TEMPERATURE = "0.1";
    assert.equal(getHostedModelTemperature("Prepare a legal contract"), 0.1);
    process.env.OMDA_PRECISE_TEMPERATURE = "0.3";
    assert.equal(getHostedModelTemperature("Prepare a legal contract"), 0.3);
    process.env.OMDA_PRECISE_TEMPERATURE = "0.9";
    assert.equal(getHostedModelTemperature("Prepare a legal contract"), 0.2);
  } finally {
    if (original === undefined) delete process.env.OMDA_PRECISE_TEMPERATURE;
    else process.env.OMDA_PRECISE_TEMPERATURE = original;
  }
  assert.equal(getHostedModelTemperature("Research market options"), 0.3);
  assert.equal(getHostedModelTemperature("How are you?"), 0.4);
});

test("audits high-impact chat requests and extracts only actionable findings", () => {
  assert.equal(shouldAuditChatRequest("Draft a legal contract"), true);
  assert.equal(shouldAuditChatRequest("احسب الأحمال الهندسية"), true);
  assert.equal(shouldAuditChatRequest("How are you?"), false);
  assert.deepEqual(parseHostedAuditIssues("PASS\nNo issues"), []);
  assert.deepEqual(parseHostedAuditIssues("ISSUE: Missing source\nBLOCKER: Unit mismatch"), ["Missing source", "Unit mismatch"]);
});
