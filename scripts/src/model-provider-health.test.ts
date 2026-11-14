import { test } from "node:test";
import { strict as assert } from "node:assert";
import { inspectOpenAIModelList } from "./model-provider-health.js";

test("identifies the configured model in an OpenAI-compatible models response", () => {
  assert.deepEqual(inspectOpenAIModelList({ data: [{ id: "qwen2.5:7b" }, { id: "llama3.1:8b" }] }, "qwen2.5:7b"), {
    modelAvailable: true,
    discoveredModels: ["qwen2.5:7b", "llama3.1:8b"],
  });
});

test("reports a configured model missing from a valid model list", () => {
  assert.deepEqual(inspectOpenAIModelList({ data: [{ id: "local-model" }] }, "other-model"), {
    modelAvailable: false,
    discoveredModels: ["local-model"],
  });
});

test("returns unknown when the endpoint does not expose an OpenAI-compatible model list", () => {
  assert.deepEqual(inspectOpenAIModelList({ models: [{ name: "qwen2.5:7b" }] }, "qwen2.5:7b"), {
    modelAvailable: null,
    discoveredModels: [],
  });
});

test("ignores malformed model entries and caps the discovered list", () => {
  const data = [{ id: "valid" }, null, { name: "missing-id" }, { id: 5 }, ...Array.from({ length: 60 }, (_, index) => ({ id: "model-" + index }))];
  const result = inspectOpenAIModelList({ data }, "valid");
  assert.equal(result.modelAvailable, true);
  assert.equal(result.discoveredModels.length, 50);
  assert.equal(result.discoveredModels[0], "valid");
});

test("ignores oversized model identifiers", () => {
  const result = inspectOpenAIModelList({ data: [{ id: "x".repeat(201) }, { id: "valid" }] }, "valid");
  assert.deepEqual(result, { modelAvailable: true, discoveredModels: ["valid"] });
});
