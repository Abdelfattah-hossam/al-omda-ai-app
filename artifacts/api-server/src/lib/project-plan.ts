export type ProjectPlanStep = { text: string; output: string; complete: string };
export type ProjectPlan = { title: string; steps: ProjectPlanStep[] };

const MAX_PLAN_STEPS = 8;
const MAX_STEP_FIELD_LENGTH = 1200;

/** Validate model-generated plans before they can be shown for approval. */
export function parseProjectPlan(raw: string, request = ""): ProjectPlan | null {
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
      !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > MAX_PLAN_STEPS) return null;
    const steps: ProjectPlanStep[] = [];
    for (const item of plan.steps) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const step = item as Record<string, unknown>;
      if (typeof step.text !== "string" || !step.text.trim() || step.text.trim().length > MAX_STEP_FIELD_LENGTH ||
        typeof step.output !== "string" || !step.output.trim() || step.output.trim().length > MAX_STEP_FIELD_LENGTH ||
        typeof step.complete !== "string" || !step.complete.trim() || step.complete.trim().length > MAX_STEP_FIELD_LENGTH) return null;
      steps.push({ text: step.text.trim(), output: step.output.trim(), complete: step.complete.trim() });
    }
    const requestedCount = getRequestedPlanStepCount(request);
    if (requestedCount !== null && steps.length !== requestedCount) return null;
    if (steps.some(step => promisesUnsupportedMedia(step.output))) return null;
    return { title: plan.title.trim(), steps };
  } catch {
    return null;
  }
}

/** Exact stage counts are a contract, not a hint to the planner. */
export function getRequestedPlanStepCount(request: string): number | null {
  const original = request.split("Relevant earlier project context (only details that apply):")[0];
  const normalized = original.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const digitMatch = normalized.match(/(?:^|\s)([1-8])\s*(?:مراحل|مرحلة|خطوات|خطوة|steps?|stages?)(?:\b|\s|$)/i);
  if (digitMatch) return Number(digitMatch[1]);
  if (/(?:مرحلة|خطوة)\s*(?:واحدة|واحده)|(?:one|single)\s+(?:step|stage)/i.test(normalized)) return 1;
  if (/مرحلتين|خطوتين|(?:two)\s+(?:steps|stages)/i.test(normalized)) return 2;
  return null;
}

/** This text-only execution pipeline cannot produce image/video binaries. */
export function promisesUnsupportedMedia(output: string): boolean {
  // A script or storyboard for a video is a valid text deliverable.
  return /\.(?:mp4|mov|webm|png|jpe?g|webp)(?:\b|$)|(?:ملف|فيديو)\s+(?:فيديو\s+)?(?:جاهز|نهائي|منتج|مُنتج)|(?:rendered|generated|finished|downloadable)\s+(?:video|image)/i.test(output);
}
