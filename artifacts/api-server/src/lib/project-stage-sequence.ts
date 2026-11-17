export type ProjectStagePrerequisite = {
  state: string;
  result?: string | null;
};

/**
 * A stage may execute only after every earlier stage is approved and has a
 * non-empty, persisted deliverable. Approval alone is not completion.
 */
export function hasCompletedPriorProjectStages(
  steps: readonly ProjectStagePrerequisite[],
  stepIndex: number,
): boolean {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) return false;
  return steps.slice(0, stepIndex).every(
    (step) => step.state === "approved" && typeof step.result === "string" && step.result.trim().length > 0,
  );
}
