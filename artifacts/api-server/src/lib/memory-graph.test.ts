import test from "node:test";
import assert from "node:assert/strict";
import { parseMemoryEdge, parseMemoryNode } from "./memory-graph.js";

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
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "x", details: { apiKey: "do-not-store" } }, userId), /credentials or sensitive/);
  assert.throws(() => parseMemoryNode({ nodeType: "project", label: "x", details: { metadata: { medicalNotes: "private" } } }, userId), /credentials or sensitive/);
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
