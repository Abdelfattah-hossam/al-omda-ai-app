import { test } from "node:test";
import { strict as assert } from "node:assert";
import { inferModelPurpose } from "./model-purpose.js";
import { buildToolCallingOptions, getModelTemperature, inferAgentDomain, parseAuditIssues, shouldAuditFinalAnswer } from "./agent-quality.js";

test("routes requests to profession-specific model pools", () => {
  assert.equal(inferModelPurpose("Review the security of this pull request"), "review");
  assert.equal(inferModelPurpose("Draft a contract under UAE law"), "legal");
  assert.equal(inferModelPurpose("Calculate a reinforced concrete beam load"), "engineering");
  assert.equal(inferModelPurpose("Summarize clinical trial evidence"), "medical");
  assert.equal(inferModelPurpose("Build a TypeScript API"), "coding");
  assert.equal(inferModelPurpose("Analyze cash flow and ROI"), "finance");
  assert.equal(inferModelPurpose("Create a marketing strategy"), "business");
  assert.equal(inferModelPurpose("Research and compare model providers"), "research");
  assert.equal(inferModelPurpose("Hello, how are you?"), "general");
});

test("recognizes Arabic professional requests", () => {
  assert.equal(inferAgentDomain("راجع عقد عمل حسب قانون الإمارات"), "legal");
  assert.equal(inferAgentDomain("احسب أحمال كمرة خرسانية"), "engineering");
  assert.equal(inferAgentDomain("لخص الأدلة الطبية عن الدواء"), "medical");
  assert.equal(inferAgentDomain("حلل التدفق النقدي وعائد الاستثمار"), "finance");
  assert.equal(inferAgentDomain("عدل كود التطبيق"), "software");
  assert.equal(inferAgentDomain("جهز خطة تسويق ومحتوى"), "business");
});

test("uses low configurable temperature for precision work and rejects unsafe overrides", () => {
  for (const purpose of ["legal", "engineering", "medical", "finance", "coding", "review", "proposal"]) {
    assert.equal(getModelTemperature(purpose), 0.2);
    assert.equal(getModelTemperature(purpose, "0.1"), 0.1);
    assert.equal(getModelTemperature(purpose, "0.3"), 0.3);
    assert.equal(getModelTemperature(purpose, "0.8"), 0.2);
  }
  assert.equal(getModelTemperature("research"), 0.3);
  assert.equal(getModelTemperature("general"), 0.4);
});

test("flags high-impact deliverables for internal quality review", () => {
  assert.equal(shouldAuditFinalAnswer("Prepare a legal contract"), true);
  assert.equal(shouldAuditFinalAnswer("احسب الأحمال الهندسية"), true);
  assert.equal(shouldAuditFinalAnswer("How are you today?"), false);
  assert.deepEqual(parseAuditIssues("PASS\nNo issues"), []);
  assert.deepEqual(parseAuditIssues("ISSUE: Missing source\nBLOCKER: Incorrect unit\nNote: ok"), ["Missing source", "Incorrect unit"]);
});

test("enables automatic function calling only when tool definitions are available", () => {
  const tools = [{ type: "function", function: { name: "web.search" } }];
  assert.deepEqual(buildToolCallingOptions(tools), { tools, tool_choice: "auto" });
  assert.deepEqual(buildToolCallingOptions([]), {});
});
