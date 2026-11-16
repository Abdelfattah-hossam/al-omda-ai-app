import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractExplicitMemoryNode, extractUserCorrectionNode, parseMemoryEdge, parseMemoryNode } from "./memory-graph.js";

const userId = "11111111-1111-4111-8111-111111111111";
const nodeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nodeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("normalizes a user-confirmed memory node and binds it to the authenticated owner", () => {
  const node = parseMemoryNode({
    nodeType: "preference",
    label: "  Keep the chat scroll stable  ",
    details: { scope: "Al Omda UI" },
  }, userId);
  assert.equal(node.user_id, userId);
  assert.equal(node.node_type, "preference");
  assert.equal(node.normalized_label, "keep the chat scroll stable");
  assert.equal(node.source, "user_confirmed");
  assert.equal(node.confidence, 1);
});

test("rejects invalid node types, empty labels, oversized details, and sensitive credential fields", () => {
  assert.throws(() => parseMemoryNode({ nodeType: "medical", label: "x" }, userId), /Unsupported/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: " " }, userId), /label/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "???" }, userId), /searchable text/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "x", details: { apiKey: "do-not-store" } }, userId), /credentials or sensitive/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "x", details: { metadata: { medicalNotes: "private" } } }, userId), /credentials or sensitive/);
  assert.throws(() => parseMemoryNode({ nodeType: "other", label: "My medical diagnosis is private" }, userId), /Sensitive personal information/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "x", details: { text: "sk-abcdefghijklmnopqrstuvwxyz123456" } }, userId), /credential or access token/);
});

test("validates graph edges and blocks self-links or unknown relationships", () => {
  const edge = parseMemoryEdge({ sourceNodeId: nodeA, targetNodeId: nodeB, relation: "works_on" }, userId);
  assert.equal(edge.user_id, userId);
  assert.equal(edge.source_node_id, nodeA);
  assert.equal(edge.target_node_id, nodeB);
  assert.throws(() => parseMemoryEdge({ sourceNodeId: nodeA, targetNodeId: nodeA, relation: "works_on" }, userId), /cannot connect/);
  assert.throws(() => parseMemoryEdge({ sourceNodeId: nodeA, targetNodeId: nodeB, relation: "secretly_knows" }, userId), /Unsupported/);
});

test("stores only explicit, non-sensitive memory requests", () => {
  const preference = extractExplicitMemoryNode("Remember that I prefer Arabic replies");
  assert.equal(preference?.nodeType, "preference");
  assert.equal(preference?.label, "I prefer Arabic replies");
  assert.equal(preference?.source, "user_confirmed");
  assert.equal(extractExplicitMemoryNode("How are you?"), null);
  assert.equal(extractExplicitMemoryNode("Do not remember my password"), null);
  assert.equal(extractExplicitMemoryNode("Remember my medical diagnosis"), null);
  assert.equal(extractExplicitMemoryNode("افتكر إن الشات مايتغيرش")?.nodeType, "constraint");
  assert.equal(extractExplicitMemoryNode("احفظ أني أفضّل الرد بالعربية")?.nodeType, "preference");
});

test("canonical setup SQL and the deployed migration define the same private graph protections", async () => {
  const setupUrl = new URL("../../../../supabase/setup.sql", import.meta.url);
  const migrationUrl = new URL("../../../../supabase/migrations/20261116190037_create_private_ai_memory_graph.sql", import.meta.url);
  const [setup, migration] = await Promise.all([readFile(setupUrl, "utf8"), readFile(migrationUrl, "utf8")]);
  for (const sql of [setup, migration]) {
    assert.match(sql, /create table if not exists public\.ai_memory_nodes/i);
    assert.match(sql, /create table if not exists public\.ai_memory_edges/i);
    assert.match(sql, /alter table public\.ai_memory_nodes enable row level security/i);
    assert.match(sql, /alter table public\.ai_memory_edges enable row level security/i);
    assert.match(sql, /revoke all on public\.ai_memory_nodes from public, anon/i);
    assert.match(sql, /revoke all on public\.ai_memory_edges from public, anon/i);
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  }
});

test("captures explicit corrections without storing sensitive personal data", () => {
  const correction = extractUserCorrectionNode("Correction: keep the chat scroll position unchanged");
  assert.equal(correction?.nodeType, "correction");
  assert.equal(correction?.source, "conversation_confirmed");
  assert.equal(extractUserCorrectionNode("That's incorrect: the task has eight steps"), null);
  assert.equal(extractUserCorrectionNode("التصحيح هو عدم تغيير حركة الشات"), null);
  assert.equal(extractUserCorrectionNode("Correction: my medical diagnosis is ..."), null);
});
