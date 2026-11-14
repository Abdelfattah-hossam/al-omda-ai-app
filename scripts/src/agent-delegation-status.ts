export type DelegationTaskStatus = "pending" | "running" | "completed" | "failed";

export type DelegationRunStatus = "running" | "completed" | "partial" | "failed";

/**
 * A delegation remains running while any specialist is pending or running.
 * Once all tasks are terminal, all-completed is completed, all-failed is failed,
 * and a mixture of completed/failed outcomes is partial.
 */
export function getDelegationRunStatus(statuses: readonly DelegationTaskStatus[]): DelegationRunStatus {
  if (statuses.length === 0) return "failed";
  let completed = 0;
  let failed = 0;
  let hasNonTerminal = false;
  for (const status of statuses) {
    if (status === "completed") completed++;
    else if (status === "failed") failed++;
    else hasNonTerminal = true;
  }
  if (hasNonTerminal) return "running";
  if (completed === statuses.length) return "completed";
  if (failed === statuses.length) return "failed";
  return "partial";
}
