import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAgentToolFailures } from "./agent-execution-warnings.js";

test("returns a clean status for successful runs", () => {
  assert.deepEqual(summarizeAgentToolFailures([]), {
    toolExecutionStatus: "no_tool_errors",
    toolFailures: [],
  });
});

test("returns each failed tool once for warning runs", () => {
  const failures = [{ callId: "call-1", tool: "terminal.execute", message: "exit code 1" }];
  assert.deepEqual(summarizeAgentToolFailures(failures), {
    toolExecutionStatus: "with_warnings",
    toolFailures: failures,
  });
});
