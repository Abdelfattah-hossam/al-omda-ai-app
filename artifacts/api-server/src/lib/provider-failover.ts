export type HostedProvider = "gemini" | "openrouter" | "groq" | "cloudflare";

export type ProviderAnswer = { text: string; model: string };

export type FailoverResult = {
  answer: ProviderAnswer | null;
  provider: string;
  failures: string[];
};

// Walks the configured free-provider chain in order and returns the first
// working answer. Every provider error is recorded so the caller can report
// an honest, quota-safe failure when no provider responds.
export async function runWithProviderFailover(
  providers: readonly string[],
  call: (provider: HostedProvider) => Promise<ProviderAnswer>,
  onFailure?: (provider: string, reason: string) => void,
): Promise<FailoverResult> {
  const failures: string[] = [];
  for (const candidate of providers) {
    try {
      const answer = await call(candidate as HostedProvider);
      return { answer, provider: candidate, failures };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provider unavailable";
      failures.push(reason);
      onFailure?.(candidate, reason);
    }
  }
  return { answer: null, provider: "", failures };
}

// Groq-style rate-limit messages carry their own wait window
// ("Please try again in 31.89s"); honor it instead of hammering.
export function parseRetryAfterSeconds(message: string): number | null {
  const match = /try again in\s*([\d.]+)\s*s(?:econds?)?\b/i.exec(message)
    ?? /retry[- ]?after[^0-9]*([\d.]+)/i.exec(message);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null;
}

export function isRateLimitError(message: string): boolean {
  return /\b429\b|rate limit|too many requests|\bTPM\b|\bRPM\b|quota exceeded/i.test(message);
}

// One patient retry for per-minute quota windows: wait out short windows
// (capped) and try the same provider once more; fail over on longer windows
// or non-quota errors so the next provider in the chain can answer.
export async function callWithRateLimitRetry<T>(
  invoke: () => Promise<T>,
  options?: { maxWaitSeconds?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const maxWait = options?.maxWaitSeconds ?? 45;
  const doSleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    return await invoke();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isRateLimitError(message)) throw error;
    const wait = parseRetryAfterSeconds(message);
    if (wait === null || wait > maxWait) throw error;
    await doSleep((wait + 1) * 1000);
    return invoke();
  }
}
