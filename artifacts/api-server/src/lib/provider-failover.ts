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
