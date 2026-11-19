export type ThroughputAccumulator = {
  completionTokens: number;
  generationDurationMs: number;
  hasCompleteUsage: boolean;
};

export function createThroughputAccumulator(): ThroughputAccumulator {
  return { completionTokens: 0, generationDurationMs: 0, hasCompleteUsage: true };
}

export function addThroughputSample(
  accumulator: ThroughputAccumulator,
  completionTokens: number | null,
  generationDurationMs: number,
): void {
  if (completionTokens === null || !Number.isFinite(completionTokens) || completionTokens < 0) {
    accumulator.hasCompleteUsage = false;
    return;
  }
  if (!Number.isFinite(generationDurationMs) || generationDurationMs < 0 || (completionTokens > 0 && generationDurationMs === 0)) {
    accumulator.hasCompleteUsage = false;
    return;
  }
  accumulator.completionTokens += completionTokens;
  accumulator.generationDurationMs += generationDurationMs;
}

export function calculateTokensPerSecond(accumulator: ThroughputAccumulator): number | null {
  if (!accumulator.hasCompleteUsage || accumulator.generationDurationMs <= 0) return null;
  return Math.round((accumulator.completionTokens / accumulator.generationDurationMs) * 1000 * 10) / 10;
}
