import assert from "node:assert/strict";
import test from "node:test";
import { runWithProviderFailover, type HostedProvider } from "./provider-failover.js";

const ok = (text: string) => Promise.resolve({ text, model: "test-model" });

test("falls through to the next provider after a failure and records the reason", async () => {
  const calls: string[] = [];
  const warnings: string[] = [];
  const result = await runWithProviderFailover(
    ["groq", "gemini", "openrouter"],
    async (provider: HostedProvider) => {
      calls.push(provider);
      if (provider === "groq") throw new Error("Groq 503: high demand");
      return ok("answer from " + provider);
    },
    (provider, reason) => warnings.push(provider + " -> " + reason),
  );
  assert.deepEqual(calls, ["groq", "gemini"]);
  assert.equal(result.provider, "gemini");
  assert.equal(result.answer?.text, "answer from gemini");
  assert.deepEqual(result.failures, ["Groq 503: high demand"]);
  assert.deepEqual(warnings, ["groq -> Groq 503: high demand"]);
});

test("tries every configured provider and reports all failures when none respond", async () => {
  const calls: string[] = [];
  const result = await runWithProviderFailover(["groq", "cloudflare", "openrouter", "gemini"], async (provider: HostedProvider) => {
    calls.push(provider);
    throw new Error(provider + " 429: quota exceeded");
  });
  assert.deepEqual(calls, ["groq", "cloudflare", "openrouter", "gemini"]);
  assert.equal(result.answer, null);
  assert.equal(result.provider, "");
  assert.equal(result.failures.length, 4);
  assert.match(result.failures[0], /groq 429/);
  assert.match(result.failures[3], /gemini 429/);
});

test("stops at the first working provider without calling the rest", async () => {
  const calls: string[] = [];
  const result = await runWithProviderFailover(["groq", "gemini"], async (provider: HostedProvider) => {
    calls.push(provider);
    return ok("first try");
  });
  assert.deepEqual(calls, ["groq"]);
  assert.equal(result.answer?.text, "first try");
  assert.equal(result.provider, "groq");
  assert.deepEqual(result.failures, []);
});

test("normalizes non-Error throws to a provider-unavailable reason", async () => {
  const result = await runWithProviderFailover(["groq", "gemini"], async (provider: HostedProvider) => {
    if (provider === "groq") throw "network reset";
    return ok("recovered");
  });
  assert.deepEqual(result.failures, ["Provider unavailable"]);
  assert.equal(result.answer?.text, "recovered");
});

test("an empty provider chain yields no answer and no failures", async () => {
  const result = await runWithProviderFailover([], async () => ok("never"));
  assert.equal(result.answer, null);
  assert.equal(result.provider, "");
  assert.deepEqual(result.failures, []);
});
