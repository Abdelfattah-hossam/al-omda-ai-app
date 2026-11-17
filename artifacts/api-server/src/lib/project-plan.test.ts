import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectPlan } from "./project-plan.js";

const step = (index: number) => ({
  text: "Complete project phase " + index,
  output: "Deliverable " + index,
  complete: "The deliverable passes its acceptance check " + index,
});

test("accepts a concise three-step plan", () => {
  const result = parseProjectPlan(JSON.stringify({ title: "Small project", steps: [step(1), step(2), step(3)] }));
  assert.equal(result?.steps.length, 3);
});

test("accepts detailed plans with up to eight steps", () => {
  const result = parseProjectPlan(JSON.stringify({ title: "Large project", steps: Array.from({ length: 8 }, (_, index) => step(index + 1)) }));
  assert.equal(result?.steps.length, 8);
});

test("rejects plans that are too short or exceed the supported detail limit", () => {
  assert.equal(parseProjectPlan(JSON.stringify({ title: "Too short", steps: [step(1), step(2)] })), null);
  assert.equal(parseProjectPlan(JSON.stringify({ title: "Too long", steps: Array.from({ length: 9 }, (_, index) => step(index + 1)) })), null);
});

test("rejects steps without a concrete output or completion check", () => {
  assert.equal(parseProjectPlan(JSON.stringify({ title: "Incomplete", steps: [step(1), step(2), { ...step(3), output: "" }] })), null);
  assert.equal(parseProjectPlan(JSON.stringify({ title: "Incomplete", steps: [step(1), step(2), { text: "Do work", output: "Deliverable" }] })), null);
});

test("accepts JSON wrapped in a Markdown fence with trailing whitespace", () => {
  const json = JSON.stringify({ title: "Fenced plan", steps: [step(1), step(2), step(3)] });
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(parseProjectPlan(fence + "json\n" + json + "\n" + fence + "\n  ")?.title, "Fenced plan");
});

test("rejects malformed, oversized, and incorrectly typed plan data", () => {
  const valid = { title: "Valid", steps: [step(1), step(2), step(3)] };
  assert.equal(parseProjectPlan("{not json"), null);
  assert.equal(parseProjectPlan(JSON.stringify({ ...valid, title: "x".repeat(161) })), null);
  assert.equal(parseProjectPlan(JSON.stringify({ ...valid, steps: "not an array" })), null);
  assert.equal(parseProjectPlan("x".repeat(100_001)), null);
});