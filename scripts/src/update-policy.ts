export type UpdateCheckState = {
  enabled: boolean;
  branch: string;
  workingTreeClean: boolean;
  behind: number;
  ahead: number;
  activeRuns: number;
};

export type UpdateDecision = { apply: boolean; reason: "disabled" | "wrong-branch" | "dirty-worktree" | "local-commits" | "agent-busy" | "up-to-date" | "update-available" };

export function decideSafeUpdate(state: UpdateCheckState): UpdateDecision {
  if (!state.enabled) return { apply: false, reason: "disabled" };
  if (state.branch !== "main") return { apply: false, reason: "wrong-branch" };
  if (!state.workingTreeClean) return { apply: false, reason: "dirty-worktree" };
  if (state.ahead > 0) return { apply: false, reason: "local-commits" };
  if (state.activeRuns > 0) return { apply: false, reason: "agent-busy" };
  if (state.behind <= 0) return { apply: false, reason: "up-to-date" };
  return { apply: true, reason: "update-available" };
}
