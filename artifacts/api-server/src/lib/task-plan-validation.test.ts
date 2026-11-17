import assert from "node:assert/strict";
import test from "node:test";
import { isValidNewTaskPlan } from "./task-plan-validation.js";

type TestStep = { id: string; text: string; output: string; complete: string; state: string; result?: string; executedAt?: string; executionStatus?: string; executionError?: string };

const makeStep = (id: number): TestStep => ({
  id: "step-" + id,
  text: "Do step " + id,
  output: "Expected output " + id,
  complete: "Verify step " + id,
  state: "pending",
});

const makePlan = (count = 3) => ({
  status: "review",
  steps: Array.from({ length: count }, (_, index) => makeStep(index + 1)),
});

test("accepts complete new task plans with 3 to 8 pending steps", () => {
  assert.equal(isValidNewTaskPlan(makePlan(3)), true);
  assert.equal(isValidNewTaskPlan(makePlan(8)), true);
});

test("rejects plans outside the supported step count", () => {
  assert.equal(isValidNewTaskPlan(makePlan(2)), false);
  assert.equal(isValidNewTaskPlan(makePlan(9)), false);
});

test("rejects duplicate step IDs and non-review initial status", () => {
  const duplicate = makePlan();
  duplicate.steps[2] = { ...duplicate.steps[2], id: duplicate.steps[1].id };
  assert.equal(isValidNewTaskPlan(duplicate), false);
  assert.equal(isValidNewTaskPlan({ ...makePlan(), status: "approved" }), false);
});

test("rejects steps that are not pending or already contain execution data", () => {
  for (const field of ["result", "executedAt", "executionStatus", "executionError"] as const) {
    const plan = makePlan();
    plan.steps[0] = { ...plan.steps[0], [field]: "already executed" };
    assert.equal(isValidNewTaskPlan(plan), false, "must reject " + field);
  }
  const emptyResult = makePlan();
  emptyResult.steps[0] = { ...emptyResult.steps[0], result: "" };
  assert.equal(isValidNewTaskPlan(emptyResult), false, "must reject an explicitly present empty result");
  const emptyExecutionError = makePlan();
  emptyExecutionError.steps[0] = { ...emptyExecutionError.steps[0], executionError: "" };
  assert.equal(isValidNewTaskPlan(emptyExecutionError), false, "must reject an explicitly present empty execution error");
  const approved = makePlan();
  approved.steps[0] = { ...approved.steps[0], state: "approved" };
  assert.equal(isValidNewTaskPlan(approved), false);
});

test("rejects missing, empty, or overlong step guidance", () => {
  for (const field of ["text", "output", "complete"] as const) {
    const empty = makePlan();
    empty.steps[0] = { ...empty.steps[0], [field]: "  " };
    assert.equal(isValidNewTaskPlan(empty), false, "must reject empty " + field);
    const long = makePlan();
    long.steps[0] = { ...long.steps[0], [field]: "x".repeat(1201) };
    assert.equal(isValidNewTaskPlan(long), false, "must reject long " + field);
  }
});
