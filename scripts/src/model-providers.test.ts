import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseModelProviderConfig } from "./model-providers.js";

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
