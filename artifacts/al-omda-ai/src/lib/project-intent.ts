export type ProjectSpecialty = "business" | "development" | "design" | "marketing" | "research" | "assistant";

function normalizeProjectRequest(request: string): string {
  return request.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .trim();
}

function isNegatedProjectRequest(value: string): boolean {
  return /^(?:مش|موش|لا|بدون|من\s+غير)\s*(?:(?:عايز|عاوز|محتاج)\s*)?(?:اعمل|اعملي|تعمل|تعملي|تنشئ|انشئ|أنشئ|ابني|تبني|صمم|طور|برمج|نفذ|ابدأ|ابدا)/i.test(value) ||
    /\b(?:don't|do not|never|not asking you to|no need to)\s+(?:build|create|develop|make|implement|design|start)\b/i.test(value);
}

function isInformationRequest(value: string): boolean {
  if (/^(?:ممكن|لو سمحت|من فضلك)\s*(?:تشرح|اشرح|تقولي|تقول لي|توضح|تشرحلي|تشرح لي|تفهمني)/i.test(value)) return true;
  if (/^(?:هل|ايه|إيه|ما هو|ما هي|ازاي|ازاى|كيف|ليه|لماذا|اشرح|شرح|طريقة|what|which|who|why|how|explain|tell me|teach me|do you|does your|what can you)\b/i.test(value)) return true;
  if (/^(?:can|could|would)\s+you\b/i.test(value) &&
      !/^(?:can|could|would)\s+you\s+(?:please\s+)?(?:build|create|develop|make|implement|design|start)\b/i.test(value)) return true;
  return false;
}

export function detectProjectSpecialty(request: string): ProjectSpecialty | null {
  const value = normalizeProjectRequest(request);
  if (!value || isNegatedProjectRequest(value) || isInformationRequest(value)) return null;

  const buildVerb = /(?:اعمل|اعملي|تعمل|تعملي|تعمللي|اعملوا|انشئ|إنشاء|ابني|ابنيلي|بناء|نفذ|تنفيذ|صمم|طور|تطوير|برمج|ابدا|اشتغل على|كمل بناء|build|create|develop|make|implement|start|design)/i.test(value);
  const directRequest = /(?:عايز|عاوز|محتاج|اريد)\s+(?:(?:اعمل|اعمللي|انشئ|إنشاء|ابني|بناء|نفذ|صمم|طور)\s+)?(?:مشروع(?:\s+جديد)?|تطبيق|ابلكيشن|موقع(?:\s+الكتروني)?|برنامج|متجر(?:\s+الكتروني)?|نظام|منصة|لعبة|website|web app|mobile app|application|software|project|store|platform|system)/i.test(value) ||
    /\b(?:i want|i need)\s+(?:to\s+)?(?:a\s+)?(?:website|web app|mobile app|application|software|project|store|platform|system)\b/i.test(value);
  const explicitBuildQuestion = /^(?:ممكن|هل يمكنك|تقدر|بتقدر)\s*(?:انك\s*)?(?:تعمل|تعملي|تنشئ|تبني|تصمم|تطور)/i.test(value) ||
    /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:build|create|develop|make|implement|design|start)\b/i.test(value);
  const fromScratch = /(?:من الصفر للنهاية|من البداية للنهاية|من الصفر|from scratch|end.to.end)/i.test(value);
  const hasProject = /(?:مشروع|تطبيق|ابلكيشن|موقع|برنامج|متجر|نظام|منصة|لعبة|شعار|لوجو|هوية|تصميم|واجهة|بوستر|حملة|بحث|دراسة|تحليل|تقرير|عرض تقديمي|أتمتة|تكامل|قاعدة بيانات|بوت|وكيل|محتوى|خطة عمل|خطة تسويق|دراسة جدوى|website|web app|mobile app|application|software|project|store|platform|system|logo|brand identity|design project|campaign|research|study|analysis|report|presentation|automation|integration|database|bot|agent|content strategy|business plan|marketing plan|workflow)/i.test(value);
  if (!((buildVerb && hasProject) || directRequest || (fromScratch && hasProject) || (explicitBuildQuestion && hasProject))) return null;

  if (/(?:بحث|دراسة|مقارنة|تحليل|research|study|compare|analysis)/i.test(value)) return "research";
  if (/(?:تيك.?توك|تسويق|حملة|إعلان|محتوى|فيديو|marketing|campaign|content|social)/i.test(value)) return "marketing";
  if (/(?:شعار|لوجو|هوية|تصميم|واجهة|بوستر|logo|brand|design|ui|ux)/i.test(value)) return "design";
  if (/(?:موقع|ويب|تطبيق|ابلكيشن|برنامج|نظام|منصة|قاعدة بيانات|بوت|وكيل|أتمتة|تكامل|website|web app|mobile app|application|software|api|database|bot|agent|automation|integration|workflow|code|برمج|كود)/i.test(value)) return "development";
  if (/(?:جدول|تنظيم|مواعيد|أولويات|schedule|organize|calendar)/i.test(value)) return "assistant";
  return "business";
}
