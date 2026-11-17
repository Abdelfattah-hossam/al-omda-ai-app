import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sql = readFileSync(resolve(process.cwd(), "../supabase/setup.sql"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "../supabase/migrations/20261117123000_require_previous_project_stage_results.sql"), "utf8");
const sequenceMigration = readFileSync(resolve(process.cwd(), "../supabase/migrations/20261117150000_require_successful_prior_project_stages.sql"), "utf8");
const legacyQuota = readFileSync(resolve(process.cwd(), "../supabase/ai_quota.sql"), "utf8");

function functionDefinition(schema: string, name: string): string {
  const start = sql.indexOf("create or replace function " + schema + "." + name + "(");
  assert.notEqual(start, -1, schema + "." + name + " must be defined");
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, schema + "." + name + " must be terminated");
  return sql.slice(start, end + 4);
}

test("exposed quota RPCs are SECURITY INVOKER wrappers", () => {
  for (const name of ["get_ai_daily_usage", "consume_ai_units", "complete_ai_task_step", "create_ai_task_with_quota"]) {
    const definition = functionDefinition("public", name);
    assert.match(definition, /security invoker/i, name);
    assert.doesNotMatch(definition, /security definer/i, name);
    assert.match(definition, new RegExp("omda_private\\." + name));
  }
});

test("privileged quota implementations are isolated in the non-exposed schema", () => {
  assert.match(sql, /create schema if not exists omda_private/i);
  assert.match(sql, /revoke all on schema omda_private from public, anon/i);
  for (const name of ["get_ai_daily_usage", "consume_ai_units", "complete_ai_task_step", "create_ai_task_with_quota"]) {
    const definition = functionDefinition("omda_private", name);
    assert.match(definition, /security definer/i, name);
    assert.match(definition, /set search_path = ''/i, name);
    const helperGrantStart = sql.indexOf("grant execute on function omda_private." + name);
    assert.notEqual(helperGrantStart, -1, name + " private grant");
    assert.ok(sql.indexOf("to authenticated", helperGrantStart) > helperGrantStart, name + " private grant role");
  }
});

test("legacy quota SQL cannot restore exposed SECURITY DEFINER functions", () => {
  assert.match(legacyQuota, /deprecated legacy script/i);
  assert.doesNotMatch(legacyQuota, /create or replace function public\./i);
  assert.match(legacyQuota, /setup\.sql/i);
});

test("pending database migration secures every quota RPC without changing public RPC names", () => {
  for (const name of ["get_ai_daily_usage", "consume_ai_units", "complete_ai_task_step", "create_ai_task_with_quota"]) {
    assert.ok(migration.includes("create or replace function omda_private." + name + "("), name + " private implementation");
    const publicStart = migration.indexOf("create or replace function public." + name + "(");
    assert.notEqual(publicStart, -1, name + " public wrapper");
    const publicEnd = migration.indexOf("\n$$;", publicStart);
    assert.notEqual(publicEnd, -1, name + " public wrapper terminator");
    const publicDefinition = migration.slice(publicStart, publicEnd + 4);
    assert.match(publicDefinition, /security invoker/i, name);
    assert.doesNotMatch(publicDefinition, /security definer/i, name);
    const revokeStart = migration.indexOf("revoke all on function public." + name, publicEnd);
    assert.notEqual(revokeStart, -1, name + " public revoke");
    assert.ok(migration.indexOf("from public, anon", revokeStart) > revokeStart, name + " revoke roles");
    const grantStart = migration.indexOf("grant execute on function public." + name, revokeStart);
    assert.notEqual(grantStart, -1, name + " public grant");
    assert.ok(migration.indexOf("to authenticated", grantStart) > grantStart, name + " grant role");
  }
  assert.ok(migration.includes("create or replace function omda_private.complete_ai_task_step("));
});

test("sequential completion migration requires successful prior stage execution", () => {
  assert.ok(sequenceMigration.includes("executionStatus"));
  assert.ok(sequenceMigration.includes("item.ordinality < v_step_index"));
  const completion = functionDefinition("omda_private", "complete_ai_task_step");
  assert.match(completion, /item\.value ->> 'executionStatus' is distinct from 'succeeded'/i);
  assert.match(completion, /nullif\(btrim\(item\.value ->> 'result'\), ''\) is null/i);
});
test("private user tables and storage buckets retain ownership RLS", () => {
  for (const table of ["profiles", "tasks", "ai_daily_usage", "ai_chat_history", "ai_user_memory", "ai_memory_nodes", "ai_memory_edges", "ai_conversations"]) {
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security", "i"), table);
  }
  assert.match(sql, /workspace_assets_select_own[\s\S]*?bucket_id = 'workspace-assets'[\s\S]*?auth\.uid\(\)/i);
  assert.match(sql, /workspace_assets_insert_own[\s\S]*?bucket_id = 'workspace-assets'[\s\S]*?auth\.uid\(\)/i);
});

test("memory graph is bounded and prevents cross-user relationships", () => {
  const nodes = sql.slice(sql.indexOf("create table if not exists public.ai_memory_nodes"), sql.indexOf("create table if not exists public.ai_memory_edges"));
  const edges = sql.slice(sql.indexOf("create table if not exists public.ai_memory_edges"), sql.indexOf("-- Independent private conversations"));
  assert.match(nodes, /details jsonb[\s\S]*?pg_column_size\(details\) <= 8192/i);
  assert.match(nodes, /unique \(id, user_id\)/i);
  assert.match(nodes, /ai_memory_nodes_user_all[\s\S]*?auth\.uid\(\)/i);
  assert.match(edges, /pg_column_size\(details\) <= 4096/i);
  assert.match(edges, /foreign key \(source_node_id, user_id\)[\s\S]*?references public\.ai_memory_nodes\(id, user_id\)/i);
  assert.match(edges, /foreign key \(target_node_id, user_id\)[\s\S]*?references public\.ai_memory_nodes\(id, user_id\)/i);
  assert.match(edges, /check \(source_node_id <> target_node_id\)/i);
  assert.match(edges, /ai_memory_edges_user_all[\s\S]*?auth\.uid\(\)/i);
});

test("task completion RPC caps stored result payloads and charges quota atomically", () => {
  const completion = functionDefinition("omda_private", "complete_ai_task_step");
  assert.match(completion, /octet_length\(p_result\) > 500000/i);
  assert.match(completion, /for update/i);
  assert.match(completion, /item\.value ->> 'executionStatus' is distinct from 'succeeded'/i);
  assert.match(completion, /insert into public\.ai_daily_usage[\s\S]*?on conflict/i);
  assert.match(completion, /update public\.tasks[\s\S]*?set steps = v_updated_steps/i);
});

test("project creation validates bounded steps and writes quota in the same transaction", () => {
  const creation = functionDefinition("omda_private", "create_ai_task_with_quota");
  assert.match(creation, /jsonb_array_length\(p_steps\) not between 3 and 8/i);
  assert.match(creation, /insert into public\.ai_daily_usage[\s\S]*?on conflict/i);
  assert.match(creation, /insert into public\.tasks/i);
});
