import test from "node:test";
import assert from "node:assert/strict";
import { buildToolCallingOptions, getModelTemperature, getProfessionalOperatingGuidance, inferAgentDomain, parseAuditIssues, shouldAuditFinalAnswer } from "./agent-quality.js";

test("prioritizes explicit engineering context over the word code", () => {
  assert.equal(inferAgentDomain("Calculate the beam load under the building code"), "engineering");
  assert.equal(inferAgentDomain("Calculate structural loads under local building codes"), "engineering");
});

test("keeps explicit software requests in the software domain", () => {
  assert.equal(inferAgentDomain("Refactor the software architecture"), "software");
  assert.equal(inferAgentDomain("Write TypeScript code for an API"), "software");
});


test("audits high-risk domains but does not add an audit to ordinary conversation", () => {
  assert.equal(shouldAuditFinalAnswer("Calculate the structural beam load"), true);
  assert.equal(shouldAuditFinalAnswer("Review this legal contract"), true);
  assert.equal(shouldAuditFinalAnswer("Build a secure production API"), true);
  assert.equal(shouldAuditFinalAnswer("What is a good movie tonight?"), false);
});

test("uses precise temperatures for sensitive and review work", () => {
  assert.equal(getModelTemperature("legal"), 0.2);
  assert.equal(getModelTemperature("review", "0.15"), 0.15);
  assert.equal(getModelTemperature("review", "0.8"), 0.2);
  assert.equal(getModelTemperature("research"), 0.3);
  assert.equal(getModelTemperature("general"), 0.4);
});

test("extracts only bounded concrete audit issues", () => {
  assert.deepEqual(parseAuditIssues("PASS\nISSUE: Missing unit.\nBLOCKER: Formula is unsupported.\nstyle suggestion"), [
    "Missing unit.",
    "Formula is unsupported.",
  ]);
  assert.deepEqual(parseAuditIssues("PASS"), []);
});

test("omits tool fields when a review request has no tools", () => {
  assert.deepEqual(buildToolCallingOptions([]), {});
  assert.deepEqual(buildToolCallingOptions([{ type: "function" }]), {
    tools: [{ type: "function" }],
    tool_choice: "auto",
  });
});

test("returns domain-specific professional operating guidance", () => {
  assert.match(getProfessionalOperatingGuidance("engineering"), /units|dimensional checks/i);
  assert.match(getProfessionalOperatingGuidance("medical"), /clinical guidance/i);
  assert.match(getProfessionalOperatingGuidance("legal"), /jurisdiction/i);
});
