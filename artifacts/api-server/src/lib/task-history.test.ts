import assert from "node:assert/strict";
import test from "node:test";
import { isRevisionHistoryUnchanged, type RevisionHistoryEntry } from "./task-history.js";

const original: RevisionHistoryEntry[] = [{
  result: "previous deliverable",
  executedAt: "2026-11-17T10:00:00.000Z",
  revisionRequestedAt: "2026-11-17T10:05:00.000Z",
  note: "Fix the totals",
}];

test("accepts unchanged revision history", () => {
  assert.equal(isRevisionHistoryUnchanged(original, original.map((entry) => ({ ...entry }))), true);
  assert.equal(isRevisionHistoryUnchanged(undefined, []), true);
});

test("rejects edited, removed, or appended revision history entries", () => {
  assert.equal(isRevisionHistoryUnchanged(original, [{ ...original[0], note: "tampered" }]), false);
  assert.equal(isRevisionHistoryUnchanged(original, []), false);
  assert.equal(isRevisionHistoryUnchanged(original, [...original, { ...original[0] }]), false);
});
