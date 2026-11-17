/**
 * Conservative intent gates for downloadable office files.
 * Prefer a normal chat answer unless the current request clearly asks for a file.
 */
function normalizeRequest(request: string): string {
  return request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
}

export function isHowToRequest(request: string): boolean {
  const text = normalizeRequest(request);
  return /^(?:(?:please|kindly)\s+)?(?:كيف|ازاي|ازاى|ما هو|ما هي|شرح|طريقة|what is|how to|how do i|how can i|can i|could i|explain|teach me)(?:\s|$)/i.test(text) ||
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

function isComparisonOnlyRequest(text: string): boolean {
  return /^(?:(?:ممكن|لو سمحت|من فضلك)\s*)?(?:اعمل|اعملي|اعمللي|اعمل\s+لي|اكتب|اكتبلي|جهز|جهزلي|قارن|قارنلي|make|create|write|give|show)\s+(?:لي\s*)?(?:a\s+)?(?:مقارنة|مقارنات|compare|comparison)(?:$|[\s،,.?!])/i.test(text);
}

type OfficeFormat = "word" | "excel" | "powerpoint";

const OFFICE_EXPORT_TARGETS: Record<OfficeFormat, RegExp> = {
  word: /\b(?:word|docx?|document)\b|وورد|مستند/i,
  excel: /\b(?:excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل|شيت/i,
  powerpoint: /\b(?:powerpoint|power\s*point|pptx|presentation|slide\s*deck)\b|عرض\s*(?:تقديمي|بوربوينت)|بوربوينت|شرائح/i,
};

/** Only treat an office format as an export target when it follows an explicit export verb in the same sentence. */
function hasExplicitOfficeFileExport(text: string, format: OfficeFormat): boolean {
  return text.split(/[.!?؟;\n]+/).some((clause) => {
    const exportVerb = /\b(?:export|download|save)\b|صدّر|صدر|نزّل|نزل|حمّل|حمل/i.test(clause);
    const targetPhrase = /\b(?:as|to|in)\s+(?:a\s+|an\s+)?/i.test(clause) || /(?:بصيغة|كملف|بامتداد)\s*/i.test(clause);
    return exportVerb && targetPhrase && OFFICE_EXPORT_TARGETS[format].test(clause);
  });
}

function hasExplicitSourceFileExport(text: string): boolean {
  return /\b(?:export|download|save)\b|صدّر|صدر|نزّل|نزل|حمّل|حمل/i.test(text) &&
    /\.(?:py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|html)\b/i.test(text);
}

/** Detect explicit Excel workbook/spreadsheet creation or export requests. */
export function isExcelFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text) || hasExplicitOfficeFileExport(text, "word") || hasExplicitOfficeFileExport(text, "powerpoint") || (isComparisonOnlyRequest(text) && !hasExplicitOfficeFileExport(text, "excel"))) return false;
  const mentionsExcelFormat = /\b(excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل/i.test(text);
  const namesFileDeliverable = /(?:ملف|شيت|مصنف|جدول|spreadsheet|workbook|excel\s*file|xlsx\s*file)/i.test(text);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|تعمل|تعملي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|حوّل|حول|صدّر|صدر|export|create|generate|make|build|prepare|download)/i.test(text);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|شيت|مصنف|جدول)/i.test(text);
  return mentionsExcelFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}


/** Detect explicit PowerPoint creation/export requests; explanatory and comparison-only turns remain chat. */
export function isPowerPointFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text) || hasExplicitOfficeFileExport(text, "word") || hasExplicitOfficeFileExport(text, "excel") || (isComparisonOnlyRequest(text) && !hasExplicitOfficeFileExport(text, "powerpoint"))) return false;
  const mentionsPresentation = /(?:powerpoint|power\s*point|pptx|عرض\s*(?:تقديمي|بوربوينت)|presentation|slide\s*deck|شرائح)/i.test(text);
  if (!mentionsPresentation) return false;
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|صمّم|اعرض|ابني|نفذ|نفّذ|create|make|build|generate|prepare|design|produce|export|download)/i.test(text);
  const directlyRequestsPresentation = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:عرض\s*(?:تقديمي|بوربوينت)|بوربوينت|powerpoint(?:\s+presentation)?|presentation|pptx|slide\s*deck)/i.test(text);
  return asksToCreate || directlyRequestsPresentation;
}

/** Detect explicit Word document creation/export requests without inheriting older turns. */
export function isWordFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text) || hasExplicitOfficeFileExport(text, "excel") || hasExplicitOfficeFileExport(text, "powerpoint") || (isComparisonOnlyRequest(text) && !hasExplicitOfficeFileExport(text, "word"))) return false;
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



/** Detect source-code file deliverables, not ordinary requests for inline explanations or code snippets. */
export function isExplicitSourceCodeFileRequest(request: string): boolean {
  const text = normalizeRequest(request);
  if (!text || isHowToRequest(text) || isNegatedFileCreationRequest(text) || (isComparisonOnlyRequest(text) && !hasExplicitSourceFileExport(text))) return false;
  const hasSourceExtension = /\.(?:py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|html)\b/i.test(text);
  const asksToCreateOrExport = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|اكتب|اكتبلي|أنشئ|انشئ|تنشئ|إنشاء|جهز|جهزلي|جهز\s+لي|احفظ|نزّل|نزل|حمّل|حمل|صدّر|صدر|create|write|generate|make|prepare|save|download|export)/i.test(text);
  const namesSourceFile = /(?:ملف|file|script|سكريبت|كود|code|source\s*code)/i.test(text);
  const explicitlyInline = /\b(?:inline\s+code|code\s+inline|inline\s+(?:in|within)\s+(?:the\s+)?chat|in\s+(?:the\s+)?chat|directly\s+in\s+(?:the\s+)?chat|not\s+as\s+(?:a\s+)?file|without\s+(?:a\s+)?file|no\s+file)\b|مش\s+كملف|بدون\s+ملف|داخل\s+المحادثة|في\s+الشات/i.test(text);
  const explicitFileIntent = hasSourceExtension || /\b(?:file|script|download|export|save)\b|ملف|سكريبت|للتحميل|احفظه|احفظ|نزّل|نزل|حمّل|حمل/i.test(text);
  return asksToCreateOrExport && (namesSourceFile || hasSourceExtension) && explicitFileIntent && !explicitlyInline;
}


export type LatestChatIntent =
  | { kind: "greeting"; request: string }
  | { kind: "how_to"; request: string }
  | { kind: "word_file"; request: string }
  | { kind: "excel_file"; request: string }
  | { kind: "powerpoint_file"; request: string }
  | { kind: "source_code_file"; request: string }
  | { kind: "conversation"; request: string };

/**
 * One authoritative, latest-turn-only intent decision for chat artifact routing.
 * Earlier turns may resolve references, but may not independently trigger a new file.
 * Multi-format requests use the deterministic priority: Excel, then Word, PowerPoint,
 * then source code. Only the first matching format is routed by this endpoint.
 */
export function classifyLatestChatIntent(messages: ReadonlyArray<ChatIntentMessage>): LatestChatIntent {
  const request = getLatestUserRequest(messages);
  if (isStandaloneGreeting(request)) return { kind: "greeting", request };
  if (isHowToRequest(request)) return { kind: "how_to", request };
  if (isExcelFileRequest(request)) return { kind: "excel_file", request };
  if (isWordFileRequest(request)) return { kind: "word_file", request };
  if (isPowerPointFileRequest(request)) return { kind: "powerpoint_file", request };
  if (isExplicitSourceCodeFileRequest(request)) return { kind: "source_code_file", request };
  return { kind: "conversation", request };
}

/** A message may be text-only or image-only; empty payloads are invalid. */
export function hasChatMessagePayload(content: string, hasImage: boolean): boolean {
  return content.trim().length > 0 || hasImage;
}
