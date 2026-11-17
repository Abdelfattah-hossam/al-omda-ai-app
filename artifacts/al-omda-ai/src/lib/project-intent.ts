export type ProjectSpecialty = "business" | "development" | "design" | "marketing" | "research" | "assistant";

function normalizeProjectRequest(request: string): string {
  return request.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .trim();
}

function isNegatedProjectRequest(value: string): boolean {
  return /^(?:مش|موش|لا|بدون|من\s+غير)\s*(?:(?:عايز|عاوز|محتاج|اريد|أريد|احتاج|أحتاج)\s*)?(?:ان\s*|ما\s*)?(?:اعمل|اعملي|تعمل|تعملي|تنشئ|انشئ|انشاء|ابني|تبني|صمم|طور|برمج|نفذ|جهز|سوي|ابدأ|ابدا)/i.test(value) ||
    /^(?:ما|مت)\s*(?:تعملش|تعمليش|تنشئش|تبنيش|تصممش|تطورش|تبرمجش|تنفذش|تجهزش|تسويش|جهزش|سويش)(?=\s|$)/i.test(value) ||
    /\b(?:don't|do not|never|not asking you to|no need to|i don't want(?: you to)?|i do not want(?: you to)?)\s+(?:build|create|develop|make|implement|design|start)\b/i.test(value);
}
function isInformationRequest(value: string): boolean {
  if (/^(?:ممكن|لو سمحت|من فضلك)\s*(?:تشرح|اشرح|تقولي|تقول لي|توضح|تشرحلي|تشرح لي|تفهمني)/i.test(value)) return true;
  if (/^(?:هل|ايه|ما هو|ما هي|ازاي|ازاى|كيف|ليه|لماذا|اشرح|شرح|طريقة)(?=\s|[؟?!,.،;:]|$)/i.test(value)) return true;
  if (/^(?:what|which|who|why|how|explain|tell me|teach me|do you|does your|what can you)\b/i.test(value)) return true;
  if (/^(?:can|could|would)\s+you\b/i.test(value) &&
      !/^(?:can|could|would)\s+you\s+(?:please\s+)?(?:build|create|develop|make|implement|design|start)\b/i.test(value)) return true;
  return false;
}

const PROJECT_BUILD_VERB_PATTERN = /(?:اعمل|اعملي|اعمللي|تعمل|تعملي|تعمللي|اعملوا|انشئ|انشاء|ابني|ابنيلي|بناء|نفذ|تنفيذ|صمم|صمملي|طور|تطوير|برمج|ابدا|اشتغل على|كمل بناء|جهز|جهزلي|جهز\s+لي|سوي|سويلي|سوي\s+لي|build|create|develop|make|implement|start|design|prepare|generate|write|export)/i;
const DIRECT_PROJECT_REQUEST_PATTERN = /(?:عايز|عاوز|محتاج|اريد)\s+(?:(?:اعمل|اعمللي|انشئ|انشاء|ابني|بناء|نفذ|صمم|طور|جهز|سوي)\s+)?(?:مشروع(?:\s+جديد)?|تطبيق|ابلكيشن|موقع(?:\s+الكتروني)?|برنامج|متجر(?:\s+الكتروني)?|نظام|منصة|لعبة|(?:ملف|مستند|وثيقة)\s*(?:وورد|اكسل|اكسيل|بوربوينت|pdf|word|excel|powerpoint|docx|xlsx|pptx)|مصنف|جدول\s*(?:اكسل|اكسيل|excel)|عرض\s+تقديمي|تقرير|website|web app|mobile app|application|software|project|store|platform|system|excel\s+spreadsheet|word\s+document|powerpoint\s+presentation|spreadsheet|workbook|presentation|report)/i;
const VAGUE_BARE_DELIVERABLE_PATTERN = /^(?:report|file|document|spreadsheet|workbook|presentation)$/i;
const VAGUE_BARE_ARABIC_DELIVERABLE_PATTERN = /^(?:(?:عايز|عاوز|محتاج|اريد)\s+(?:لي\s*)?|(?:اعمل|اعملي|جهز|جهزلي|اكتب|اكتبلي)\s+(?:لي\s*)?)(?:تقرير|ملف|مستند|وثيقة|عرض تقديمي|مصنف)$/i;
const STANDALONE_DOCUMENT_REQUEST_PATTERN = /^(?:(?:please|kindly)\s+)?(?:write|prepare|generate|create|make)\s+(?:a|an)\s+(?:report|file|document|spreadsheet|workbook|presentation)\b/i;
const STANDALONE_ARABIC_DOCUMENT_REQUEST_PATTERN = /^(?:اكتب|اكتبلي|جهز|جهزلي|اعمل|اعملي)\s+(?:لي\s*)?(?:تقرير|ملف|مستند|وثيقة|عرض\s+تقديمي|مصنف|جدول)\b/i;
export function detectProjectSpecialty(request: string): ProjectSpecialty | null {
  const value = normalizeProjectRequest(request);
  if (!value || isNegatedProjectRequest(value)) return null;

  const explicitBuildQuestion = /^(?:(?:هل)\s*)?(?:ممكن|يمكنك|تقدر|بتقدر)\s*(?:انك\s*)?(?:تعمل|تعملي|تنشئ|انشئ|انشاء|تبني|تصمم|تطور|تجهز|تسوي)/i.test(value) ||
    /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:build|create|develop|make|implement|design|start)\b/i.test(value);
  if (isInformationRequest(value) && !explicitBuildQuestion) return null;

  // Include common Egyptian/colloquial action verbs without treating a noun mention as a build order.
  const buildVerb = PROJECT_BUILD_VERB_PATTERN.test(value);
  const directRequest = DIRECT_PROJECT_REQUEST_PATTERN.test(value) ||
    /\b(?:i want|i need)\s+(?:to\s+)?(?:(?:a|an)\s+)?(?:excel\s+spreadsheet|word\s+document|powerpoint\s+presentation|website|web app|mobile app|application|software|project|store|platform|system|spreadsheet|workbook|presentation|report)\b/i.test(value);
  const vagueBareDeliverable = VAGUE_BARE_DELIVERABLE_PATTERN.test(value) ||
    VAGUE_BARE_ARABIC_DELIVERABLE_PATTERN.test(value) ||
    /^(?:i want|i need)\s+(?:(?:a|an)\s+)?(?:report|file|document|spreadsheet|workbook|presentation)$/i.test(value);
  if (vagueBareDeliverable || STANDALONE_DOCUMENT_REQUEST_PATTERN.test(value) || STANDALONE_ARABIC_DOCUMENT_REQUEST_PATTERN.test(value)) return null;
  const fromScratch = /(?:من الصفر للنهاية|من البداية للنهاية|من الصفر|from scratch|end.to.end)/i.test(value);
  const hasProject = /(?:مشروع|تطبيق|ابلكيشن|موقع|برنامج|متجر|نظام|منصة|لعبة|شعار|لوجو|هوية|تصميم|واجهة|بوستر|حملة|بحث|دراسة|تحليل|تقرير|عرض تقديمي|ملف|مستند|وثيقة|مصنف|وورد|اكسل|بوربوينت|أتمتة|تكامل|قاعدة بيانات|بوت|وكيل|محتوى|خطة عمل|خطة تسويق|دراسة جدوى|website|web app|mobile app|application|software|project|store|platform|system|file|word|docx|excel|xlsx|spreadsheet|workbook|document|powerpoint|pptx|logo|brand identity|design project|campaign|research|study|analysis|report|presentation|automation|integration|database|bot|agent|content strategy|business plan|marketing plan|workflow)/i.test(value);
  if (!((buildVerb && hasProject) || directRequest || (fromScratch && hasProject) || (explicitBuildQuestion && hasProject))) return null;

  if (/(?:بحث|دراسة|مقارنة|تحليل|research|study|compare|analysis)/i.test(value)) return "research";
  if (/(?:تيك.?توك|تسويق|حملة|إعلان|محتوى|فيديو|marketing|campaign|content|social)/i.test(value)) return "marketing";
  if (/(?:شعار|لوجو|هوية|تصميم|واجهة|بوستر|logo|brand|design|ui|ux)/i.test(value)) return "design";
  if (/(?:موقع|ويب|تطبيق|ابلكيشن|برنامج|نظام|منصة|قاعدة بيانات|بوت|وكيل|أتمتة|تكامل|website|web app|mobile app|application|software|api|database|bot|agent|automation|integration|workflow|code|برمج|كود)/i.test(value)) return "development";
  if (/(?:ملف|مستند|وثيقة|وورد|word|docx|اكسل|excel|xlsx|بوربوينت|powerpoint|pptx|spreadsheet|workbook|presentation|report)/i.test(value)) return "assistant";
  if (/(?:جدول|تنظيم|مواعيد|أولويات|schedule|organize|calendar)/i.test(value)) return "assistant";
  return "business";
}
