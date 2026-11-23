export type ActivityTask = {
  id: string;
  title: string;
  specialty: string;
  status: string;
  createdAt: string;
  demo?: boolean;
  steps: Array<{ state: string; executionStatus?: string }>;
};
export type ActivityFilter = "all" | "attention" | "recorded" | "unused";
export function summarizeSpecialty(tasks: ActivityTask[], specialty: string) {
  const records = tasks
    .filter((task) => !task.demo && task.specialty === specialty)
    .slice()
    .sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
    );
  const stepCount = records.reduce((sum, task) => sum + task.steps.length, 0);
  const approvedSteps = records.reduce(
    (sum, task) =>
      sum + task.steps.filter((step) => step.state === "approved").length,
    0,
  );
  return {
    records,
    total: records.length,
    attention: records.filter(
      (task) => task.status === "review" || task.status === "paused",
    ).length,
    approvedSteps,
    stepCount,
    approvalPercent: stepCount
      ? Math.round((approvedSteps / stepCount) * 100)
      : null,
  };
}
export function matchesActivityFilter(
  summary: ReturnType<typeof summarizeSpecialty>,
  filter: ActivityFilter,
) {
  return (
    filter === "all" ||
    (filter === "attention" && summary.attention > 0) ||
    (filter === "recorded" && summary.total > 0) ||
    (filter === "unused" && summary.total === 0)
  );
}
