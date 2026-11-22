import assert from "node:assert/strict";
import test from "node:test";
import { getWorkersAiBinding, setWorkersAiBinding } from "./cloudflare-ai.js";

test("a binding with a run method is captured for provider use", () => {
  const binding = { run: async () => ({ response: "ok" }) };
  setWorkersAiBinding(binding);
  assert.equal(getWorkersAiBinding(), binding);
  setWorkersAiBinding(undefined);
});

test("missing or malformed bindings clear the fallback", () => {
  setWorkersAiBinding({ run: async () => ({ response: "ok" }) });
  setWorkersAiBinding(undefined);
  assert.equal(getWorkersAiBinding(), null);
  setWorkersAiBinding({ notRun: true });
  assert.equal(getWorkersAiBinding(), null);
  setWorkersAiBinding(null);
  assert.equal(getWorkersAiBinding(), null);
});
