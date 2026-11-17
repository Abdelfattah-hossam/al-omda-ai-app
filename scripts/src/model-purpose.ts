import type { ModelPurpose } from "./model-providers.js";

export function inferModelPurpose(goal: string): ModelPurpose {
  const text = goal.normalize("NFKC").toLocaleLowerCase();
  if (/\\b(legal|law|lawyer|attorney|contract|compliance|statute|regulation|litigation)\\b|قانون|قانوني|محام|عقد|امتثال|تشريع|دعوى|لائحة/u.test(text)) return "legal";
  if (/\\b(engineering|structural|civil engineering|mechanical|electrical|load calculation|beam|foundation|hvac)\\b|هندسة|هندسي|إنشائي|انشائي|مدني|ميكانيكي|كهربائي|حمل|كمرة|أساس/u.test(text)) return "engineering";
  if (/\\b(medical|clinical|healthcare|diagnosis|diagnostic|treatment|patient|symptom|medication|clinical trial)\\b|طب|طبي|صحة|تشخيص|علاج|مريض|أعراض|اعراض|دواء|سريري/u.test(text)) return "medical";
  if (/\\b(finance|financial|accounting|budget|investment|tax|cash flow|balance sheet|audit accounts)\\b|مالية|مالي|محاسبة|ميزانية|استثمار|ضرائب|تدفق نقدي|قوائم مالية/u.test(text)) return "finance";
  if (/\\b(marketing campaign|sales strategy|sales forecast|business plan|market analysis|customer acquisition|go-to-market|operations strategy)\\b|حملة تسويقية|خطة مبيعات|توقعات المبيعات|خطة عمل|تحليل السوق|اكتساب العملاء|استراتيجية تشغيل/u.test(text)) return "business";
  if (/\b(review|audit|inspect|code review|security review|vulnerability)\b|مراجعة|راجع|تدقيق|افحص|فحص|تقييم أمني|تقييم امني/u.test(text)) return "review";
  if (/\b(code|coding|program|programming|bug|refactor|debug|typescript|javascript|python|feature)\b|\b(implement|build|develop)\s+(an?\s+)?(app|application|website|site|software|api|service|feature)\b|برمج|برمجة|كود|تطوير\s+(برمجي|موقع|تطبيق)|صلح\s+الكود|إصلاح\s+الكود|اصلح\s+الكود|عدل.*كود|تعديل.*كود|اكتب\s+كود|نفذ\s+ميزة|اعمل.*(موقع|تطبيق|مشروع برمجي)|أنشئ\s+(موقع|تطبيق)|ابني\s+(موقع|تطبيق)/u.test(text)) return "coding";
  if (/\b(research|investigate|compare|analyze|analysis|explain|summarize|find|search)\b|بحث|ابحث|قارن|تحليل|حلل|اشرح|معلومات|استكشف/u.test(text)) return "research";
  return "general";
}
