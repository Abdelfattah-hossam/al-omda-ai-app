export type NewTaskPlanLike = {
  status: string;
  steps: Array<{
    id: string;
    text: string;
    output?: string;
    complete?: string;
    state: string;
    result?: string;
    executedAt?: string;
    executionStatus?: string;
    executionError?: string;
  }>;
};

export function isValidNewTaskPlan(plan: NewTaskPlanLike): boolean {
  return plan.status === "review" &&
    plan.steps.length >= 3 &&
    plan.steps.length <= 8 &&
    plan.steps.every((step) =>
      step.state === "pending" &&
      typeof step.text === "string" && Boolean(step.text.trim()) && step.text.length <= 1200 &&
      typeof step.output === "string" && Boolean(step.output.trim()) && step.output.length <= 1200 &&
      typeof step.complete === "string" && Boolean(step.complete.trim()) && step.complete.length <= 1200 &&
      !step.result && !step.executedAt && !step.executionStatus && !step.executionError
    ) &&
    new Set(plan.steps.map((step) => step.id)).size === plan.steps.length;
}
