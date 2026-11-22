import test from "node:test";
import assert from "node:assert/strict";
import { GetWorkspaceResponse } from "@workspace/api-zod";
import { sanitizeWorkspaceProfile, sanitizeWorkspaceTask } from "./workspace-sanitize.js";

const profile = sanitizeWorkspaceProfile({ displayName: "Abdel", organization: "AL OMDA", avatarPath: null });

function parseWorkspace(tasks: unknown[]) {
  return GetWorkspaceResponse.parse({ profile, tasks });
}

test("keeps a healthy task row intact", () => {
  const row = {
    id: "a1b2c3d4-e5f6-4789-8abc-def012345678",
    title: "دراسة جدوى",
    request: "أنشئ دراسة جدوى",
    specialty: "business",
    status: "approved",
    created_at: "2026-02-01T10:00:00.000Z",
    steps: [
      {
        id: "step-1",
        text: "إعداد الملف",
        state: "approved",
        output: "مخرج",
        complete: "اكتمل",
        result: "نتيجة",
        executedAt: "2026-02-01T10:05:00.000Z",
        executionStatus: "succeeded",
        comments: [{ id: "c1", author: "user", text: "ملاحظة", createdAt: "2026-02-01T10:06:00.000Z" }],
        revisionHistory: [{ result: "قديم", revisionRequestedAt: "2026-02-01T10:07:00.000Z", note: "راجع" }],
      },
    ],
  };
  const task = sanitizeWorkspaceTask(row);
  assert.ok(task);
  assert.equal(task.id, row.id);
  assert.equal(task.steps[0]?.state, "approved");
  assert.equal(task.steps[0]?.executedAt, "2026-02-01T10:05:00.000Z");
  assert.doesNotThrow(() => parseWorkspace([task]));
});

test("repairs legacy rows with unknown enums, bad dates and empty fields", () => {
  const legacy = {
    id: "b1b2c3d4-e5f6-4789-8abc-def012345678",
    title: "",
    request: null,
    specialty: "legacy-specialty",
    status: "archived",
    created_at: "2026-02-01 10:00:00+00",
    steps: [
      {
        id: "",
        text: "",
        state: "in_progress",
        executedAt: "yesterday",
        executionStatus: "done",
        executionError: 42,
        comments: [{ id: "", author: "robot", text: "قديم", createdAt: "not a date" }, "junk", { text: "" }],
        revisionHistory: [{ result: 7, revisionRequestedAt: "2026/02/01", note: null }],
        output: "x".repeat(5000),
      },
      "not an object",
      null,
    ],
  };
  const task = sanitizeWorkspaceTask(legacy);
  assert.ok(task);
  assert.equal(task.specialty, "assistant");
  assert.equal(task.status, "review");
  assert.equal(task.steps.length, 1);
  assert.equal(task.steps[0]?.state, "pending");
  assert.equal(task.steps[0]?.executedAt, undefined);
  assert.equal(task.steps[0]?.executionStatus, undefined);
  assert.equal(task.steps[0]?.executionError, undefined);
  assert.ok(task.title.length > 0);
  assert.ok(task.request.length > 0);
  assert.doesNotThrow(() => parseWorkspace([task]));
});

test("drops only rows without a usable identity", () => {
  assert.equal(sanitizeWorkspaceTask(null), null);
  assert.equal(sanitizeWorkspaceTask("junk"), null);
  assert.equal(sanitizeWorkspaceTask({ id: "not-a-uuid", title: "t", request: "r" }), null);
  assert.equal(sanitizeWorkspaceTask({ title: "t", request: "r" }), null);
});

test("coerces missing steps and non-string scalars into a valid response", () => {
  const task = sanitizeWorkspaceTask({
    id: "c1b2c3d4-e5f6-4789-8abc-def012345678",
    title: 123,
    request: undefined,
    steps: "broken",
    created_at: null,
  });
  assert.ok(task);
  assert.deepEqual(task.steps, []);
  assert.doesNotThrow(() => parseWorkspace([task]));
});

test("sanitizes overlong or wrong-typed profile fields", () => {
  const cleaned = sanitizeWorkspaceProfile({
    displayName: "x".repeat(500),
    organization: 42,
    avatarPath: 7,
  });
  assert.equal(cleaned.displayName.length, 100);
  assert.equal(cleaned.organization, "");
  assert.equal(cleaned.avatarPath, null);
  assert.doesNotThrow(() => GetWorkspaceResponse.parse({ profile: cleaned, tasks: [] }));
});
