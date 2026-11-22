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
  revisionHistory?: Array<{ result: string; executedAt?: string; revisionRequestedAt: string; note: string }>;
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

test("re-approving a revised step is allowed when comments and revision history datetimes differ only in format", () => {
  // Live bug 2026-11-22 (follow-up): after a revision request the step carries a
  // comment and a revisionHistory entry whose datetimes Postgres stores as
  // "+00:00"; the client echoes the sanitized "Z" form, and raw string compares
  // rejected the re-approval with 409, leaving revised projects stuck.
  const previous = previousTask();
  const revisedStep: Step = {
    id: "step-2",
    text: "Draft the outline",
    state: "pending",
    comments: [{ id: "c1", author: "user", text: "طلب مراجعة وإعادة تنفيذ: shorter please", createdAt: "2026-11-22T09:00:00.000+00:00" }],
    revisionHistory: [{ result: "Old outline", executedAt: "2026-11-22T08:22:56.921+00:00", revisionRequestedAt: "2026-11-22T09:00:00.000+00:00", note: "طلب مراجعة وإعادة تنفيذ: shorter please" }],
  };
  previous.steps = [previous.steps[0], revisedStep, previous.steps[2]];
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: [
      { ...previous.steps[0], executedAt: "2026-11-22T07:11:17.722Z" },
      {
        ...revisedStep,
        state: "approved" as const,
        comments: [{ ...revisedStep.comments![0], createdAt: "2026-11-22T09:00:00.000Z" }],
        revisionHistory: [{ ...revisedStep.revisionHistory![0], executedAt: "2026-11-22T08:22:56.921Z", revisionRequestedAt: "2026-11-22T09:00:00.000Z" }],
      },
      previous.steps[2],
    ],
  };
  assert.equal(isAllowedTaskTransition(previous, next), true);
});

test("editing a revision history entry is still rejected", () => {
  const previous = previousTask();
  const revisedStep: Step = {
    id: "step-2",
    text: "Draft the outline",
    state: "pending",
    revisionHistory: [{ result: "Old outline", executedAt: "2026-11-22T08:22:56.921+00:00", revisionRequestedAt: "2026-11-22T09:00:00.000+00:00", note: "original note" }],
  };
  previous.steps = [previous.steps[0], revisedStep, previous.steps[2]];
  const next = {
    title: previous.title,
    request: previous.request,
    specialty: previous.specialty,
    status: "review" as const,
    steps: [
      previous.steps[0],
      { ...revisedStep, state: "approved" as const, revisionHistory: [{ ...revisedStep.revisionHistory![0], note: "rewritten note" }] },
      previous.steps[2],
    ],
  };
  assert.equal(isAllowedTaskTransition(previous, next), false);
});
