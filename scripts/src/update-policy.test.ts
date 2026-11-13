import { test } from "node:test";
import { strict as assert } from "node:assert";
import { decideSafeUpdate } from "./update-policy.js";

const base = { enabled: true, branch: "main", workingTreeClean: true, behind: 2, ahead: 0, activeRuns: 0 };

test("allows an update only when the clean main branch is behind and idle", () => {
  assert.deepEqual(decideSafeUpdate(base), { apply: true, reason: "update-available" });
});

test("defers updates for disabled mode, dirty trees, local commits, or active runs", () => {
  assert.equal(decideSafeUpdate({ ...base, enabled: false }).reason, "disabled");
  assert.equal(decideSafeUpdate({ ...base, workingTreeClean: false }).reason, "dirty-worktree");
  assert.equal(decideSafeUpdate({ ...base, ahead: 1 }).reason, "local-commits");
  assert.equal(decideSafeUpdate({ ...base, activeRuns: 1 }).reason, "agent-busy");
  assert.equal(decideSafeUpdate({ ...base, branch: "feature" }).reason, "wrong-branch");
  assert.equal(decideSafeUpdate({ ...base, behind: 0 }).reason, "up-to-date");
});
