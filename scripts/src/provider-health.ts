export type ProviderCooldownMap = Map<string, number>;

export function providerFailureCooldownMs(status: number | null): number {
  if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) return 5 * 60_000;
  if (status === 429) return 60_000;
  if (status === 408 || status === 500 || status === 502 || status === 503 || status === 504) return 20_000;
  if (status === null) return 10_000;
  return 5_000;
}

export function parseProviderRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(5 * 60_000, Math.max(1_000, seconds * 1_000));
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(5 * 60_000, Math.max(1_000, timestamp - now));
}

export function recordProviderFailure(
  key: string,
  status: number | null,
  retryAfter: string | null,
  cooldowns: ProviderCooldownMap,
  now = Date.now(),
): number {
  const base = providerFailureCooldownMs(status);
  const retry = status === 429 || status === 503 || status === 504 ? parseProviderRetryAfter(retryAfter, now) : null;
  const duration = Math.min(5 * 60_000, Math.max(base, retry || 0));
  cooldowns.set(key, now + duration);
  return duration;
}

export function getProviderCooldownRemainingMs(key: string, cooldowns: ProviderCooldownMap, now = Date.now()): number {
  const until = cooldowns.get(key);
  if (until === undefined) return 0;
  const remaining = until - now;
  if (remaining <= 0) {
    cooldowns.delete(key);
    return 0;
  }
  return remaining;
}

export function clearProviderCooldown(key: string, cooldowns: ProviderCooldownMap): void {
  cooldowns.delete(key);
}
