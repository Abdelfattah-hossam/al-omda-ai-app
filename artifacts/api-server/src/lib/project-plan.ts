export type ProjectPlanStep = {
  text: string;
  output: string;
  complete: string;
};

export type ProjectPlan = {
  title: string;
  steps: ProjectPlanStep[];
};

const MAX_PLAN_STEPS = 8;
const MAX_STEP_FIELD_LENGTH = 1200;

/**
 * Parse and validate the model-generated execution plan before it is persisted.
 * Keep this deliberately strict so incomplete or generic JSON is repaired rather
 * than shown as an approved-looking project plan.
 */
export function parseProjectPlan(raw: string): ProjectPlan | null {
  try {
    let jsonText = raw.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    const value = JSON.parse(jsonText) as unknown;
    if (!value || typeof value !== "object") return null;
    const plan = value as Record<string, unknown>;
    if (
      typeof plan.title !== "string" ||
      !plan.title.trim() ||
      plan.title.trim().length > 160 ||
      !Array.isArray(plan.steps) ||
      plan.steps.length < 3 ||
      plan.steps.length > MAX_PLAN_STEPS
    ) return null;

    const steps: ProjectPlanStep[] = [];
    for (const item of plan.steps) {
      if (!item || typeof item !== "object") return null;
      const step = item as Record<string, unknown>;
      if (
        typeof step.text !== "string" || !step.text.trim() || step.text.length > MAX_STEP_FIELD_LENGTH ||
        typeof step.output !== "string" || !step.output.trim() || step.output.length > MAX_STEP_FIELD_LENGTH ||
        typeof step.complete !== "string" || !step.complete.trim() || step.complete.length > MAX_STEP_FIELD_LENGTH
      ) return null;
      steps.push({
        text: step.text.trim(),
        output: step.output.trim(),
        complete: step.complete.trim(),
      });
    }
    return { title: plan.title.trim(), steps };
  } catch {
    return null;
  }
}
