import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


const setupUrl = new URL("../../supabase/setup.sql", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20261116173613_allow_eight_project_plan_steps.sql", import.meta.url);
const sequenceMigrationUrl = new URL("../../supabase/migrations/20261116174738_revoke_all_public_sequence_defaults.sql", import.meta.url);
const openapiUrl = new URL("../../lib/api-spec/openapi.yaml", import.meta.url);
const generatedApiUrl = new URL("../../lib/api-zod/src/generated/api.ts", import.meta.url);

test("setup SQL and the deployment migration agree on the 3-to-8 step range", async () => {
  const [setup, migration, sequenceMigration, openapi] = await Promise.all([
    readFile(setupUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
    readFile(sequenceMigrationUrl, "utf8"),
    readFile(openapiUrl, "utf8"),
  ]);
  for (const [label, sql] of [["setup.sql", setup], ["migration", migration]] as const) {
    assert.match(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 8/i, label + " must allow 3 to 8 project steps");
    assert.doesNotMatch(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 5/i, label + " must not retain the old five-step ceiling");
    assert.match(sql, /revoke all on function public\.create_ai_task_with_quota[\s\S]*?from public/i, label + " must revoke public execution");
    assert.match(sql, /grant execute on function public\.create_ai_task_with_quota[\s\S]*?to authenticated/i, label + " must grant only the authenticated application role");
  }
  assert.match(setup, /alter default privileges for role postgres in schema public\s+revoke all on sequences from anon, authenticated, service_role/i);
  assert.match(sequenceMigration, /revoke all on sequences from anon, authenticated, service_role/i);
  const taskCreateSpec = openapi.slice(openapi.indexOf("    TaskCreate:"), openapi.indexOf("    TaskUpdateStep:"));
  const taskUpdateSpec = openapi.slice(openapi.indexOf("    TaskUpdate:"), openapi.indexOf("    Task:"));
  assert.match(taskCreateSpec, /minItems: 3[\s\S]*maxItems: 8/);
  assert.match(taskUpdateSpec, /minItems: 3[\s\S]*maxItems: 8/);
});

test("generated API validators enforce complete 3-to-8-step task plans", async () => {
  const api = await readFile(generatedApiUrl, "utf8");
  const createStart = api.indexOf("export const CreateTaskBody = zod.object({");
  const createEnd = api.indexOf("export const createTaskResponseOneTitleMax", createStart);
  const updateStart = api.indexOf("export const UpdateTaskBody = zod.object({");
  const updateEnd = api.indexOf("export const updateTaskResponseOneTitleMax", updateStart);
  assert.ok(createStart >= 0 && createEnd > createStart, "CreateTaskBody validator must exist");
  assert.ok(updateStart >= 0 && updateEnd > updateStart, "UpdateTaskBody validator must exist");
  const create = api.slice(createStart, createEnd);
  const update = api.slice(updateStart, updateEnd);
  for (const [label, schema] of [["create", create], ["update", update]] as const) {
    assert.match(schema, /"text": zod\.string\(\)\.min\(1\)\.max\([^)]*StepsItemTextMax\)/, label + " step text must be bounded and non-empty");
    assert.match(schema, /"output": zod\.string\(\)\.min\(1\)\.max\(1200\)/, label + " step output must be required and non-empty");
    assert.match(schema, /"complete": zod\.string\(\)\.min\(1\)\.max\(1200\)/, label + " step completion criteria must be required and non-empty");
    assert.match(schema, /\)\)\.min\(3\)\.max\([^)]*StepsMax\)/, label + " must enforce 3 to 8 steps");
  }
  assert.match(create, /"state": zod\.literal\('pending'\)/, "new task steps must start pending");
  assert.match(create, /"status": zod\.literal\('review'\)/, "new tasks must start in review");
  assert.match(update, /"state": zod\.enum\(\['pending', 'approved', 'rejected'\]\)/, "updates must preserve supported step states");
  assert.match(update, /"status": zod\.enum\(\['review', 'paused', 'approved', 'stopped'\]\)/, "updates must preserve supported task statuses");
});
