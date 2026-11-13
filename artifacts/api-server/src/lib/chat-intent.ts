/**
 * Conservative intent gates for downloadable office files.
 * These functions intentionally prefer a normal chat answer over an unsolicited attachment.
 */
export function isHowToRequest(request: string): boolean {
  return /^\s*(?:كيف|ازاي|ازاى|ما هو|ما هي|اشرح|شرح|طريقة|what is|how to|explain|teach me)|(?:عايز اعرف|محتاج افهم|I want to know how)/i.test(request.trim());
}

export function isExcelFileRequest(request: string): boolean {
  if (!request.trim() || isHowToRequest(request)) return false;
  const mentionsExcelFormat = /\b(excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل/i.test(request);
  const namesFileDeliverable = /(?:ملف|شيت|مصنف|spreadsheet|workbook|excel\s*file|xlsx\s*file)/i.test(request);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|أنشئ|انشئ|إنشاء|جهز|جهزلي|جهز\s+لي|صمم|حوّل|حول|صدّر|صدر|export|create|generate|make|build|prepare|download)/i.test(request);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|شيت|مصنف)/i.test(request);
  return mentionsExcelFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}

export function isWordFileRequest(request: string): boolean {
  if (!request.trim() || isHowToRequest(request)) return false;
  const mentionsWordFormat = /(?:و?ورد|\bword\b|\bdocx\b)/i.test(request);
  const namesFileDeliverable = /(?:ملف|مستند|document|file|docx)/i.test(request);
  const asksToCreate = /(?:اعمل|اعملي|اعمللي|اعمل\s+لي|اكتب|اكتبلي|أنشئ|انشئ|إنشاء|جهز|جهزلي|جهز\s+لي|حوّل|حول|صدّر|صدر|create|generate|make|prepare|download|export)/i.test(request);
  const directlyRequestsFile = /(?:عايز|عاوز|محتاج|اريد|أريد)\s*(?:لي\s*)?(?:ملف|مستند|document|file)/i.test(request);
  return mentionsWordFormat && namesFileDeliverable && (asksToCreate || directlyRequestsFile);
}
