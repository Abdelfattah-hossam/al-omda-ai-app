import test from "node:test";
import assert from "node:assert/strict";
import { buildToolCallingOptions, getModelTemperature, getProfessionalOperatingGuidance, inferAgentDomain } from "./agent-purpose-guidance.js";

test("prioritizes engineering context over generic building-code wording", () => {
  assert.equal(inferAgentDomain("Calculate the beam load under the building code"), "engineering");
  assert.equal(inferAgentDomain("احسب أحمال الكمرة حسب كود البناء"), "engineering");
});

test("classifies software, legal, medical, finance, business, and research requests", () => {
  assert.equal(inferAgentDomain("Refactor a TypeScript API"), "software");
  assert.equal(inferAgentDomain("Review this legal contract"), "legal");
  assert.equal(inferAgentDomain("Can a patient take medicine with warfarin?"), "medical");
  assert.equal(inferAgentDomain("Prepare a cash flow forecast"), "finance");
  assert.equal(inferAgentDomain("Build a sales campaign"), "business");
  assert.equal(inferAgentDomain("Compare the research literature"), "research");
  assert.equal(inferAgentDomain("How are you today?"), "general");
});

test("uses conservative temperatures for precision-sensitive purposes", () => {
  assert.equal(getModelTemperature("legal"), 0.2);
  assert.equal(getModelTemperature("engineering", "0.15"), 0.15);
  assert.equal(getModelTemperature("review", "0.8"), 0.2);
  assert.equal(getModelTemperature("research"), 0.3);
  assert.equal(getModelTemperature("general"), 0.4);
});

test("omits tool fields when no tools are available", () => {
  assert.deepEqual(buildToolCallingOptions([]), {});
  assert.deepEqual(buildToolCallingOptions([{ type: "function" }]), {
    tools: [{ type: "function" }],
    tool_choice: "auto",
  });
});

test("provides bounded professional guidance without claiming credentials", () => {
  assert.match(getProfessionalOperatingGuidance("engineering"), /units|dimensional checks/i);
  assert.match(getProfessionalOperatingGuidance("medical"), /not present an AI response as a diagnosis/i);
  assert.match(getProfessionalOperatingGuidance("legal"), /jurisdiction/i);
});
