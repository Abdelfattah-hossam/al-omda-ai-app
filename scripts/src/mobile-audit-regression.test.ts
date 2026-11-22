import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync("../artifacts/al-omda-ai/src/App.tsx", "utf8");
const collab = readFileSync("../artifacts/al-omda-ai/src/CollaborationWorkspace.tsx", "utf8");
const css = readFileSync("../artifacts/al-omda-ai/src/index.css", "utf8");
test("pipeline progress measures execution, not approval", () => {
 const section = app.slice(app.indexOf("  const pipelinePage ="), app.indexOf("  const assetsPage ="));
 assert.ok(section.includes("executionCount(task)/task.steps.length"));
 assert.ok(!section.includes("?count(task)/task.steps.length"));
});
test("calendar has event-specific statuses without changing stored values", () => {
 assert.ok(collab.includes('open: "مجدول"'));
 assert.ok(collab.includes('resolved: "انتهى"'));
 assert.ok(collab.includes('value="resolved">{statusLabels.resolved}'));
});
test("drawer labels can wrap on mobile", () => {
 assert.match(css, /curtain-launcher-item strong \{\s+white-space:normal;/);
});
test("analytics error copy is gated on an actual error", () => {
 assert.ok(app.includes("liveUserAnalyticsError ? (isAr?'تعذر تحميل التحليلات"));
});
