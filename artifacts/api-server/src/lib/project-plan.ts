export type ProjectPlanStep = { text: string; output: string; complete: string };
export type ProjectPlan = { title: string; steps: ProjectPlanStep[] };

const MAX_PLAN_STEPS = 8;
const MAX_STEP_FIELD_LENGTH = 1200;

/** Validate model-generated plans before they can be shown for approval. */
export function parseProjectPlan(raw: string): ProjectPlan | null {
  if (typeof raw !== "string" || raw.length > 100_000) return null;
  try {
    let jsonText = raw.trim();
    const fence = String.fromCharCode(96).repeat(3);
    if (jsonText.startsWith(fence)) {
      jsonText = jsonText.replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "").replace(new RegExp("\\s*" + fence + "\\s*$"), "").trim();
    }
    const value: unknown = JSON.parse(jsonText);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const plan = value as Record<string, unknown>;
    if (typeof plan.title !== "string" || !plan.title.trim() || plan.title.trim().length > 160 ||
      !Array.isArray(plan.steps) || plan.steps.length < 3 || plan.steps.length > MAX_PLAN_STEPS) return null;
    const steps: ProjectPlanStep[] = [];
    for (const item of plan.steps) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const step = item as Record<string, unknown>;
      if (typeof step.text !== "string" || !step.text.trim() || step.text.trim().length > MAX_STEP_FIELD_LENGTH ||
        typeof step.output !== "string" || !step.output.trim() || step.output.trim().length > MAX_STEP_FIELD_LENGTH ||
        typeof step.complete !== "string" || !step.complete.trim() || step.complete.trim().length > MAX_STEP_FIELD_LENGTH) return null;
      steps.push({ text: step.text.trim(), output: step.output.trim(), complete: step.complete.trim() });
    }
    return { title: plan.title.trim(), steps };
  } catch {
    return null;
  }
}