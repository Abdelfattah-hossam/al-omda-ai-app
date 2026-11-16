import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CreateTaskBody, UpdateTaskBody } from "../../lib/api-zod/src/generated/api";

const setupUrl = new URL("../../supabase/setup.sql", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20261116173613_allow_eight_project_plan_steps.sql", import.meta.url);

test("setup SQL and the deployment migration agree on the 3-to-8 step range", async () => {
  const [setup, migration] = await Promise.all([
    readFile(setupUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);
  for (const [label, sql] of [["setup.sql", setup], ["migration", migration]] as const) {
    assert.match(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 8/i, label + " must allow 3 to 8 project steps");
    assert.doesNotMatch(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 5/i, label + " must not retain the old five-step ceiling");
    assert.match(sql, /revoke all on function public\.create_ai_task_with_quota[\s\S]*?from public/i, label + " must revoke public execution");
    assert.match(sql, /grant execute on function public\.create_ai_task_with_quota[\s\S]*?to authenticated/i, label + " must grant only the authenticated application role");
  }
});

test("API task schema accepts only complete plans with 3 to 8 bounded steps", () => {
  const step = (id: number) => ({
    id: "step-" + id,
    text: "Do step " + id,
    output: "Step " + id + " output",
    complete: "Step " + id + " is verified",
    state: "pending" as const,
  });
  const base = { title: "A project", request: "Complete a project", specialty: "assistant" as const, status: "review" as const };
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: [step(1), step(2), step(3)] }).success, true);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: Array.from({ length: 8 }, (_, i) => step(i + 1)) }).success, true);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: [step(1), step(2)] }).success, false);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: Array.from({ length: 9 }, (_, i) => step(i + 1)) }).success, false);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: [{ ...step(1), output: "" }, step(2), step(3)] }).success, false);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: [{ ...step(1), state: "approved" as const }, step(2), step(3)] }).success, false);
  assert.equal(CreateTaskBody.safeParse({ ...base, steps: [{ ...step(1), text: "x".repeat(1201) }, step(2), step(3)] }).success, false);
  const editable = { ...base, id: "00000000-0000-4000-8000-000000000001", steps: [step(1), step(2), step(3)] };
  assert.equal(UpdateTaskBody.safeParse(editable).success, true);
  assert.equal(UpdateTaskBody.safeParse({ ...editable, steps: [{ ...step(1), complete: undefined }, step(2), step(3)] }).success, false);
});
