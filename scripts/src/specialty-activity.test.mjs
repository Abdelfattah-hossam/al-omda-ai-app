import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeSpecialty,
  matchesActivityFilter,
} from "../../artifacts/al-omda-ai/src/lib/specialty-activity";
const task = (overrides = {}) => ({
  id: "one",
  title: "QA",
  specialty: "design",
  status: "review",
  createdAt: "2026-11-22T10:00:00Z",
  steps: [{ state: "approved" }, { state: "pending" }],
  ...overrides,
});
test("excludes demo tasks from all activity and approvals", () => {
  const s = summarizeSpecialty(
    [task(), task({ demo: true }), task({ specialty: "business" })],
    "design",
  );
  assert.equal(s.total, 1);
  assert.equal(s.attention, 1);
  assert.equal(s.approvalPercent, 50);
});
test("no tasks means no made-up success percentage", () => {
  const s = summarizeSpecialty([], "design");
  assert.equal(s.approvalPercent, null);
  assert.equal(s.total, 0);
  assert.ok(matchesActivityFilter(s, "unused"));
  assert.ok(!matchesActivityFilter(s, "recorded"));
});
test("approved plans do not imply executed steps", () => {
  const s = summarizeSpecialty(
    [
      task({
        status: "approved",
        steps: [{ state: "approved", executionStatus: "failed" }],
      }),
    ],
    "design",
  );
  assert.equal(s.approvalPercent, 100);
  assert.equal(s.attention, 0);
  assert.equal(s.records[0].steps[0].executionStatus, "failed");
});
test("paused and review count as attention but stopped does not", () => {
  const s = summarizeSpecialty(
    [task(), task({ status: "paused" }), task({ status: "stopped" })],
    "design",
  );
  assert.equal(s.attention, 2);
  assert.ok(matchesActivityFilter(s, "attention"));
  assert.ok(matchesActivityFilter(s, "all"));
});
test("empty plans are not counted as zero percent success", () => {
  assert.equal(
    summarizeSpecialty([task({ steps: [] })], "design").approvalPercent,
    null,
  );
});
test("latest saved tasks come first without mutating source", () => {
  const tasks = [
    task({ id: "old" }),
    task({ id: "new", createdAt: "2026-11-23T10:00:00Z" }),
  ];
  assert.equal(summarizeSpecialty(tasks, "design").records[0].id, "new");
  assert.equal(tasks[0].id, "old");
});
