/**
 * Conservative intent gates for downloadable office files.
 * Prefer a normal chat answer unless the current request clearly asks for a file.
 */
function normalizeRequest(request: string): string {
  return request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
}

export function isHowToRequest(request: string): boolean {
  const text = normalizeRequest(request);
  return /^(?:كيف|ازاي|ازاى|ما هو|ما هي|شرح|طريقة|what is|how to|how do i|how can i|can i|could i|explain|teach me)(?:\s|$)/i.test(text) ||
    /^(?:اشرح|تشرح)(?:لي|لى)?(?:\s|$)/i.test(text) ||
    /^(?:ممكن|لو سمحت|من فضلك)?\s*(?:تشرح|اشرح)(?:لي|لى)?(?:\s|$)/i.test(text) ||
    /^(?:ممكن|لو سمحت|من فضلك)?\s*(?:علمني|علّمْني)(?:\s|$)/i.test(text) ||
    /^(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:اتعلم|أتعلم|افهم|أفهم|اعرف|أعرف)(?:\s|$)/i.test(text) ||
    /^(?:ممكن\s*)?(?:تقولي|تقول لي|تشرحلي|تشرح لي)\s/i.test(text) ||
    /(?:عايز اعرف|محتاج افهم|I want to know how)/i.test(text) ||
    /^(?:can you explain|could you explain|show me how)\b/i.test(text);
}

function isNegatedFileCreationRequest(text: string): boolean {
  return /(?:^|[\s،,؛;])(?:مش|موش|لا|بدون|من\s+غير)\s*(?:(?:عايز|عاوز|محتاج|اريد|أريد)\s*)?(?:اعمل|اعملي|اعمللي|تعمل|تعملي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|صمم|اكتب|ملف|مستند|شيت|مصنف)/i.test(text) ||
    /(?:^|[\s،,؛;])(?:ما|مت)\s*(?:تعملش|تعمليش|تنشئش|تجهزش)\s*(?:لي\s*)?(?:ملف|مستند|شيت|مصنف)/i.test(text) ||
    /\b(?:don't|do not|never|no need to)\s+(?:create|make|generate|prepare|export|download)\b/i.test(text);
}
export function isExcelFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text)) return false;
  const mentionsExcelFormat = /\b(excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل/i.test(text);
  const namesFileDeliverable = /(?:ملف|شيت|مصنف|spreadsheet|workbook|excel\s*file|xlsx\s*file)/i.test(text);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|تعمل|تعملي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|حوّل|حول|صدّر|صدر|export|create|generate|make|build|prepare|download)/i.test(text);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|شيت|مصنف)/i.test(text);
  return mentionsExcelFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}

export function isWordFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text)) return false;
  const mentionsWordFormat = /(?:و?ورد|\bword\b|\bdocx?\b)/i.test(text);
  const namesFileDeliverable = /(?:ملف|مستند|document|file|docx?)/i.test(text);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|تعمل|تعملي|اكتب|اكتبلي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|حوّل|حول|صدّر|صدر|create|generate|make|prepare|download|export)/i.test(text);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|مستند|document|file)/i.test(text);
  return mentionsWordFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}


/** Return the latest user-authored turn, ignoring assistant messages. */
export type ChatIntentMessage = { role: "user" | "assistant"; content: string };

export function getLatestUserRequest(messages: ChatIntentMessage[]): string {
  return messages.filter((message) => message.role === "user").slice(-1)[0]?.content ?? "";
}

/** Exact standalone greetings must not inherit artifact intent from older turns. */
export function isStandaloneGreeting(request: string): boolean {
  const normalized = normalizeRequest(request).replace(/[؟?!.,،؛]+$/g, "").trim().toLowerCase();
  return /^(?:كيفك|كيف حالك|ازيك|إزيك|ازيّك|عامل ايه|عامله ايه|اخبارك ايه|أخبارك ايه|صباح الخير|مساء الخير|السلام عليكم|السلام عليكم ورحمة الله وبركاته|اهلا|أهلا|مرحبا|hello|hi|hey|how are you|how's it going)$/.test(normalized);
}
