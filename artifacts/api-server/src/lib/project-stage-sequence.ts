export type ProjectStagePrerequisite = {
  state: string;
  result?: string | null;
  executedAt?: string | null;
  executionStatus?: string | null;
};

/**
 * A stage may execute only after every earlier stage is approved and has a
 * non-empty, persisted deliverable. Approval alone is not completion.
 *
 * Older task records predate executionStatus. For those records, a persisted
 * result plus executedAt is the completion evidence; an explicit failed status
 * is never treated as success.
 */
export function hasCompletedPriorProjectStages(
  steps: readonly ProjectStagePrerequisite[],
  stepIndex: number,
): boolean {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) return false;
  return steps.slice(0, stepIndex).every((step) => {
    const hasSavedResult = typeof step.result === "string" && step.result.trim().length > 0;
    const explicitlySucceeded = step.executionStatus === "succeeded";
    const legacyCompletion = step.executionStatus == null &&
      typeof step.executedAt === "string" && step.executedAt.trim().length > 0;
    return step.state === "approved" && hasSavedResult &&
      (explicitlySucceeded || legacyCompletion);
  });
}
