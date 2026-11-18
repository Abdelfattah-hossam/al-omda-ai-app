import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


const setupUrl = new URL("../../supabase/setup.sql", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20261116173613_allow_eight_project_plan_steps.sql", import.meta.url);
const sequenceMigrationUrl = new URL("../../supabase/migrations/20261116174738_revoke_all_public_sequence_defaults.sql", import.meta.url);
const anonMigrationUrl = new URL("../../supabase/migrations/20261116183805_revoke_anon_task_creation.sql", import.meta.url);
const openapiUrl = new URL("../../lib/api-spec/openapi.yaml", import.meta.url);
const generatedApiUrl = new URL("../../lib/api-zod/src/generated/api.ts", import.meta.url);
const workspaceRouteUrl = new URL("../../artifacts/api-server/src/routes/workspace.ts", import.meta.url);
const taskValidationUrl = new URL("../../artifacts/api-server/src/lib/task-plan-validation.ts", import.meta.url);

test("setup SQL and the deployment migration agree on the 3-to-8 step range", async () => {
  const [setup, migration, sequenceMigration, openapi, api] = await Promise.all([
    readFile(setupUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
    readFile(sequenceMigrationUrl, "utf8"),
    readFile(openapiUrl, "utf8"),
    readFile(generatedApiUrl, "utf8"),
  ]);
  for (const [label, sql] of [["setup.sql", setup], ["migration", migration]] as const) {
    assert.match(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 8/i, label + " must allow 3 to 8 project steps");
    assert.doesNotMatch(sql, /jsonb_array_length\(p_steps\)\s+not between 3 and 5/i, label + " must not retain the old five-step ceiling");
    assert.match(sql, /revoke all on function public\.create_ai_task_with_quota[\s\S]*?from public/i, label + " must revoke public execution");
    assert.match(sql, /grant execute on function public\.create_ai_task_with_quota[\s\S]*?to authenticated/i, label + " must grant only the authenticated application role");
  }
  assert.match(setup, /alter default privileges for role postgres in schema public\s+revoke all on sequences from anon, authenticated, service_role/i);
  assert.match(sequenceMigration, /revoke all on sequences from anon, authenticated, service_role/i);
  const earlierSequenceMigration = await readFile(new URL("../../supabase/migrations/20261116174710_restrict_public_sequence_defaults.sql", import.meta.url), "utf8");
  assert.match(earlierSequenceMigration, /preserved because this migration was already applied/i);
  assert.match(migration, /reserved compatibility parameter/i);
  const taskCreateSpec = openapi.slice(openapi.indexOf("    TaskCreate:"), openapi.indexOf("    TaskUpdateStep:"));
  const planStepSpec = openapi.slice(openapi.indexOf("    PlanStep:"), openapi.indexOf("    TaskCreateStep:"));
  assert.match(planStepSpec, /text:[\s\S]*maxLength: 2000/, "legacy task responses must tolerate longer step text");
  const taskCreateStepSpec = openapi.slice(openapi.indexOf("    TaskCreateStep:"), openapi.indexOf("    Specialty:"));
  const taskUpdateStepSpec = openapi.slice(openapi.indexOf("    TaskUpdateStep:"), openapi.indexOf("    TaskUpdate:"));
  assert.match(taskCreateStepSpec, /text:[\s\S]*maxLength: 1200/, "new task steps must cap text at 1,200 characters");
  assert.match(taskUpdateStepSpec, /text:[\s\S]*maxLength: 1200/, "edited step text must cap at 1,200 characters");
  assert.match(api, /getWorkspaceResponseTasksItemOneStepsItemTextMax = 2000/);
  assert.match(api, /createTaskResponseOneStepsItemTextMax = 2000/);
  assert.match(api, /updateTaskResponseOneStepsItemTextMax = 2000/);
  const taskUpdateSpec = openapi.slice(openapi.indexOf("    TaskUpdate:"), openapi.indexOf("    Task:"));
  assert.match(taskCreateSpec, /minItems: 3[\s\S]*maxItems: 8/);
  assert.match(taskUpdateSpec, /minItems: 1[\s\S]*maxItems: 20/);
  const taskResponseSpec = openapi.slice(openapi.indexOf("    Task:"), openapi.indexOf("    Workspace:"));
  assert.ok(taskResponseSpec.includes('$ref: "#/components/schemas/PlanStep"'), "task responses must retain legacy-compatible optional step guidance");
  assert.ok(!taskResponseSpec.includes("minItems:"), "task responses must not reject persisted legacy step counts");
  assert.match(openapi, /minLength: 1\s+maxLength: 1200/, "OpenAPI plan guidance fields must reject empty strings");
  assert.ok(setup.includes("from anon;"), "setup SQL must explicitly revoke task creation from anon");
  const anonMigration = await readFile(anonMigrationUrl, "utf8");
  assert.match(anonMigration, /revoke all on function public\.create_ai_task_with_quota[\s\S]*?from anon/i);
});

test("generated API validators enforce complete 3-to-8-step task plans", async () => {
  const [api, route, validation] = await Promise.all([readFile(generatedApiUrl, "utf8"), readFile(workspaceRouteUrl, "utf8"), readFile(taskValidationUrl, "utf8")]);
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
    if (label === "create") {
      assert.match(schema, /"output": zod\.string\(\)\.min\(1\)\.max\(1200\)/, "new step output must be required and non-empty");
      assert.match(schema, /"complete": zod\.string\(\)\.min\(1\)\.max\(1200\)/, "new step completion criteria must be required and non-empty");
      assert.match(schema, /\)\)\.min\(3\)\.max\([^)]*StepsMax\)/, "new tasks must enforce 3 to 8 steps");
    } else {
      assert.match(schema, /"output": zod\.string\(\)\.min\(1\)\.max\(1200\)\.optional\(\)/, "legacy output guidance must be optional on update");
      assert.match(schema, /"complete": zod\.string\(\)\.min\(1\)\.max\(1200\)\.optional\(\)/, "legacy completion guidance must be optional on update");
      assert.match(schema, /\)\)\.min\(1\)\.max\(updateTaskBodyOneStepsMax\)/, "updates must accept the legacy 1-to-20 step range");
    }
  }
  assert.match(create, /"state": zod\.literal\('pending'\)/, "new task steps must start pending");
  assert.match(create, /"status": zod\.literal\('review'\)/, "new tasks must start in review");
  assert.match(update, /"state": zod\.enum\(\['pending', 'approved', 'rejected'\]\)/, "updates must preserve supported step states");
  assert.match(update, /"status": zod\.enum\(\['review', 'paused', 'approved', 'stopped'\]\)/, "updates must preserve supported task statuses");
  for (const name of ["GetWorkspaceResponse", "CreateTaskResponse", "UpdateTaskResponse"]) {
    const start = api.indexOf("export const " + name + " = zod.object({");
    const end = api.indexOf("\n\nexport const ", start + 1);
    const response = api.slice(start, end < 0 ? api.length : end);
    assert.ok(response.includes('"output": zod.string().max(1200).optional()'), name + " must tolerate legacy empty or missing output guidance");
    assert.ok(response.includes('"complete": zod.string().max(1200).optional()'), name + " must tolerate legacy empty or missing completion guidance");
    const stepsStart = response.indexOf('"steps": zod.array(');
    const stepsEnd = response.indexOf('"status":', stepsStart);
    assert.ok(stepsStart >= 0 && stepsEnd > stepsStart, name + " must expose its response step array");
    const responseSteps = response.slice(stepsStart, stepsEnd);
    assert.ok(!responseSteps.includes("})).min("), name + " must not impose a minimum count on persisted response data");
    assert.ok(!responseSteps.includes("})).max(20)"), name + " must not impose a new maximum count on persisted response data");
  }
  assert.ok(route.includes("isValidNewTaskPlan(plan)"));
  assert.ok(validation.includes("plan.steps.length >= 3"));
  assert.ok(validation.includes("plan.steps.length <= 8"));
  assert.ok(validation.includes("new Set(plan.steps.map((step) => step.id)).size === plan.steps.length"));
  assert.ok(validation.includes('!("result" in step) && !("executedAt" in step) && !("executionStatus" in step) && !("executionError" in step)'));
});


test("chat-generated artifact task logging is owner-scoped and does not consume task-creation quota", async () => {
  const setupUrl = new URL("../../supabase/setup.sql", import.meta.url);
  const migrationUrl = new URL("../../supabase/migrations/20261118090205_create_ai_artifact_task_log.sql", import.meta.url);
  const workspaceRouteUrl = new URL("../../artifacts/api-server/src/routes/workspace.ts", import.meta.url);
  const storageAssetsUrl = new URL("../../artifacts/api-server/src/lib/storage-assets.ts", import.meta.url);
  const chatUrl = new URL("../../artifacts/al-omda-ai/src/AIChat.tsx", import.meta.url);
  const [setup, migration, workspaceRoute, storageAssets, chat] = await Promise.all([
    readFile(setupUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
    readFile(workspaceRouteUrl, "utf8"),
    readFile(storageAssetsUrl, "utf8"),
    readFile(chatUrl, "utf8"),
  ]);
  for (const sql of [setup, migration]) {
    assert.ok(sql.includes("create or replace function public.create_ai_artifact_task"));
    assert.ok(sql.includes("security definer"));
    assert.ok(sql.includes("set search_path = pg_catalog"));
    assert.ok(sql.includes("auth.uid()"));
    assert.ok(sql.includes("revoke all on function public.create_ai_artifact_task(text, text, text, text, text, bigint, text) from public, anon, authenticated"));
    assert.ok(sql.includes("grant execute on function public.create_ai_artifact_task(text, text, text, text, text, bigint, text) to authenticated"));
    assert.ok(sql.includes("request like '%Generated artifact:%'"));
    assert.ok(sql.includes("interval '1 hour'"));
  }
  assert.ok(workspaceRoute.includes('router.post("/tasks/artifact"'));
  assert.ok(chat.includes("/api/tasks/artifact"));
  assert.ok(chat.includes("/api/storage/assets"));
  assert.ok(storageAssets.includes('tsx: "text/plain"'));
  assert.ok(storageAssets.includes('js: "text/javascript"'));
});
