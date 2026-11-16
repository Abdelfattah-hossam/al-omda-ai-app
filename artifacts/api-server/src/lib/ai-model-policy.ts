export type HostedModelPurpose = "precision" | "research" | "general";

export function inferHostedModelPurpose(request: string): HostedModelPurpose {
  const text = request.normalize("NFKC").toLocaleLowerCase();
  if (/\b(legal|law|contract|compliance|engineering|structural|calculation|medical|clinical|diagnosis|financial|investment|accounting|code|coding|software|security|audit|production)\b|قانون|قانوني|عقد|امتثال|هندسة|هندسي|حسابات|معادلات|طب|طبي|تشخيص|مالي|استثمار|محاسبة|برمجة|كود|تطوير|أمني|امني|ثغرات|تدقيق/u.test(text)) return "precision";
  if (/\b(research|study|investigate|compare|analysis|analyze|business|marketing|strategy|roi)\b|بحث|دراسة|استقصاء|قارن|تحليل|أعمال|اعمال|تسويق|استراتيجية|عائد الاستثمار/u.test(text)) return "research";
  return "general";
}

export function getHostedModelTemperature(request: string): number {
  const purpose = inferHostedModelPurpose(request);
  if (purpose === "precision") {
    const configured = Number(process.env.OMDA_PRECISE_TEMPERATURE ?? 0.2);
    return Number.isFinite(configured) && configured >= 0.1 && configured <= 0.3 ? configured : 0.2;
  }
  return purpose === "research" ? 0.3 : 0.4;
}

export function shouldAuditChatRequest(request: string): boolean {
  return inferHostedModelPurpose(request) === "precision" ||
    /\b(business plan|feasibility|strategic plan|financial model)\b|خطة عمل|دراسة جدوى|نموذج مالي|خطة استراتيجية/u.test(request.normalize("NFKC").toLocaleLowerCase());
}

export function parseHostedAuditIssues(response: string): string[] {
  return response.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:ISSUE|BLOCKER|FAIL)\s*:/i.test(line))
    .map((line) => line.slice(line.indexOf(":") + 1).trim())
    .filter(Boolean)
    .slice(0, 8);
}
