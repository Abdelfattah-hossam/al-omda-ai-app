import type { ModelPurpose } from "./model-providers.js";

export function inferModelPurpose(goal: string): ModelPurpose {
  const text = goal.toLocaleLowerCase();
  if (/\b(review|audit|inspect|code review|security review|vulnerability)\b|مراجعة|راجع|تدقيق|افحص|فحص|تقييم أمني|تقييم امني/u.test(text)) return "review";
  if (/\b(implement|implementation|build|fix|bug|refactor|debug|program|develop|coding|code|feature|typescript|javascript|python)\b|برمج|برمجة|كود|تطوير|صلح|إصلاح|اصلح|تعديل.*ملف|بناء.*مشروع/u.test(text)) return "coding";
  if (/\b(research|investigate|compare|analyze|analysis|explain|summarize|find|search)\b|بحث|ابحث|قارن|تحليل|حلل|اشرح|معلومات|استكشف/u.test(text)) return "research";
  return "general";
}
