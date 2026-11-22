import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedTaskTransition } from "./workspace.js";

type Step = {
  id: string;
  text: string;
  output?: string;
  complete?: string;
  result?: string;
  executedAt?: string;
  executionStatus?: "succeeded" | "failed";
  executionError?: string;
  comments?: Array<{ id: string; author: "user" | "assistant" | "system"; text: string; createdAt: string }>;
  state: "pending" | "approved" | "rejected";
};

const baseSteps = (): Step[] => [
  {
    id: "step-1",
    text: "Gather requirements",
    state: "approved",
    result: "Requirements document",
    executedAt: "2026-11-22T07:11:17.722+00:00",
    executionStatus: "succeeded",
  },
  { id: "step-2", text: "Draft the outline", state: "pending" },
  { id: "step-3", text: "Build the deliverable", state: "pending" },
];

const previousTask = () => ({
  id: "task-1",
  title: "Project",
  request: "Build a project",
  specialty: "business" as const,
  steps: baseSteps(),
  status: "review" as const,
  created_at: "2026-11-21T16:38:24.943646+00:00",
});

test("approving the next step is allowed when the client echoes the executed step with a normalized datetime", () => {
  // Live bug 2026-11-22: the workspace GET sanitizes executedAt to the Z form, but
  // Postgres stores "+00:00". Comparing raw strings counted the echo as a second
  // changed step, so every approval after a completed stage returned 409 and stage
  // 2+ could never run.
  const previous = previousTask();
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: previous.steps.map((step, index) =>
      index === 0
        ? { ...step, executedAt: "2026-11-22T07:11:17.722Z" }
        : index === 1
          ? { ...step, state: "approved" as const }
          : { ...step },
    ),
  };
  assert.equal(isAllowedTaskTransition(previous, next), true);
});

test("a real change to a completed step is still rejected alongside the approval", () => {
  const previous = previousTask();
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: previous.steps.map((step, index) =>
      index === 0
        ? { ...step, result: "tampered result" }
        : index === 1
          ? { ...step, state: "approved" as const }
          : { ...step },
    ),
  };
  assert.equal(isAllowedTaskTransition(previous, next), false);
});

test("approving a later step out of order is still rejected", () => {
  const previous = previousTask();
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: previous.steps.map((step, index) => (index === 2 ? { ...step, state: "approved" as const } : { ...step })),
  };
  assert.equal(isAllowedTaskTransition(previous, next), false);
});

test("a genuinely different executedAt instant still counts as a change", () => {
  const previous = previousTask();
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: previous.steps.map((step, index) =>
      index === 0
        ? { ...step, executedAt: "2026-11-22T08:11:17.722Z" }
        : index === 1
          ? { ...step, state: "approved" as const }
          : { ...step },
    ),
  };
  assert.equal(isAllowedTaskTransition(previous, next), false);
});
