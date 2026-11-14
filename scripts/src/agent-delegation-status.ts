export type DelegationTaskStatus = "pending" | "running" | "completed" | "failed";

export type DelegationRunStatus = "running" | "completed" | "partial" | "failed";

/**
 * A delegation remains running while any specialist is pending or running.
 * Once all tasks are terminal, all-completed is completed, all-failed is failed,
 * and a mixture of completed/failed outcomes is partial.
 */
export function getDelegationRunStatus(statuses: readonly DelegationTaskStatus[]): DelegationRunStatus {
  if (statuses.length === 0) return "failed";
  if (statuses.some((status) => status === "pending" || status === "running")) return "running";
  const completed = statuses.filter((status) => status === "completed").length;
  if (completed === statuses.length) return "completed";
  if (completed === 0) return "failed";
  return "partial";
}
