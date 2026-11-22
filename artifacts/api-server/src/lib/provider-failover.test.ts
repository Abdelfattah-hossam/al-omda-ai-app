import assert from "node:assert/strict";
import test from "node:test";
import { callWithRateLimitRetry, isRateLimitError, parseRetryAfterSeconds, runWithProviderFailover, type HostedProvider } from "./provider-failover.js";

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

test("parseRetryAfterSeconds reads provider wait windows", () => {
  assert.equal(parseRetryAfterSeconds("Groq 429: Rate limit reached for model `openai/gpt-oss-20b` on tokens per minute (TPM): Limit 8000, Used 5614, Requested 6638. Please try again in 31.8899999999s."), 32);
  assert.equal(parseRetryAfterSeconds("HTTP 429, retry-after: 12"), 12);
  assert.equal(parseRetryAfterSeconds("429 Provider returned error"), null);
  assert.equal(parseRetryAfterSeconds("socket hangup"), null);
});

test("isRateLimitError spots quota failures only", () => {
  assert.ok(isRateLimitError("Groq 429: Rate limit reached (TPM)"));
  assert.ok(isRateLimitError("quota exceeded for today"));
  assert.ok(!isRateLimitError("HTTP 500 internal error"));
});

test("callWithRateLimitRetry waits out a short quota window then succeeds", async () => {
  const sleeps: number[] = [];
  let attempts = 0;
  const answer = await callWithRateLimitRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Groq 429: Please try again in 2.5s.");
    return { text: "ok", model: "m" };
  }, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(answer.text, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [4000]);
});

test("callWithRateLimitRetry fails over on long windows and non-quota errors", async () => {
  await assert.rejects(() => callWithRateLimitRetry(async () => { throw new Error("try again in 300s"); }, { sleep: async () => {} }), /300s/);
  await assert.rejects(() => callWithRateLimitRetry(async () => { throw new Error("HTTP 500"); }, { sleep: async () => {} }), /500/);
});
