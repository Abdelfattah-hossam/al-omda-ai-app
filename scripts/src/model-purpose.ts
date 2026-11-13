import type { ModelPurpose } from "./model-providers.js";

export function inferModelPurpose(goal: string): ModelPurpose {
  const text = goal.toLocaleLowerCase();
  if (/\b(review|audit|inspect|code review|security review|vulnerability)\b|مراجعة|راجع|تدقيق|افحص|فحص|تقييم أمني|تقييم امني/u.test(text)) return "review";
  if (/\b(code|coding|program|programming|bug|refactor|debug|typescript|javascript|python|feature)\b|\b(implement|build|develop)\s+(an?\s+)?(app|application|website|site|software|api|service|feature)\b|برمج|برمجة|كود|تطوير\s+(برمجي|موقع|تطبيق)|صلح\s+الكود|إصلاح\s+الكود|اصلح\s+الكود|عدل.*كود|تعديل.*كود|اكتب\s+كود|نفذ\s+ميزة|اعمل.*(موقع|تطبيق|مشروع برمجي)|أنشئ\s+(موقع|تطبيق)|ابني\s+(موقع|تطبيق)/u.test(text)) return "coding";
  if (/\b(research|investigate|compare|analyze|analysis|explain|summarize|find|search)\b|بحث|ابحث|قارن|تحليل|حلل|اشرح|معلومات|استكشف/u.test(text)) return "research";
  return "general";
}
