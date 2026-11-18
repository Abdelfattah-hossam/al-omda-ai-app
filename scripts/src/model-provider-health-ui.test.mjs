import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseModelProviderHealth, parseModelProviderInfo, providerStatusLabel } from "../../artifacts/al-omda-ai/src/lib/model-provider-health.ts";

const validHealth = {
  name: "local",
  model: "qwen-local",
  kind: "local",
  reachable: true,
  endpointAvailable: true,
  status: 200,
  latencyMs: 12,
  modelAvailable: true,
  discoveredModels: ["qwen-local"],
};

test("provider health parser accepts valid entries and filters malformed entries", () => {
  assert.deepEqual(parseModelProviderHealth([validHealth]), [validHealth]);
  assert.deepEqual(parseModelProviderHealth([
    validHealth,
    { ...validHealth, latencyMs: "fast" },
    { ...validHealth, kind: "unknown" },
    { ...validHealth, discoveredModels: ["ok", 2] },
    null,
  ]), [validHealth]);
  assert.deepEqual(parseModelProviderHealth({ providers: [validHealth] }), []);
});

test("provider inventory parser validates required and optional fields", () => {
  const valid = { name: "openrouter", model: "provider/model", kind: "remote", hasApiKey: true, purposes: ["coding"], priority: 3 };
  assert.deepEqual(parseModelProviderInfo([valid]), [valid]);
  assert.deepEqual(parseModelProviderInfo([valid, { ...valid, hasApiKey: "yes" }, { ...valid, priority: Infinity }, null]), [valid]);
  assert.deepEqual(parseModelProviderInfo(null), []);
});

test("provider status labels avoid overstating model readiness", () => {
  assert.equal(providerStatusLabel(null, false), "Not tested");
  assert.equal(providerStatusLabel({ ...validHealth, reachable: false, error: "timeout" }, false), "Timed out");
  assert.equal(providerStatusLabel({ ...validHealth, reachable: false }, false), "Offline");
  assert.equal(providerStatusLabel(validHealth, false), "Model listed");
  assert.equal(providerStatusLabel({ ...validHealth, modelAvailable: false }, false), "Model not listed");
  assert.equal(providerStatusLabel({ ...validHealth, modelAvailable: null }, false), "Endpoint reachable");
  assert.equal(providerStatusLabel({ ...validHealth, endpointAvailable: false, error: "authentication_failed" }, false), "Auth rejected");
  assert.equal(providerStatusLabel({ ...validHealth, endpointAvailable: false }, true), "واجهة النماذج غير متاحة");
  assert.equal(providerStatusLabel(null, true), "لم يُفحص");
});
