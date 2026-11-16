import type { ModelPurpose } from "./model-providers.js";
import { inferAgentDomain } from "./agent-quality.js";

export function inferModelPurpose(goal: string): ModelPurpose {
  const text = goal.toLocaleLowerCase();
  if (/\b(review|audit|inspect|code review|security review|vulnerability)\b|مراجعة|راجع|تدقيق|افحص|فحص|تقييم أمني|تقييم امني/u.test(text)) return "review";
  const domain = inferAgentDomain(goal);
  if (domain === "legal") return "legal";
  if (domain === "engineering") return "engineering";
  if (domain === "medical") return "medical";
  if (domain === "finance") return "finance";
  if (domain === "software") return "coding";
  if (domain === "business") return "business";
  if (domain === "research") return "research";
  return "general";
}
