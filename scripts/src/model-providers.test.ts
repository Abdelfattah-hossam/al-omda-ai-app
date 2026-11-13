import { test } from "node:test";
import { strict as assert } from "node:assert";
import { orderModelProvidersByPurpose, parseModelProviderConfig } from "./model-providers.js";

test("parses multiple OpenAI-compatible and local model providers without exposing keys", () => {
  const providers = parseModelProviderConfig([
    { name: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "provider/model", apiKeyEnv: "OPENROUTER_API_KEY" },
    { name: "lm-studio", baseUrl: "http://127.0.0.1:1234/v1", model: "local-model" },
    { name: "ollama", baseUrl: "http://localhost:11434/v1", model: "qwen-local" },
  ], { OPENROUTER_API_KEY: "private-key" });
  assert.equal(providers.length, 3);
  assert.equal(providers[0].key, "private-key");
  assert.equal(providers[1].key, "");
  assert.equal(providers[2].base, "http://localhost:11434/v1");
});

test("skips providers whose configured API key is not available", () => {
  const providers = parseModelProviderConfig([
    { name: "remote", baseUrl: "https://api.example/v1", model: "model", apiKeyEnv: "MISSING_KEY" },
    { name: "local", baseUrl: "http://127.0.0.1:1234/v1", model: "local" },
  ], {});
  assert.deepEqual(providers.map((provider) => provider.name), ["local"]);
});

test("rejects insecure remote endpoints, embedded credentials, and invalid config", () => {
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "http://remote.example/v1", model: "x" }], {}), /HTTPS/);
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "https://user:pass@example.com/v1", model: "x" }], {}), /HTTPS/);
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "https://example.com/v1?key=secret", model: "x" }], {}), /HTTPS/);
  assert.throws(() => parseModelProviderConfig({ name: "not-array" }, {}), /JSON array/);
});

test("parses purpose and priority policies with backward-compatible defaults", () => {
  const providers = parseModelProviderConfig([
    { name: "research", baseUrl: "https://research.example/v1", model: "r1", purposes: ["research"], priority: 20 },
    { name: "coding", baseUrl: "https://coding.example/v1", model: "c1", purposes: ["coding"], priority: 5 },
    { name: "global", baseUrl: "https://global.example/v1", model: "g1" }
  ], {});
  assert.deepEqual(providers.map(p => [p.name, p.priority, p.purposes]), [
    ["research", 20, ["research"]], ["coding", 5, ["coding"]], ["global", 102, ["all"]]
  ]);
});

test("rejects invalid provider priority and purpose policies", () => {
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "https://a.example/v1", model: "x", priority: 0 }], {}), /priority/);
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "https://a.example/v1", model: "x", purposes: ["vision"] }], {}), /purposes/);
  assert.throws(() => parseModelProviderConfig([{ name: "bad", baseUrl: "https://a.example/v1", model: "x", purposes: ["coding", "coding"] }], {}), /purposes/);
});

test("orders purpose-specific providers before global providers and uses priority within each group", () => {
  const providers = parseModelProviderConfig([
    { name: "global", baseUrl: "https://global.example/v1", model: "g", priority: 1 },
    { name: "coding-late", baseUrl: "https://late.example/v1", model: "l", purposes: ["coding"], priority: 20 },
    { name: "coding-early", baseUrl: "https://early.example/v1", model: "e", purposes: ["coding"], priority: 5 },
  ], {});
  assert.deepEqual(orderModelProvidersByPurpose(providers, "coding").map((p) => p.name), ["coding-early", "coding-late", "global"]);
  assert.deepEqual(orderModelProvidersByPurpose(providers, "all").map((p) => p.name), ["global", "coding-early", "coding-late"]);
});
