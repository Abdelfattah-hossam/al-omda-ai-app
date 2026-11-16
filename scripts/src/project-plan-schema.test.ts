import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupUrl = new URL("../../supabase/setup.sql", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20261116173613_allow_eight_project_plan_steps.sql", import.meta.url);

test("project-plan parser and database creation function agree on the 3-to-8 step range", async () => {
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
  assert.match(parser, /steps\.length\s*>\s*MAX_PLAN_STEPS/);
  assert.match(parser, /const MAX_PLAN_STEPS = 8/);
});
