export type HostedModelPurpose = "precision" | "research" | "general";

export function inferHostedModelPurpose(request: string): HostedModelPurpose {
  const text = request.normalize("NFKC").toLocaleLowerCase();
  if (/\b(legal|law|contract|compliance|engineering|structural|calculation|medical|clinical|diagnosis|finance|financial|investment|accounting|valuation|cash flow|roi|budget|forecast|code|coding|software|security|audit|production|typescript|javascript|python|api|database|developer|programmer|website|web app|mobile app|application|frontend|backend)\b|قانون|قانوني|عقد|امتثال|هندسة|هندسي|حسابات|معادلات|طب|طبي|تشخيص|مالي|استثمار|محاسبة|برمجة|كود|تطوير|أمني|امني|ثغرات|تدقيق/u.test(text)) return "precision";
  if (/\b(research|study|investigate|compare|analysis|analyze|business|marketing|strategy|roi)\b|بحث|دراسة|استقصاء|قارن|تحليل|أعمال|اعمال|تسويق|استراتيجية|عائد الاستثمار/u.test(text)) return "research";
  return "general";
}

export function getHostedModelTemperature(request: string, hasImage = false): number {
  const purpose = inferHostedModelPurpose(request);
  if (purpose === "precision") {
    const configured = Number(process.env.OMDA_PRECISE_TEMPERATURE ?? 0.2);
    return Number.isFinite(configured) && configured >= 0.1 && configured <= 0.3 ? configured : 0.2;
  }
  return hasImage ? 0.3 : purpose === "research" ? 0.25 : 0.2;
}

export function getHostedProviderOrder(purpose: HostedModelPurpose, coding = false, hasImage = false): string[] {
  // Groq won the practical latency/reliability balance in live smoke tests.
  // Keep the same primary for all text purposes, with independent free fallbacks.
  // Quality across Arabic dialects has not been benchmarked; do not imply otherwise.
  if (hasImage) return ["groq", "openrouter", "gemini"];
  return ["groq", "openrouter", "gemini", "cloudflare"];
}

/**
 * Groq's free tier shares an 8K tokens-per-minute bucket per model, so very
 * large prompts are likely to hit a 429 there even when the account is quiet.
 * Lead with the OpenRouter free model pool instead of spending the request on a likely
 * rate-limit failure. Arabic text tokenizes denser than English; chars/3 is a
 * safe upper estimate.
 */
export function estimatePromptTokens(texts: readonly string[]): number {
  return texts.reduce((sum, text) => sum + Math.ceil(text.length / 3), 0);
}

export function reorderProvidersForPromptSize(order: readonly string[], estimatedTokens: number): string[] {
  if (estimatedTokens <= 5500 || order[0] !== "groq" || !order.includes("openrouter")) return [...order];
  return ["openrouter", ...order.filter((provider) => provider !== "openrouter")];
}
