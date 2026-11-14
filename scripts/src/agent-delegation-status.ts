export type DelegationTaskStatus = "pending" | "running" | "completed" | "failed";

export type DelegationRunStatus = "completed" | "partial" | "failed";

/**
 * A delegation is only fully completed when every specialist completed.
 * Mixed outcomes are partial; an all-failed (or empty) run is failed.
 */
export function getDelegationRunStatus(statuses: readonly DelegationTaskStatus[]): DelegationRunStatus {
  if (statuses.length === 0) return "failed";
  const completed = statuses.filter((status) => status === "completed").length;
  if (completed === statuses.length) return "completed";
  if (completed === 0 && statuses.every((status) => status === "failed")) return "failed";
  return "partial";
}
