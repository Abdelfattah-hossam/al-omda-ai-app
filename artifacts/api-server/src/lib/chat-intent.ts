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

export function isNegatedFileCreationRequest(text: string): boolean {
  return /(?:^|[\s،,؛;])(?:مش|موش|لا|بدون|من\s+غير)\s*(?:(?:عايز|عاوز|محتاج|اريد|أريد)\s*)?(?:اعمل|اعملي|اعمللي|تعمل|تعملي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|صمم|اكتب|ملف|مستند|شيت|مصنف)/i.test(text) ||
    /(?:^|[\s،,؛;])(?:ما|مت)\s*(?:تعملش|تعمليش|تنشئش|تجهزش)\s*(?:لي\s*)?(?:ملف|مستند|شيت|مصنف)/i.test(text) ||
    /\b(?:don't|do not|never|no need to)\s+(?:create|make|generate|prepare|export|download)\b/i.test(text);
}
export function isExcelFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text)) return false;
  const mentionsExcelFormat = /\b(excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل/i.test(text);
  const namesFileDeliverable = /(?:ملف|شيت|مصنف|جدول|spreadsheet|workbook|excel\s*file|xlsx\s*file)/i.test(text);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|تعمل|تعملي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|حوّل|حول|صدّر|صدر|export|create|generate|make|build|prepare|download)/i.test(text);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|شيت|مصنف|جدول)/i.test(text);
  return mentionsExcelFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}


export function isPowerPointFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text)) return false;
  const mentionsPresentation = /(?:powerpoint|power\s*point|pptx|عرض\s*(?:تقديمي|بوربوينت)|presentation|slide\s*deck|شرائح)/i.test(text);
  if (!mentionsPresentation) return false;
  const comparisonOnly = /^(?:ممكن\s*)?(?:اعمل|اعملي|اعمللي|اعمل\s+لي|create|make)\s+(?:لي\s*)?(?:مقارنة|compare|comparison)(?:$|[\s،,.?!])/i.test(text);
  const explanationOnly = /^(?:اشرح|تشرح|شرح|اكتبلي\s+شرح|اعمل\s+شرح|ممكن\s+شرح|explain|write\s+an?\s+explanation)(?:$|[\s،,.?!])/i.test(text);
  if (comparisonOnly || explanationOnly) return false;
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|صمّم|اعرض|ابني|نفذ|نفّذ|create|make|build|generate|prepare|design|produce|export|download)/i.test(text);
  const directlyRequestsPresentation = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:عرض\s*(?:تقديمي|بوربوينت)|بوربوينت|powerpoint(?:\s+presentation)?|presentation|pptx|slide\s*deck)/i.test(text);
  return asksToCreate || directlyRequestsPresentation;
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
export type ChatIntentMessage = { role: string; content: string };

export function getLatestUserRequest(messages: ReadonlyArray<ChatIntentMessage>): string {
  return messages.filter((message) => message.role === "user").slice(-1)[0]?.content ?? "";
}

/** Exact standalone greetings must not inherit artifact intent from older turns. */
export function isStandaloneGreeting(request: string): boolean {
  const normalized = normalizeRequest(request).replace(/[؟?!.,،؛]+$/g, "").trim().toLowerCase();
  return /^(?:كيفك|كيف حالك|ازيك|إزيك|ازيّك|عامل ايه|عامله ايه|اخبارك ايه|أخبارك ايه|صباح الخير|مساء الخير|السلام عليكم|السلام عليكم ورحمة الله وبركاته|اهلا|أهلا|مرحبا|hello|hi|hey|how are you|how's it going)$/.test(normalized);
}


export type LatestChatIntent =
  | { kind: "greeting"; request: string }
  | { kind: "how_to"; request: string }
  | { kind: "word_file"; request: string }
  | { kind: "excel_file"; request: string }
  | { kind: "powerpoint_file"; request: string }
  | { kind: "conversation"; request: string };

/**
 * One authoritative, latest-turn-only intent decision for chat artifact routing.
 * Earlier turns may resolve references, but may not independently trigger a new file.
 */
export function classifyLatestChatIntent(messages: ReadonlyArray<ChatIntentMessage>): LatestChatIntent {
  const request = getLatestUserRequest(messages);
  if (isStandaloneGreeting(request)) return { kind: "greeting", request };
  if (isHowToRequest(request)) return { kind: "how_to", request };
  if (isExcelFileRequest(request)) return { kind: "excel_file", request };
  if (isWordFileRequest(request)) return { kind: "word_file", request };
  if (isPowerPointFileRequest(request)) return { kind: "powerpoint_file", request };
  return { kind: "conversation", request };
}
