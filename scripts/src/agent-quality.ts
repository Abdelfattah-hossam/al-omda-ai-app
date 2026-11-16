export type AgentDomain = "legal" | "engineering" | "medical" | "software" | "finance" | "business" | "research" | "general";

export function inferAgentDomain(goal: string): AgentDomain {
  const text = goal.normalize("NFKC").toLocaleLowerCase();
  if (/\b(law|legal|lawyer|attorney|contract|compliance|statute|regulation|litigation)\b|قانون|قانوني|محامي|عقد|امتثال|تشريع|لائحة|قضية/u.test(text)) return "legal";
  if (/\b(engineer|engineering|architecture|structural|civil|mechanical|electrical|boq|aci|iec|iso|reinforced concrete|concrete beam|beam load|structural load|load calculation|quantity survey)\b|هندسة|هندسي|معماري|إنشائي|انشائي|خرسانة|كمرة|كمرات|كميات|أحمال|احمال|مخطط هندسي/u.test(text)) return "engineering";
  if (/\b(medical|medicine|clinical|doctor|diagnosis|patient|clinical trial|peer.reviewed)\b|(?:^|[\s،,؛])(?:ال)?(?:طب|طبي|طبيب|تشخيص|مريض|دواء)(?:$|[\s،,؛])|دراسة سريرية/u.test(text)) return "medical";
  if (/\b(finance|financial|investment|accounting|valuation|cash flow|roi|budget|forecast)\b|مالي|مالية|استثمار|محاسبة|تقييم مالي|تدفق نقدي|عائد الاستثمار|ميزانية|توقعات مالية/u.test(text)) return "finance";
  if (/\b(code|coding|program|programming|developer|software|bug|refactor|debug|typescript|javascript|python|api|database|website|web app|mobile app|application|frontend|backend|site)\b|برمج|برمجة|كود|تطوير برمجي|موقع|تطبيق|قاعدة بيانات|واجهة برمجية/u.test(text)) return "software";
  if (/\b(business|strategy|marketing|sales|management|operations|content|campaign|brand)\b|أعمال|اعمال|تجارة|إدارة|ادارة|تسويق|مبيعات|تشغيل|محتوى|حملة|علامة تجارية/u.test(text)) return "business";
  if (/\b(research|study|investigate|compare|analysis|analyze|literature review)\b|بحث|دراسة|استقصاء|قارن|تحليل|مراجعة علمية/u.test(text)) return "research";
  return "general";
}

export function getModelTemperature(purpose: string, configured?: string): number {
  const parsed = configured === undefined || configured.trim() === "" ? Number.NaN : Number(configured);
  const preciseTemperature = Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 0.3 ? parsed : 0.2;
  if (["legal", "engineering", "medical", "finance", "coding", "review", "proposal"].includes(purpose)) return preciseTemperature;
  if (purpose === "research" || purpose === "business") return 0.3;
  return 0.4;
}

export function shouldAuditFinalAnswer(goal: string): boolean {
  const text = goal.normalize("NFKC").toLocaleLowerCase();
  return /\b(legal|law|contract|compliance|engineering|structural|calculation|medical|clinical|diagnosis|financial|investment|accounting|code|coding|software|security|audit|production|strategy|business plan|feasibility|roi)\b|قانون|قانوني|عقد|امتثال|هندسة|هندسي|حسابات|معادلات|طب|طبي|تشخيص|مالي|استثمار|محاسبة|برمجة|كود|تطوير|أمني|امني|ثغرات|تدقيق|خطة عمل|دراسة جدوى|عائد الاستثمار/u.test(text);
}

export function parseAuditIssues(response: string): string[] {
  return response.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:ISSUE|BLOCKER|FAIL)\s*:/i.test(line))
    .map((line) => line.slice(line.indexOf(":") + 1).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function getProfessionalOperatingGuidance(domain: AgentDomain): string {
  const guidance: Record<AgentDomain, string> = {
    legal: "LEGAL & COMPLIANCE: Confirm the jurisdiction and effective date. Cite exact statutes, articles, regulations, and authoritative sources only when verified. Never invent a law, precedent, deadline, or legal conclusion. Distinguish information from legal advice and identify missing facts.",
    engineering: "ENGINEERING: Use deterministic calculations or executable code for numerical work. Show units, assumptions, formulas, tolerances, and dimensional checks. Cite standards such as ACI, ISO, or IEC only when the exact applicable edition and clause are verified. Never guess loads, material properties, or safety factors.",
    medical: "MEDICAL & SCIENTIFIC: Ground claims in authoritative clinical guidance and peer-reviewed evidence when available. Distinguish established evidence from uncertainty, flag contraindications and urgent warning signs, and do not present an AI response as a diagnosis or substitute for a clinician.",
    software: "SOFTWARE & AI: Inspect the existing architecture before changing it. Produce secure, maintainable code; validate dependencies, edge cases, tests, and deployment constraints. Never claim a build, test, or deployment succeeded without observed results.",
    finance: "BUSINESS & FINANCE: State the as-of date, currency, assumptions, data provenance, and formulas. Separate historical facts from forecasts, show uncertainty and downside cases, and never guarantee returns or fabricate financial data.",
    business: "BUSINESS & CONTENT: Give actionable recommendations with explicit assumptions, measurable outcomes, and a defensible basis for ROI. Separate estimates from observed metrics and do not fabricate market data.",
    research: "RESEARCH: Separate sourced facts, interpretation, and unknowns. Prefer primary and authoritative sources, preserve publication dates, and do not turn an unverified claim into a fact.",
    general: "GENERAL: Match the user's intent and use the available tools when they materially improve accuracy or completion. State uncertainty and limitations plainly."
  };
  return guidance[domain];
}

export function buildToolCallingOptions<T>(tools: T[]): { tools: T[]; tool_choice: "auto" } | Record<string, never> {
  return tools.length ? { tools, tool_choice: "auto" } : {};
}
