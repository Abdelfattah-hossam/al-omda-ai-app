import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentToolWarning } from "../../artifacts/al-omda-ai/src/lib/agent-tool-warning.js";

test("returns no warning for non-array or empty tool failures", () => {
  assert.equal(buildAgentToolWarning(null, false), "");
  assert.equal(buildAgentToolWarning({}, true), "");
  assert.equal(buildAgentToolWarning([], false), "");
});

test("renders localized warnings and limits the list to five entries", () => {
  const failures = Array.from({ length: 6 }, (_, index) => ({ tool: "tool-" + index, message: "failed-" + index }));
  const english = buildAgentToolWarning(failures, false);
  const arabic = buildAgentToolWarning(failures, true);
  assert.match(english, /Execution warning/);
  assert.match(arabic, /تنبيه تنفيذ/);
  assert.match(english, /tool-4/);
  assert.doesNotMatch(english, /tool-5/);
  assert.match(english, /1 additional failures were omitted/);
});

test("truncates long tool failure messages", () => {
  const warning = buildAgentToolWarning([{ tool: "terminal.execute", message: "x".repeat(400) }], false);
  assert.ok(warning.endsWith("x".repeat(240)));
  assert.equal(warning.includes("x".repeat(241)), false);
});
