import { test } from "node:test";
import { strict as assert } from "node:assert";
import { clearProviderCooldown, getProviderCooldownRemainingMs, parseProviderRetryAfter, providerFailureCooldownMs, recordProviderFailure } from "./provider-health.js";

test("assigns bounded cooldowns for rate limits, server errors, auth errors, and network failures", () => {
  assert.equal(providerFailureCooldownMs(429), 60_000);
  assert.equal(providerFailureCooldownMs(503), 20_000);
  assert.equal(providerFailureCooldownMs(401), 300_000);
  assert.equal(providerFailureCooldownMs(null), 10_000);
  assert.equal(providerFailureCooldownMs(400), 300_000);
});

test("parses Retry-After seconds and HTTP dates with a five-minute maximum", () => {
  const now = 1_800_000_000_000;
  assert.equal(parseProviderRetryAfter("30", now), 30_000);
  assert.equal(parseProviderRetryAfter("9999", now), 300_000);
  assert.equal(parseProviderRetryAfter(new Date(now + 45_000).toUTCString(), now), 45_000);
  assert.equal(parseProviderRetryAfter("invalid", now), null);
});

test("records, expires, and clears provider cooldowns", () => {
  const cooldowns = new Map<string, number>();
  const now = 1_800_000_000_000;
  assert.equal(recordProviderFailure("gemini", 429, "120", cooldowns, now), 120_000);
  assert.equal(getProviderCooldownRemainingMs("gemini", cooldowns, now + 1_000), 119_000);
  assert.equal(getProviderCooldownRemainingMs("gemini", cooldowns, now + 120_000), 0);
  recordProviderFailure("openrouter", 503, null, cooldowns, now);
  clearProviderCooldown("openrouter", cooldowns);
  assert.equal(getProviderCooldownRemainingMs("openrouter", cooldowns, now), 0);
});
