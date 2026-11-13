import { Router, type IRouter } from "express";
import { isExcelFileRequest, isHowToRequest, isWordFileRequest } from "../lib/chat-intent.js";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();
const DAILY_LIMIT = 1000;
type ChatMessage = { role: "user" | "assistant"; content: string; image?: { mimeType: string; data: string } };
type Usage = { allowed?: boolean; used: number; remaining: number; limit: number; resetAt: string };

async function currentUsage(accessToken: string): Promise<Usage> {
  const response = await supabaseFetch("/rest/v1/rpc/get_ai_daily_usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, accessToken);
  return readSupabaseJson<Usage>(response);
}

async function reserveUnits(accessToken: string, units: number): Promise<Usage> {
  const response = await supabaseFetch("/rest/v1/rpc/consume_ai_units", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_units: units, p_daily_limit: DAILY_LIMIT }),
  }, accessToken);
  return readSupabaseJson<Usage>(response);
}

function providerErrorMessage(payload: any): string {
  const message = payload?.error?.message ?? payload?.message ?? payload?.error ?? "";
  if (typeof message !== "string") return "";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/key=[^&\s]+/gi, "key=[redacted]").slice(0, 240);
}

function getProviders() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
  };
}


function getLatestUserRequest(messages: ChatMessage[]): string {
  // Artifact modes must be triggered by the current turn, never by an older request.
  return messages.filter((message) => message.role === "user").slice(-1)[0]?.content ?? "";
}
function isStandaloneGreeting(request: string): boolean {
  const normalized = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim().replace(/[؟?!.,،؛]+$/g, "").trim().toLowerCase();
  return /^(?:كيفك|كيف حالك|ازيك|إزيك|ازيّك|عامل ايه|عامله ايه|اخبارك ايه|أخبارك ايه|صباح الخير|مساء الخير|السلام عليكم|السلام عليكم ورحمة الله وبركاته|اهلا|أهلا|مرحبا|hello|hi|hey|how are you|how's it going)$/.test(normalized);
}
function isExcelRequest(messages: ChatMessage[]): boolean {
  return isExcelFileRequest(getLatestUserRequest(messages));
}
function needsLongStructuredOutput(messages: ChatMessage[]): boolean {
  const latest = getLatestUserRequest(messages);
  return isWordDocumentRequest(messages) || isExcelRequest(messages) || isDesktopAppRequest(latest) ||
    /project plan|خطة مشروع|خطة تنفيذ|create a practical project plan/i.test(latest);
}

function isExplicitWordFileRequest(request: string): boolean {
  return isWordFileRequest(request);
}
function isWordTableRequest(request: string): boolean {
  if (/(?:بدون|من غير|لا تضف|لا تعمل|مش عايز|مش محتاج|without|no)\s*(?:أي\s*)?(?:جدول|table)/i.test(request)) return false;
  return /جدول|table|(?:7|سبع)\s*(?:خانات|أعمدة|اعمدة|حقول|columns)/i.test(request);
}
function isDesktopAppRequest(request: string): boolean {
  if (isHowToRequest(request)) return false;
  const normalized = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  const desktopClock = /desktop|سطح\s*(?:ال)?مكتب|نافذة سطح المكتب/i.test(normalized) && /ساعة|clock|hour|watch|وقت|time/i.test(normalized);
  const directBuild = /(?:اعمل|اعملي|تعمل|تعملي|أنشئ|انشئ|ابني|ابنيلي|صمم|صمّم|برمج|نفذ|نفّذ|طور|build|create|develop|make|implement|generate)\s*(?:لي|لنا|ال|me\s+(?:a\s+)?)?\s*(?:مشروع|موقع|تطبيق|برنامج|متجر|نظام|منصة|ساعة|website|web app|mobile app|application|software|project|store|platform|system|clock)/i.test(normalized);
  const directAppRequest = /(?:عايز|عاوز|محتاج|اريد|أريد)\s+(?:لي\s*)?(?:مشروع|تطبيق|برنامج|موقع|متجر|نظام|منصة|ساعة|app|application|website|web app|software|store|platform|system|clock)/i.test(normalized);
  const planningOnly = /خطة|تخطيط|دراسة|استراتيجية|مقترح|أفكار|شرح|مقارنة|بحث|تحليل|plan|planning|strategy|proposal|ideas|explain|compare|research|analysis/i.test(normalized);
  if (planningOnly && !directBuild && !directAppRequest) return false;
  const appNoun = /تطبيق|برنامج|app|application|موقع|website|نظام|مشروع|لوحة\s*تحكم|متجر|ساعة|clock/i.test(normalized);
  return (desktopClock && (directBuild || directAppRequest)) || (appNoun && (directBuild || directAppRequest));
}
function parseHtmlApp(text: string): string | null {
  const source = text.trim().replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "");
  if (!/<html[\s>]/i.test(source) || !/<body[\s>]/i.test(source) || !/<\/body>\s*<\/html>\s*$/i.test(source)) return null;
  if (/<script[\s>]/i.test(source) && !/<\/script>/i.test(source)) return null;
  if (/<style[\s>]/i.test(source) && !/<\/style>/i.test(source)) return null;
  if (!/<main[\s>]|<div[\s>]|<form[\s>]|<canvas[\s>]/i.test(source) || source.length > 90000) return null;
  return source;
}
function isWordDocumentRequest(messages: ChatMessage[]): boolean {
  if (isExcelRequest(messages)) return false;
  const request = getLatestUserRequest(messages);
  if (!request || isHowToRequest(request)) return false;
  // A table, report, document topic, or the word "Word" in a question must
  // stay in normal chat unless the user explicitly asks for a Word deliverable.
  return isExplicitWordFileRequest(request);
}
function isTableOnlyRequest(messages: ChatMessage[]): boolean {
  const request = getLatestUserRequest(messages);
  return /(?:الجدول|جدول).{0,20}(?:بس|فقط)|(?:الجدول|جدول).{0,80}(?:من غير|بدون).{0,40}(?:محتوى|شرح|كتابة|بيانات|تعبئة|ملء)|(?:بس|فقط).{0,40}(?:جدول|الجدول)|(?:خانات|مربعات).{0,50}(?:فاضية|فارغة|من غير بيانات|بدون بيانات)/i.test(request);
}
function isSevenColumnTableRequest(messages: ChatMessage[]): boolean {
  const request = getLatestUserRequest(messages);
  return /7\s*(?:خانات|أعمدة|اعمدة|حقول|columns)|سبع\s*(?:خانات|أعمدة|اعمدة|حقول)|جدول.{0,45}(?:7|سبع)|(?:7|سبع).{0,30}جدول/i.test(request);
}

function parseExcelWorkbook(text: string): { title: string; columns: string[]; rows: string[][] } | null {
  try {
    let source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1));
    if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 180 || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null;
    if (value.columns.length < 1 || value.columns.length > 30 || value.rows.length < 1 || value.rows.length > 500) return null;
    if (value.columns.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 180)) return null;
    const columns = value.columns.map((item: string) => item.trim());
    if (value.rows.some((row: unknown) => !Array.isArray(row) || row.length !== columns.length || row.some((cell: unknown) => (typeof cell !== "string" && typeof cell !== "number" && typeof cell !== "boolean") || String(cell).length > 2000))) return null;
    const rows = value.rows.map((row: unknown[]) => row.map((cell: unknown) => String(cell)));
    return { title: value.title.trim(), columns, rows };
  } catch { return null; }
}
function parseWordDocument(text: string, forceSevenColumns: boolean, tableOnly: boolean, requireTable = false): { title: string; paragraphs: string[]; columns: string[]; rows: string[][] } | null {
  try {
    const source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    let value: any = null;
    try { value = JSON.parse(source); }
    catch {
      // Preserve a clean prose draft as a Word document if a provider ignores the JSON format.
      const plainText = source.replace(/^\x60\x60\x60(?:text|markdown)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "").trim();
      if (!requireTable && !tableOnly && !forceSevenColumns && plainText && !plainText.startsWith("{") && !plainText.includes("{") && plainText.length >= 40 && !/<(?:html|!doctype)/i.test(plainText)) {
        const plainParagraphs = plainText.split(/\n\s*\n/).map((part) => part.replace(/^#{1,6}\s*/, "").trim()).filter(Boolean);
        if (plainParagraphs.length) return { title: plainParagraphs[0].slice(0, 180), paragraphs: plainParagraphs, columns: [], rows: [] };
      }
      // Providers sometimes wrap JSON in a short explanation. Extract the first complete JSON object safely.
      const first = source.indexOf("{");
      if (first < 0) return null;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = first; index < source.length; index++) {
        const char = source[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          value = JSON.parse(source.slice(first, index + 1));
          break;
        }
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawTitle = value.title ?? value.name ?? value.documentTitle;
    const rawParagraphs = value.paragraphs ?? value.content ?? value.body ?? value.sections ?? value.text ?? [];
    const rawTable = value.table && typeof value.table === "object" ? value.table : value;
    const rawColumns = value.columns ?? value.headers ?? rawTable.headers ?? rawTable.columns ?? [];
    const rawRows = value.rows ?? rawTable.rows ?? [];
    const toText = (item: any): string => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item).trim();
      if (item && typeof item === "object") {
        const heading = typeof item.heading === "string" ? item.heading.trim() : typeof item.title === "string" ? item.title.trim() : "";
        const body = typeof item.content === "string" ? item.content.trim() : typeof item.text === "string" ? item.text.trim() : "";
        return [heading, body].filter(Boolean).join("\n\n");
      }
      return "";
    };
    if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) return null;
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, 180) : "مستند جديد";
    let paragraphs: string[] = [];
    if (typeof rawParagraphs === "string") paragraphs = rawParagraphs.split(/\n\s*\n/).map((part: string) => part.trim()).filter(Boolean);
    else if (Array.isArray(rawParagraphs)) paragraphs = rawParagraphs.map(toText).filter(Boolean);
    else return null;
    // Preserve long documents instead of rejecting them for having many small sections.
    if (paragraphs.length > 12) {
      const grouped: string[] = [];
      for (let index = 0; index < paragraphs.length; index += Math.ceil(paragraphs.length / 12)) grouped.push(paragraphs.slice(index, index + Math.ceil(paragraphs.length / 12)).join("\n\n"));
      paragraphs = grouped;
    }
    if (paragraphs.some((item) => item.length > 8000)) return null;
    const columns = rawColumns.map(toText);
    if (columns.some((item: string) => !item || item.length > 180)) return null;
    if (columns.length > 12 || rawRows.length > 100) return null;
    if (forceSevenColumns && columns.length !== 7) return null;
    if (requireTable && columns.length === 0) return null;
    if (!requireTable && columns.length > 0) return null;
    if (tableOnly && columns.length === 0) return null;
    if (columns.length === 0 && (rawRows.length > 0 || paragraphs.length === 0)) return null;
    const rows = columns.length ? rawRows.map((row: any) => {
      if (Array.isArray(row)) return row.map((cell: any) => toText(cell));
      if (row && typeof row === "object") return columns.map((column: string, index: number) => toText(row[column] ?? Object.values(row)[index]));
      return [];
    }) : [];
    if (rows.some((row: string[]) => row.length !== columns.length || row.some((cell) => cell.length > 2000))) return null;
    const finalRows = tableOnly ? Array.from({ length: 8 }, () => columns.map(() => "")) : rows;
    if (columns.length > 0 && finalRows.length === 0 && !tableOnly) return null;
    if (JSON.stringify({ title, paragraphs, columns, rows: finalRows }).length > 70000) return null;
    return { title, paragraphs: tableOnly ? [] : paragraphs, columns, rows: finalRows };
  } catch { return null; }
}
function isCodingRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /code|coding|debug|typescript|javascript|python|react|node|sql|html|css|api|bug|error|stack trace|برمج|كود|بايثون|جافاسكريبت|تايب سكريبت|ريأكت|قاعدة بيانات|تصحيح|خطأ|برنامج|موقع|تطبيق/i.test(last);
}

function systemPrompt(coding: boolean, memory = ""): string {
  const base = "You are AL OMDA AI (العمدة), the AI assistant itself. The name AL OMDA always refers to YOU, the assistant, never to a separate human, colleague, or team. Match the user's language. Before answering, carefully parse the COMPLETE user request and the relevant conversation context. Silently make a requirements checklist: exact deliverable, every requested item, quantities, format, language, audience, constraints, exclusions, and what must not be changed. Resolve references such as this/that/previous using conversation context. Do not skip, reinterpret, or replace any explicit requirement. Never decide what the user wants from one keyword alone; interpret the complete sentence and its surrounding context. Distinguish a question, explanation, comparison, casual conversation, advice request, and plan from an explicit request to create a file, app, or other deliverable. Mentioning Word, Excel, a table, a report, or a file topic is NOT permission to create an attachment. Create Word/Excel files only when the current request clearly names that file format and explicitly asks to create, prepare, export, or download that file. A request for a table or written content without a file-format request should be answered directly in chat. Never infer a file request from unrelated earlier turns. If a request is actionable and sufficiently clear, do the work rather than merely describing how the user can do it. Before sending the response, silently verify that every requirement is addressed, all generated content is coherent and understandable, calculations and structure are consistent, and any claimed file or action actually exists. For structured files, validate the complete structure before declaring success; if the first output is malformed, correct it and validate again. Never return an empty, irrelevant, generic, or confusing artifact. If a requirement is genuinely ambiguous and changes the result materially, ask one focused question; otherwise make the safest reasonable assumption and state it briefly. Be accurate, practical, and honest about uncertainty. When the user delegates a project, YOU (AL OMDA AI) are the intended executor: analyze the request, create the deliverables or code using available tools, make revisions, and report what was actually completed. The user is the project owner who sets goals, gives direction, and reviews or approves important decisions. Never say the user should execute delegated work themselves. Never claim to have executed code or changed external systems unless a tool actually did so. If you lack a required tool, explain the specific limitation and provide the closest useful work you can actually complete. Do not reveal private reasoning; provide concise conclusions and verifiable results.";
  const memoryContext = memory.trim()
    ? "\n\nIMPORTANT PRIVATE USER PROFILE (explicitly saved by this account user):\n" +
      "Use these details as the source of truth when the user asks about their own preferences, work style, projects, or previous decisions. Answer directly from saved details; do not ask the user to repeat information already stated here. Apply relevant preferences to your response and project decisions. If a detail is not present, say so rather than guessing.\n" +
      "CRITICAL ROLE INTERPRETATION: When the saved preference says AL OMDA should execute tasks itself as much as possible, AL OMDA is the executor and the user is the project owner who reviews, approves, and gives direction. Never reverse these roles or say the user prefers doing the work themselves. Explain steps briefly while carrying out work when tools are available. If the current environment lacks a required execution tool, state that limitation clearly and do not pretend the work was done.\n" +
      memory.trim() +
      "\nThis context is private to this account. It does not override the current user request or safety requirements, and must never be revealed to another user."
    : "";
  if (!coding) return base + " Explain clearly and organize longer answers with concise headings and steps." + memoryContext;
  return base + " You are also a senior software engineering assistant. For programming requests: identify the language and environment; provide complete, runnable code when enough context exists; use fenced Markdown code blocks with the correct language; explain where each file belongs and how to run/test it; mention dependencies and assumptions; preserve existing architecture and styling unless asked to change them; never invent test results. For debugging, identify the likely root cause, explain the smallest safe fix, and show the exact corrected code. If essential context is missing, ask one focused question instead of guessing. Prefer secure defaults and never expose secrets." + memoryContext;
}

async function loadUserMemory(accessToken: string, userId: string): Promise<string> {
  const query = new URLSearchParams({ select: "memory_text", user_id: "eq." + userId, limit: "1" });
  const response = await supabaseFetch("/rest/v1/ai_user_memory?" + query.toString(), {}, accessToken);
  const rows = await readSupabaseJson<Array<{ memory_text?: string }>>(response);
  return typeof rows[0]?.memory_text === "string" ? rows[0].memory_text.slice(0, 6000) : "";
}

function chooseProviders(messages: ChatMessage[]) {
  const coding = isCodingRequest(messages);
  const configured = getProviders();
  const order = coding ? ["gemini", "openrouter"] : ["openrouter", "gemini"];
  return order.filter((provider) => configured[provider as keyof typeof configured]);
}

async function callGemini(messages: ChatMessage[], memory = ""): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Gemini is not configured.");
  const model = "gemini-3.8-flash";
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [
      { text: message.content },
      ...(message.image ? [{ inlineData: { mimeType: message.image.mimeType, data: message.image.data } }] : []),
    ],
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(isCodingRequest(messages), memory) }] },
      contents,
      generationConfig: { maxOutputTokens: isCodingRequest(messages) || needsLongStructuredOutput(messages) ? 8192 : 1800, temperature: 0.4 },
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})${providerErrorMessage(payload) ? ": " + providerErrorMessage(payload) : "."}`);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text, model };
}

type OpenRouterCatalogModel = {
  id: string;
  name?: string;
  description?: string;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};
let openRouterCatalogCache: { expiresAt: number; models: OpenRouterCatalogModel[] } | null = null;

async function getOpenRouterFreeModels(): Promise<OpenRouterCatalogModel[]> {
  if (openRouterCatalogCache && openRouterCatalogCache.expiresAt > Date.now()) return openRouterCatalogCache.models;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("OpenRouter model catalog returned " + response.status);
    const payload = await response.json().catch(() => null) as any;
    const models = Array.isArray(payload?.data) ? payload.data.filter((item: any) => {
      if (!item || typeof item.id !== "string") return false;
      // Only use explicitly free variants: some $0-priced catalog entries still require funded credits.
      const explicitFree = item.id.endsWith(":free");
      return explicitFree && (Array.isArray(item.architecture?.output_modalities) ? item.architecture.output_modalities.includes("text") : true) && !/embedding|rerank|moderation|image-generation|text-to-speech|speech-to-text/i.test(item.id);
    }).map((item: any) => ({ id: item.id, name: item.name, description: item.description, pricing: item.pricing, supported_parameters: item.supported_parameters, architecture: item.architecture })) : [];
    openRouterCatalogCache = { expiresAt: Date.now() + 10 * 60 * 1000, models };
    return models;
  } catch (error) {
    console.warn("[OpenRouter model catalog unavailable]", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

async function getOpenRouterModelOrder(messages: ChatMessage[], excludeModel = ""): Promise<string[]> {
  const catalog = await getOpenRouterFreeModels();
  const staticFallbacks = [
    "nvidia/nemotron-3-ultra:free",
    "recursive/flint:free",
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3.5-super-vl:free",
  ];
  const coding = isCodingRequest(messages);
  const structured = needsLongStructuredOutput(messages);
  const hasImage = messages.some((message) => Boolean(message.image));
  const describe = (model: OpenRouterCatalogModel) => [model.id, model.name, model.description].filter(Boolean).join(" ").toLowerCase();
  const score = (model: OpenRouterCatalogModel, role: "reasoning" | "coding" | "writing" | "general") => {
    const text = describe(model);
    const params = model.supported_parameters || [];
    let value = model.id.endsWith(":free") ? 3 : 0;
    if (hasImage && (model.architecture?.input_modalities?.includes("image") || /vision|vl:/i.test(model.id))) value += 30;
    if (role === "coding") {
      if (/coding|code|coder|programming|software|deepseek|qwen|flint|nemotron.*ultra/.test(text)) value += 12;
      if (params.includes("tools")) value += 2;
    } else if (role === "reasoning") {
      if (/reason|thinking|agent|orchestrat|ultra|qwq|r1|nemotron/.test(text)) value += 12;
      if (params.includes("structured_outputs")) value += 2;
    } else if (role === "writing") {
      if (/writing|creative|writer|content|llama|gemma|mistral|command/.test(text)) value += 12;
    } else if (/instruct|general|chat|assistant|gemma|llama|nemotron/.test(text)) value += 10;
    return value;
  };
  const available: OpenRouterCatalogModel[] = (catalog.length ? catalog : staticFallbacks.map((id): OpenRouterCatalogModel => ({ id })))
    .filter((model) => !hasImage || model.architecture?.input_modalities?.includes("image") || /vision|vl:/i.test(model.id));
  const roles: Array<"reasoning" | "coding" | "writing" | "general"> = coding
    ? ["coding", "reasoning", "general"]
    : structured
      ? ["reasoning", "general", "writing"]
      : ["general", "writing", "reasoning"];
  const selected: string[] = [];
  for (const role of roles) {
    const next = [...available].sort((a, b) => score(b, role) - score(a, role)).find((model) => model.id !== excludeModel && !selected.includes(model.id));
    if (next) selected.push(next.id);
    if (selected.length === 2) break;
  }
  // Keep two different free specialists, then let OpenRouter's own free router provide a final fallback.
  return [...selected, "openrouter/free"];
}

async function callOpenRouter(messages: ChatMessage[], memory = "", excludeModel = ""): Promise<{ text: string; model: string }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OpenRouter is not configured.");
  const candidates = await getOpenRouterModelOrder(messages, excludeModel);
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { authorization: "Bearer " + key, "content-type": "application/json", "HTTP-Referer": "https://al-omda-ai-app.abdelfattahhossam1.workers.dev", "X-Title": "AL OMDA AI" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt(isCodingRequest(messages), memory) }, ...messages.map((message) => message.image ? {
          role: message.role,
          content: [
            { type: "text", text: message.content },
            { type: "image_url", image_url: { url: `data:${message.image.mimeType};base64,${message.image.data}` } },
          ],
        } : message)], max_tokens: isCodingRequest(messages) || needsLongStructuredOutput(messages) ? 8192 : 1800, temperature: 0.4 }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok) {
        failures.push(model + ": " + response.status + (providerErrorMessage(payload) ? " " + providerErrorMessage(payload) : ""));
        continue;
      }
      const raw = payload?.choices?.[0]?.message?.content;
      const text = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((part: any) => typeof part?.text === "string" ? part.text : "").join("") : "").trim();
      if (!text) {
        failures.push(model + ": empty response");
        continue;
      }
      return { text, model: payload?.model || model };
    } catch (error) {
      failures.push(model + ": " + (error instanceof Error ? error.message : "request failed"));
    }
  }
  throw new Error("All selected OpenRouter free models failed. " + failures.slice(0, 4).join(" | ").slice(0, 700));
}

async function callProviderWithRetry(provider: "gemini" | "openrouter", messages: ChatMessage[], memory = "", excludeModel = ""): Promise<{ text: string; model: string }> {
  // OpenRouter already tries several free specialist models internally; retrying its entire
  // rotation would repeat the same failed models and waste the user's time.
  if (provider === "openrouter") return callOpenRouter(messages, memory, excludeModel);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await callGemini(messages, memory);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // A 429 quota/rate-limit response is not helped by immediately repeating
      // the same request; let the next configured provider handle the fallback.
      const temporary = /\b(?:500|502|503|504)\b|empty response|temporarily unavailable|high demand|timeout/i.test(message);
      if (!temporary || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider temporarily unavailable.");
}

router.post("/ai/project-plan", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to generate an AI project plan." }); return; }
    const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
    const context = typeof req.body?.context === "string" ? req.body.context.trim().slice(0, 5000) : "";
    const specialty = req.body?.specialty;
    const language = req.body?.language === "en" ? "en" : "ar";
    const allowedSpecialties = ["business", "development", "design", "marketing", "research", "assistant"];
    if (!request || request.length > 5000 || !allowedSpecialties.includes(specialty)) { res.status(400).json({ error: "Provide a valid project request and specialty." }); return; }
    const messages: ChatMessage[] = [{ role: "user", content: [
      "Create a practical project plan for the user request. You are AL OMDA, the executor; the user is the project owner.",
      "Specialty: " + specialty,
      "Language: " + (language === "ar" ? "Arabic" : "English"),
      "Return ONLY valid JSON, no Markdown fences, with this exact shape:",
      '{ "title": "short project title", "steps": [{ "text": "actionable step", "output": "specific deliverable", "complete": "objective acceptance check" }] }',
      "Include 3 to 5 sequential, specific steps tailored to the actual request. Keep the plan concise: one clear work result per step, no duplicate steps, and no separate files unless the customer explicitly requested files. Avoid generic filler. Respect every quantity, budget, location, platform, deadline, and constraint. Each step describes work AL OMDA will carry out, not work the user must do. Only create downloadable files when the customer explicitly requested them; avoid duplicate or unrelated files and use the fewest deliverables that fully satisfy the request. Other steps should produce the actual work or a clear, understandable result. This is a proposed plan only; do not claim execution has happened.",
      "Current project request: " + request,
      "Earlier conversation context (use only details that clearly belong to this same project; ignore unrelated topics): " + context
    ].join("\n") }];
    const providers = chooseProviders(messages);
    if (providers.length === 0) { res.status(503).json({ error: "No AI provider is configured." }); return; }
    const usage = await currentUsage(session.accessToken);
    if (usage.remaining <= 0) { res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage }); return; }
    const memory = await loadUserMemory(session.accessToken, session.user.id);
    const failures: string[] = [];
    let answer: { text: string; model: string } | null = null;
    let provider = "";
    for (const candidate of providers) {
      try { answer = await callProviderWithRetry(candidate as "gemini" | "openrouter", messages, memory); provider = candidate; break; }
      catch (error) { const reason = error instanceof Error ? error.message : "Provider unavailable"; failures.push(reason); console.warn("[AI project plan provider failure]", candidate, reason); }
    }
    if (!answer) { res.status(503).json({ error: "AI project planning is temporarily unavailable. No usage was deducted.", details: failures.slice(0, 2) }); return; }
    const parsePlan = (raw: string): any | null => {
      try {
        let jsonText = raw.trim();
        if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const value = JSON.parse(jsonText);
        if (!value || typeof value.title !== "string" || !value.title.trim() || !Array.isArray(value.steps) || value.steps.length < 3 || value.steps.length > 5 ||
          value.steps.some((step: any) => !step || typeof step.text !== "string" || !step.text.trim() || step.text.length > 1200 || typeof step.output !== "string" || !step.output.trim() || step.output.length > 1200 || typeof step.complete !== "string" || !step.complete.trim() || step.complete.length > 1200)) return null;
        return value;
      } catch { return null; }
    };
    let parsed = parsePlan(answer.text);
    if (!parsed) {
      const repairRequest: ChatMessage[] = [{ role: "user", content: [
        "Repair your previous project plan. Return ONLY valid JSON with a title and 3 to 5 sequential steps. Every step must contain non-empty text, output, and complete strings.",
        "Preserve the exact customer request, constraints, quantities, budget, platform, location, and deadline. Avoid generic filler. Each step must describe work AL OMDA will perform and a clear deliverable.",
        "Required schema: " + '{"title":"...","steps":[{"text":"...","output":"...","complete":"..."}]}',
        "Original customer request: " + request,
        "Invalid previous response: " + answer.text.slice(0, 12000)
      ].join("\n") }];
      try {
        answer = await callProviderWithRetry(provider as "gemini" | "openrouter", repairRequest, memory);
        parsed = parsePlan(answer.text);
      } catch (error) {
        console.warn("[AI project plan repair failed]", error instanceof Error ? error.message : "Unknown error");
      }
    }
    if (!parsed) {
      const alternateProvider = providers.find((candidate) => candidate !== provider);
      if (alternateProvider) {
        try {
          const alternateAnswer = await callProviderWithRetry(alternateProvider as "gemini" | "openrouter", [{
            role: "user",
            content: [
              "Create a concise, accurate project plan. Return ONLY valid JSON with this exact shape: " + '{"title":"...","steps":[{"text":"...","output":"...","complete":"..."}]}',
              "Create 3 to 5 sequential steps, each with one concrete result and an objective completion check. Preserve every explicit requirement, quantity, budget, platform, location, deadline, language, and exclusion.",
              "Do not add generic filler, duplicate work, or unnecessary files. Create downloadable files only if explicitly requested. Each step describes work AL OMDA will perform.",
              "Original request: " + request,
              "Relevant same-project context: " + context,
              "Previous invalid output: " + answer.text.slice(0, 10000)
            ].join("\n")
          }], memory);
          const alternatePlan = parsePlan(alternateAnswer.text);
          if (alternatePlan) {
            answer = alternateAnswer;
            parsed = alternatePlan;
            provider = alternateProvider;
          }
        } catch (error) {
          console.warn("[Alternate project plan engine failed]", error instanceof Error ? error.message : "Unknown error");
        }
      }
    }
    if (!parsed) {
      res.status(502).json({ error: "تعذر اعتماد خطة المشروع بعد مراجعة المحركين. لم يتم خصم وحدات؛ احتفظنا بطلبك ويمكنك المحاولة دون إعادة كتابته." });
      return;
    }
    const chargedUsage = await reserveUnits(session.accessToken, 1);
    if (!chargedUsage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage: chargedUsage }); return; }
    res.json({ title: parsed.title.trim().slice(0, 120), steps: parsed.steps.map((step: any) => ({ text: step.text.trim(), output: step.output.trim(), complete: step.complete.trim() })), provider, model: answer.model, usage: chargedUsage });
  } catch (error) { reportSupabaseError(req, res, error, "Could not generate the AI project plan."); }
});
router.post("/ai/execute-step", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to execute a project step." }); return; }
    const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
    const stepId = typeof req.body?.stepId === "string" ? req.body.stepId : "";
    const language = req.body?.language === "en" ? "en" : "ar";
    if (!/^[0-9a-f-]{36}$/i.test(taskId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(stepId)) {
      res.status(400).json({ error: "A valid task and step are required." }); return;
    }
    const taskQuery = new URLSearchParams({
      id: "eq." + taskId,
      user_id: "eq." + session.user.id,
      select: "id,title,request,specialty,steps,status",
      limit: "1",
    });
    const taskResponse = await supabaseFetch("/rest/v1/tasks?" + taskQuery.toString(), {}, session.accessToken);
    const taskRows = await readSupabaseJson<Array<{
      id: string; title: string; request: string; specialty: string; status: string;
      steps: Array<{ id: string; text: string; output?: string; complete?: string; state: string; result?: string; executedAt?: string; executionStatus?: "succeeded" | "failed"; executionError?: string }>;
    }>>(taskResponse);
    const task = taskRows[0];
    if (!task) { res.status(404).json({ error: "Project not found in your account." }); return; }
    if (task.status === "paused" || task.status === "stopped") {
      res.status(409).json({ error: "Resume the project before executing a step." }); return;
    }
    const stepIndex = task.steps.findIndex((step) => step.id === stepId);
    if (stepIndex < 0) { res.status(404).json({ error: "Project step not found." }); return; }
    const step = task.steps[stepIndex];
    const saveExecutionFailure = async (message: string): Promise<void> => {
      try {
        const latestResponse = await supabaseFetch("/rest/v1/tasks?" + taskQuery.toString(), {}, session.accessToken);
        const latestRows = await readSupabaseJson<typeof taskRows>(latestResponse);
        const latest = latestRows[0];
        if (!latest || latest.status === "paused" || latest.status === "stopped") return;
        const latestStep = latest.steps.find((item) => item.id === stepId);
        if (!latestStep || latestStep.state !== "approved" || latestStep.result) return;
        const updatedSteps = latest.steps.map((item) => item.id === stepId
          ? { ...item, executionStatus: "failed" as const, executionError: message.slice(0, 500) }
          : item);
        const failureQuery = new URLSearchParams({ id: "eq." + taskId, user_id: "eq." + session.user.id });
        await supabaseFetch("/rest/v1/tasks?" + failureQuery.toString(), {
          method: "PATCH",
          headers: { "content-type": "application/json", prefer: "return=minimal" },
          body: JSON.stringify({ steps: updatedSteps }),
        }, session.accessToken);
      } catch (failure) {
        console.warn("[AI step failure status could not be saved]", failure instanceof Error ? failure.message : "Unknown error");
      }
    };
    if (step.state !== "approved" || task.steps.slice(0, stepIndex).some((item) => item.state !== "approved")) {
      res.status(409).json({ error: "Approve this step and all earlier steps before execution." }); return;
    }
    if (step.result) { res.status(409).json({ error: "This step already has a saved result." }); return; }
    const providers = chooseProviders([{ role: "user", content: step.text }]);
    if (!providers.length) { res.status(503).json({ error: "No AI provider is configured." }); return; }
    const usage = await currentUsage(session.accessToken);
    if (usage.remaining <= 0) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage }); return; }
    const memory = await loadUserMemory(session.accessToken, session.user.id);
    // Select the file format from the customer's original request only. Planner-generated titles, steps, and acceptance text must never turn an unrelated task into Excel.
    const customerRequest = task.request || "";
    const isFinalDeliverableStep = stepIndex === task.steps.length - 1;
    const excelStep = isFinalDeliverableStep && isExcelRequest([{ role: "user", content: customerRequest }]);
    const wordStep = isFinalDeliverableStep && !excelStep && isExplicitWordFileRequest(customerRequest);
    const htmlAppStep = isFinalDeliverableStep && !excelStep && !wordStep && isDesktopAppRequest(customerRequest);
    const wordTaskMessages: ChatMessage[] = [{ role: "user", content: customerRequest }];
    const wordTaskSevenColumnTable = wordStep && isSevenColumnTableRequest(wordTaskMessages);
    const wordTaskTableOnly = wordStep && isTableOnlyRequest(wordTaskMessages);
    const wordTaskTableRequested = wordStep && (wordTaskSevenColumnTable || isWordTableRequest(customerRequest));
    const prompt = excelStep ? [
      "You are AL OMDA. Generate the actual Excel workbook content for this approved task. Do not provide instructions or Markdown.",
      "Return ONLY valid JSON: " + '{"title":"Workbook title","columns":["Column 1"],"rows":[["value"]]}',
      "Use the previously approved customer requirements and data in the project request and earlier steps. Preserve the exact approved columns and any seven approved sample products. Do not replace them with unrelated invented products or columns.",
      "For a blank template, use empty body rows. Otherwise include the approved sample data. Every row must have exactly the same number of cells as columns.",
      "Project: " + task.title,
      "Original request: " + task.request,
      "Prior approved step outputs: " + task.steps.slice(0, stepIndex).map((item) => item.text + ": " + (item.result || "")).join("\n").slice(0, 10000),
      "Approved step: " + step.text,
      "Expected deliverable: " + (step.output || "A complete .xlsx workbook"),
      "Acceptance check: " + (step.complete || "Create a real Excel workbook with the approved columns and formatting."),
      "Return between 1 and 30 columns and 1 to 500 rows."
    ].join("\n") : wordStep ? [
      "You are AL OMDA. Create the actual Word document content for this approved task. Return ONLY valid JSON, no Markdown.",
      "Schema: " + '{"title":"Document title","paragraphs":["paragraph"],"columns":["Column 1"],"rows":[["value"]]}',
      wordTaskSevenColumnTable ? "The customer explicitly requested a seven-column table. Return exactly seven meaningful columns." : wordTaskTableRequested ? "The customer explicitly requested a table. Include only the relevant columns and rows." : "PROSE DOCUMENT ONLY: put the complete document in paragraphs and return empty columns and rows. Do not invent a table.",
      wordTaskTableOnly ? "BLANK TABLE ONLY: return no paragraphs and exactly eight empty body rows. Keep all cells empty; infer only useful column headings from the original request." : "",
      "Use the original customer request and previously approved steps. Include complete, understandable content, not instructions for the user. Never add unrelated sample files, duplicate deliverables, or invented data.",
      "Original request: " + customerRequest,
      "Approved step: " + step.text,
      "Prior approved outputs: " + task.steps.slice(0, stepIndex).map((item) => item.text + ": " + (item.result || "")).join("\n").slice(0, 10000)
    ].join("\n") : htmlAppStep ? [
      "You are AL OMDA, building the requested small browser-based app as a deliverable. Return ONLY one complete, self-contained HTML document, with inline CSS and JavaScript. No Markdown fences and no instructions.",
      "The app must work immediately when opened as an .html file and inside a sandboxed preview iframe. Do not use external libraries, network requests, or external assets. Make the UI polished, responsive, and match the customer's exact request.",
      "For a desktop clock, build a working live clock that updates every second, with clear readable time and useful controls if appropriate. Do not return a tutorial or PowerShell instructions.",
      "Original customer request: " + customerRequest,
      "Approved step: " + step.text,
      "Prior approved outputs: " + task.steps.slice(0, stepIndex).map((item) => item.text + ": " + (item.result || "")).join("\n").slice(0, 10000)
    ].join("\n") : [
      "You are AL OMDA, the executor for this approved project step. Produce the actual deliverable now, not a plan telling the user how to do it.",
      "Respond in " + (language === "ar" ? "Arabic" : "English") + ".",
      "Project: " + task.title,
      "Original request: " + task.request,
      "Specialty: " + task.specialty,
      "Approved step: " + step.text,
      "Expected deliverable: " + (step.output || "A complete, usable deliverable for this step."),
      "Acceptance check: " + (step.complete || "Make the result specific, complete, and verifiable."),
      "Return the deliverable itself. Include code, structured content, calculations, or a ready-to-use draft when relevant. Be explicit about any external action you cannot perform; never claim to have changed files, deployed software, or contacted anyone.",
      "Keep the result focused and under 12,000 characters."
    ].join("\n");
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];
    const failures: string[] = [];
    let answer: { text: string; model: string } | null = null;
    let provider = "";
    for (const candidate of providers) {
      try {
        answer = await callProviderWithRetry(candidate as "gemini" | "openrouter", messages, memory);
        provider = candidate;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Provider unavailable";
        failures.push(reason);
        console.warn("[AI step execution provider failure]", candidate, reason);
      }
    }
    if (!answer) {
      await saveExecutionFailure(failures.slice(0, 2).join("; ") || "AI provider unavailable.");
      res.status(503).json({ error: "Step execution is temporarily unavailable.", details: failures.slice(0, 2) });
      return;
    }
    let validatedWordDocument = wordStep ? parseWordDocument(answer.text, wordTaskSevenColumnTable, wordTaskTableOnly, wordTaskTableRequested) : null;
    let validatedSpreadsheet = excelStep ? parseExcelWorkbook(answer.text) : null;
    let validatedHtmlApp = htmlAppStep ? parseHtmlApp(answer.text) : null;
    if (wordStep && !validatedWordDocument) {
      const repairRequest: ChatMessage[] = [{ role: "user", content: [
        "Repair the Word deliverable. Return ONLY valid JSON with title, paragraphs, columns, and rows.",
        wordTaskSevenColumnTable ? "The customer requires exactly seven table columns." : wordTaskTableRequested ? "The customer explicitly requested a table; keep the relevant table." : "The customer did not request a table; return paragraphs only and empty columns and rows.",
        wordTaskTableOnly ? "Return no paragraphs and exactly eight empty table rows, with no sample data." : "",
        "Preserve the full original request and all approved requirements. Do not invent unrelated content or extra files.",
        "Original request: " + customerRequest,
        "Approved step: " + step.text,
        "Invalid output: " + answer.text.slice(0, 12000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(provider as "gemini" | "openrouter", repairRequest, memory); }
      catch (error) { console.warn("[Word task repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      validatedWordDocument = parseWordDocument(answer.text, wordTaskSevenColumnTable, wordTaskTableOnly, wordTaskTableRequested);
      if (!validatedWordDocument) {
        // A malformed structured response from one engine must not end the task.
        // Ask the other configured engine to rebuild the deliverable from the original request.
        const alternateProvider = providers.find((candidate) => candidate !== provider);
        if (alternateProvider) {
          try {
            const alternateAnswer = await callProviderWithRetry(alternateProvider as "gemini" | "openrouter", [{
              role: "user",
              content: [
                "Create the final Microsoft Word document content. Return ONLY valid JSON with exactly title, paragraphs, columns, and rows.",
                "Read the original request and approved step carefully. Satisfy every requirement, number, format, language, and exclusion.",
                wordTaskSevenColumnTable ? "The user requires exactly seven meaningful table columns." : wordTaskTableRequested ? "The user explicitly requested a table; include only relevant columns and rows." : "The user did not request a table. Return the complete document in paragraphs and empty columns and rows.",
                wordTaskTableOnly ? "Blank table only: no paragraphs, exactly eight empty body rows, and no sample data." : "",
                "Do not return an explanation, Markdown fence, code, or unrelated files.",
                "Original request: " + customerRequest,
                "Approved step: " + step.text,
                "Previously approved work: " + task.steps.slice(0, stepIndex).map((item) => item.text + ": " + (item.result || "")).join("\n").slice(0, 10000)
              ].filter(Boolean).join("\n")
            }], memory);
            const alternateDocument = parseWordDocument(alternateAnswer.text, wordTaskSevenColumnTable, wordTaskTableOnly, wordTaskTableRequested);
            if (alternateDocument) {
              answer = alternateAnswer;
              validatedWordDocument = alternateDocument;
              provider = alternateProvider;
            }
          } catch (error) {
            console.warn("[Alternate Word task engine failed]", error instanceof Error ? error.message : "Unknown error");
          }
        }
      }
      if (!validatedWordDocument) {
        await saveExecutionFailure("Word document failed structural validation after repair and alternate-engine attempts.");
        res.status(502).json({ error: "تعذر اعتماد مستند Word بعد مراجعته بمحركين. لم يتم خصم وحدات؛ احتفظنا بطلبك ومحتوى المشروع، ويمكنك إعادة تنفيذ الخطوة دون كتابة الطلب من جديد." });
        return;
      }
    }
    if (wordStep && validatedWordDocument) {
      // Independent final review for documents created from Task History, not just chat attachments.
      try {
        const reviewProvider = provider === "openrouter" ? "openrouter" : (providers.find((candidate) => candidate !== provider) || provider);
        const reviewAnswer = await callProviderWithRetry(reviewProvider as "gemini" | "openrouter", [{
          role: "user",
          content: [
            "Act as the final quality reviewer for this Microsoft Word deliverable. Compare it against the original customer request and the approved task step line by line.",
            "Check every requirement, requested item, quantity, name, date, language, format, audience, and exclusion. Fix omissions, contradictions, unclear wording, unsupported assumptions, and unnecessary content.",
            "Preserve all correct content. Do not invent facts, sample data, tables, sections, or extra files. Do not shorten required details.",
            "Return ONLY valid JSON with exactly title, paragraphs, columns, and rows. Respect the original table/prose requirement and keep every table row aligned with its columns.",
            "Original request: " + customerRequest,
            "Approved step: " + step.text,
            "Expected output: " + (step.output || ""),
            "Acceptance criteria: " + (step.complete || ""),
            "Draft to review: " + JSON.stringify(validatedWordDocument)
          ].join("\n")
        }], memory);
        const reviewedDocument = parseWordDocument(reviewAnswer.text, wordTaskSevenColumnTable, wordTaskTableOnly, wordTaskTableRequested);
        if (reviewedDocument) {
          validatedWordDocument = reviewedDocument;
          answer = reviewAnswer;
        } else {
          console.warn("[Task Word quality review] Invalid review structure; retaining validated draft.");
        }
      } catch (error) {
        console.warn("[Task Word quality review unavailable] Retaining validated draft.", error instanceof Error ? error.message : "Unknown error");
      }
    }
    if (excelStep && !validatedSpreadsheet) {
      const repairRequest: ChatMessage[] = [{ role: "user", content: [
        "Repair the Excel workbook. Return ONLY valid JSON with title, columns, and rows. Every row must match the column count.",
        "Preserve the original request, approved requirements, and actual data. Do not invent unrelated data.",
        "Original request: " + customerRequest,
        "Invalid output: " + answer.text.slice(0, 12000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(provider as "gemini" | "openrouter", repairRequest, memory); }
      catch (error) { console.warn("[Excel task repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      validatedSpreadsheet = parseExcelWorkbook(answer.text);
      if (!validatedSpreadsheet) {
        await saveExecutionFailure("Excel workbook failed structural validation after one repair attempt.");
        res.status(502).json({ error: "تعذر اعتماد ملف Excel بعد مراجعته. لم يتم خصم وحدات؛ أعد المحاولة." });
        return;
      }
    }
    if (htmlAppStep && !validatedHtmlApp) {
      const repairRequest: ChatMessage[] = [{ role: "user", content: [
        "Repair the requested application. Return ONLY a complete self-contained HTML document with all requested functions.",
        "Original request: " + customerRequest,
        "Invalid output: " + answer.text.slice(0, 12000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(provider as "gemini" | "openrouter", repairRequest, memory); }
      catch (error) { console.warn("[HTML task repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      validatedHtmlApp = parseHtmlApp(answer.text);
      if (!validatedHtmlApp) {
        await saveExecutionFailure("HTML application failed validation after one repair attempt.");
        res.status(502).json({ error: "تعذر اعتماد التطبيق بعد مراجعته. لم يتم خصم وحدات؛ أعد المحاولة." });
        return;
      }
    }
    let spreadsheet: { title: string; columns: string[]; rows: string[][] } | null = null;
    let result = answer.text.trim().slice(0, 12000);
    if (htmlAppStep) {
      const html = validatedHtmlApp;
      if (!html) {
        await saveExecutionFailure("The AI did not return a complete HTML application.");
        res.status(502).json({ error: "تعذر إنشاء التطبيق كملف HTML صالح. أعد تنفيذ الخطوة." });
        return;
      }
      result = "ALOMDA_HTML_APP:" + html;
    } else if (wordStep) {
      const document = validatedWordDocument;
      if (!document) {
        await saveExecutionFailure("The AI did not return a valid structured Word document.");
        res.status(502).json({ error: "تعذر إنشاء مستند Word منظم. أعد تنفيذ الخطوة." });
        return;
      }
      result = "ALOMDA_DOCX_JSON:" + JSON.stringify(document);
    } else if (excelStep) {
      spreadsheet = validatedSpreadsheet;
      if (!spreadsheet) {
        await saveExecutionFailure("The AI did not return a valid structured Excel workbook.");
        res.status(502).json({ error: "تعذر إنشاء ملف Excel منظم. أعد تنفيذ الخطوة بعد قليل." });
        return;
      }
      result = "ALOMDA_XLSX_JSON:" + JSON.stringify(spreadsheet);
    }
    if (!result) {
      await saveExecutionFailure("The AI returned an empty deliverable.");
      res.status(502).json({ error: "The AI returned an empty deliverable." });
      return;
    }
    const verifyResponse = await supabaseFetch("/rest/v1/tasks?" + taskQuery.toString(), {}, session.accessToken);
    const verifyRows = await readSupabaseJson<typeof taskRows>(verifyResponse);
    const latest = verifyRows[0];
    if (!latest || latest.status === "paused" || latest.status === "stopped") {
      res.status(409).json({ error: "The project changed while this step was running. Review the project and try again." }); return;
    }
    const latestStep = latest.steps.find((item) => item.id === stepId);
    if (!latestStep || latestStep.state !== "approved" || latestStep.result) {
      res.status(409).json({ error: "This step changed or was already executed. Refresh the project." }); return;
    }
    const chargedUsage = await reserveUnits(session.accessToken, 2);
    if (!chargedUsage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage: chargedUsage }); return; }
    const executedAt = new Date().toISOString();
    const updatedSteps = latest.steps.map((item) => item.id === stepId ? { ...item, result, executedAt, executionStatus: "succeeded" as const, executionError: undefined } : item);
    const updateQuery = new URLSearchParams({ id: "eq." + taskId, user_id: "eq." + session.user.id, select: "id" });
    const updateResponse = await supabaseFetch("/rest/v1/tasks?" + updateQuery.toString(), {
      method: "PATCH",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ steps: updatedSteps }),
    }, session.accessToken);
    const updatedRows = await readSupabaseJson<Array<{ id: string }>>(updateResponse);
    if (!updatedRows[0]) { res.status(409).json({ error: "Could not save the execution result. Refresh and try again." }); return; }
    res.json({ taskId, stepId, result, ...(spreadsheet ? { spreadsheet } : {}), executedAt, provider, model: answer.model, usage: chargedUsage });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not execute this project step.");
  }
});

router.post("/ai/live-token", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to use live voice chat." });
      return;
    }
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      res.status(503).json({ error: "Live voice is not configured. Add a Gemini API key to Cloudflare Worker secrets." });
      return;
    }
    const usage = await currentUsage(session.accessToken);
    if (usage.remaining <= 0) {
      res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage });
      return;
    }
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        uses: 1,
        expireTime
      })
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || typeof payload?.name !== "string") {
      const detail = providerErrorMessage(payload);
      console.warn("[Gemini Live token failure]", response.status, detail);
      res.status(502).json({ error: "Gemini Live could not create a temporary voice session.", details: detail || "Provider rejected the token request." });
      return;
    }
    const chargedUsage = await reserveUnits(session.accessToken, 1);
    if (!chargedUsage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage: chargedUsage }); return; }
    res.json({ token: payload.name, model: "gemini-3.1-flash-live-preview", usage: chargedUsage });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not start a live voice session.");
  }
});

router.post("/ai/speech", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to generate speech." }); return; }
    const input = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!input || input.length > 4000) {
      res.status(400).json({ error: "Provide speech text between 1 and 4,000 characters." });
      return;
    }
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) { res.status(503).json({ error: "OpenRouter is not configured for free speech generation." }); return; }
    const usage = await currentUsage(session.accessToken);
    if (usage.remaining <= 0) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage }); return; }
    const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
        "HTTP-Referer": "https://al-omda-ai-app.abdelfattahhossam1.workers.dev",
        "X-Title": "AL OMDA AI",
      },
      body: JSON.stringify({
        model: "fish-audio/s2.1-pro-free:free",
        input,
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      let message = detail.slice(0, 300);
      try { message = providerErrorMessage(JSON.parse(detail)) || message; } catch { /* provider returned plain text */ }
      res.status(response.status === 429 ? 429 : 503).json({
        error: "تعذر إنشاء الصوت المجاني حاليًا. لم يتم خصم وحداتك؛ حاول مرة أخرى لاحقًا.",
        details: message,
      });
      return;
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("audio/")) {
      res.status(502).json({ error: "The speech provider returned an invalid audio format. No usage was deducted." });
      return;
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (!audio.byteLength) {
      res.status(502).json({ error: "The speech provider returned an empty audio file. No usage was deducted." });
      return;
    }
    const chargedUsage = await reserveUnits(session.accessToken, 1);
    if (!chargedUsage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage: chargedUsage }); return; }
    res.setHeader("content-type", contentType);
    res.setHeader("content-disposition", 'inline; filename="al-omda-speech.mp3"');
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-ai-usage-remaining", String(chargedUsage.remaining));
    res.setHeader("x-ai-usage-used", String(chargedUsage.used));
    res.status(200).send(audio);
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not generate speech.");
  }
});

router.get("/ai/usage", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to use AI chat." });
      return;
    }
    const usage = await currentUsage(session.accessToken);
    res.json({ ...usage, providers: getProviders() });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load AI usage.");
  }
});

router.post("/ai/chat", requireSameOrigin, async (req, res): Promise<void> => {
  let accessToken: string | undefined;
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to use AI chat." });
      return;
    }
    accessToken = session.accessToken;
    const rawMessages = req.body?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > 16) {
      res.status(400).json({ error: "Send between 1 and 16 chat messages." });
      return;
    }
    const messages: ChatMessage[] = [];
    for (const item of rawMessages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || !item.content.trim() || item.content.length > 8000) {
        res.status(400).json({ error: "A chat message is invalid or too long." });
        return;
      }
      let image: ChatMessage["image"];
      if (item.image !== undefined) {
        if (!item.image || typeof item.image.mimeType !== "string" || !/^image\/(?:jpeg|png|webp|gif)$/i.test(item.image.mimeType) || typeof item.image.data !== "string" || item.image.data.length > 5_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.image.data)) {
          res.status(400).json({ error: "The image is invalid or too large. Use a JPEG, PNG, WebP, or GIF under 4 MB." });
          return;
        }
        image = { mimeType: item.image.mimeType, data: item.image.data };
      }
      messages.push({ role: item.role, content: item.content.trim(), ...(image ? { image } : {}) });
    }
    if (messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "The last message must be from the user." });
      return;
    }
    const characters = messages.reduce((total, message) => total + message.content.length, 0);
    if (characters > 30000) {
      res.status(400).json({ error: "Keep the conversation context under 30,000 characters per request." });
      return;
    }
    const [userMemory, usage] = await Promise.all([
      loadUserMemory(accessToken, session.user.id),
      currentUsage(accessToken),
    ]);
    console.info("[AI memory context]", { loaded: Boolean(userMemory.trim()), characters: userMemory.length });
    const latestCustomerRequest = getLatestUserRequest(messages);
    const standaloneGreeting = isStandaloneGreeting(latestCustomerRequest);
    // A greeting is a fresh conversational turn; do not let an old file request in
    // the transcript steer the provider into producing an unrelated attachment.
    const modelConversation: ChatMessage[] = standaloneGreeting ? [messages[messages.length - 1]] : messages;
    const excelRequest = isExcelRequest(messages);
    const wordDocumentRequest = !excelRequest && isWordDocumentRequest(messages);
    const desktopAppRequest = !excelRequest && !wordDocumentRequest && isDesktopAppRequest(latestCustomerRequest);
    const sevenColumnTable = wordDocumentRequest && isSevenColumnTableRequest(messages);
    const tableOnly = wordDocumentRequest && isTableOnlyRequest(messages);
    const wordTableRequested = wordDocumentRequest && (sevenColumnTable || isWordTableRequest(latestCustomerRequest));
    const modelMessages: ChatMessage[] = desktopAppRequest ? [
      ...messages,
      { role: "user", content: [
        "SPECIAL OUTPUT MODE: Build the actual requested application now. Return ONLY one complete, self-contained HTML document. Do not return a tutorial, source-code instructions, PowerShell, or steps for the user.",
        "Use inline CSS and JavaScript only. No external libraries, network requests, or external assets. The HTML must work immediately in a sandboxed iframe and when downloaded and opened in a browser.",
        "Create a polished, responsive interface matching the exact request. If it is a desktop clock, make a live clock that updates every second, show a clear readable time, and include the date where useful.",
        "Return the complete HTML document beginning with <!doctype html> or <html> and ending with </html>.",
        "Original customer request: " + latestCustomerRequest
      ].join("\n") }
    ] : excelRequest ? [
      ...messages,
      { role: "user", content: [
        "SPECIAL OUTPUT MODE: Create a real Excel workbook deliverable. Return ONLY valid JSON with this exact schema: " + '{"title":"Workbook title","columns":["Column 1","Column 2"],"rows":[["",""]]}',
        "Choose useful column headings and create blank rows if the user asks for a blank template. Otherwise populate the workbook with relevant, accurate data. Never return instructions for manually creating the file.",
        "Keep the workbook in the user's language. Use 1 to 30 columns and 1 to 500 rows. Each row must match the number of columns.",
        "Original user request: " + getLatestUserRequest(messages)
      ].join("\n") }
    ] : wordDocumentRequest ? [
      ...messages,
      { role: "user", content: [
        "SPECIAL OUTPUT MODE: Create a real Microsoft Word document deliverable. Do not answer with source code, instructions, or a Markdown table.",
        "Return ONLY valid JSON with this exact schema: " + '{"title":"Document title","paragraphs":["optional intro or notes"],"columns":["column 1","column 2"],"rows":[["cell 1","cell 2"]]}',
        sevenColumnTable ? "The user requested a seven-field table. The columns array MUST contain exactly 7 meaningful column headings." : wordTableRequested ? "The user explicitly requested a table. Create only the table structure and content needed by the request." : "PROSE DOCUMENT ONLY: write the complete document in paragraphs. Set columns and rows to empty arrays. Do NOT add a table because the user did not request one.",
        tableOnly ? "TABLE-ONLY BLANK TEMPLATE: return an empty paragraphs array and exactly 8 blank body rows. Every row must contain the correct number of empty strings. Do NOT fill any cells with examples, sample data, explanations, or invented content. The table headers may be inferred from the request." : wordTableRequested ? "For a populated table, include meaningful content only in relevant rows, with every row matching the column count." : "For a prose document, put the full requested content in paragraphs. Keep columns and rows empty.",
        "Keep the document in the user's language. For Arabic, write natural Arabic headings and content, suitable for right-to-left Word layout.",
        tableOnly ? "Do not add prose before or after the table. The user asked for the table only." : wordTableRequested ? "Include only relevant table rows. Do not add unrelated sample data." : "Write clear, complete, well-organized paragraphs with useful headings where appropriate. Keep columns and rows empty. Do not invent a table.",
        "Before drafting, interpret every sentence in the original request. Internally checklist all requested items, constraints, quantities, names, language, format, and exclusions. Draft only what was requested, then verify the finished document against every item. Resolve ambiguity conservatively; never invent facts, sections, examples, tables, or extra deliverables. Do not show the checklist.",
        "The JSON must be valid. paragraphs must contain the complete document text; columns and rows must be empty unless a table was explicitly requested.",
        "Original user request: " + getLatestUserRequest(messages)
      ].join("\n") }
    ] : modelConversation;
    const providers = chooseProviders(modelMessages);
    if (providers.length === 0) {
      res.status(503).json({ error: "No free AI provider is connected yet. Configure a free Gemini or OpenRouter key on the Worker." });
      return;
    }
    if (usage.remaining <= 0) {
      res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage });
      return;
    }

    let answer: { text: string; model: string } | null = null;
    let usedProvider = "";
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        answer = await callProviderWithRetry(provider as "gemini" | "openrouter", modelMessages, userMemory);
        usedProvider = provider;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Provider unavailable";
        failures.push(reason);
        console.warn("[AI provider failure]", provider, reason);
      }
    }
    if (!answer) {
      const quotaExhausted = failures.some((failure) => /\b429\b|quota|rate limit|free-models-per-day|requests per day/i.test(failure));
      res.status(503).json({
        error: quotaExhausted
          ? "وصلنا إلى حدود الاستخدام المجاني لدى مزوّدي الذكاء الاصطناعي حاليًا (Gemini وOpenRouter). لم يتم خصم أي وحدات من رصيد العمدة. جرّب بعد تجدد الحصة المجانية، أو أضف رصيدًا لدى المزوّد إذا رغبت؛ العمدة لن يستخدم خدمة مدفوعة دون موافقتك."
          : "خدمات الذكاء الاصطناعي المجانية غير متاحة مؤقتًا. لم يتم خصم أي وحدات من رصيد العمدة؛ حاول مرة أخرى لاحقًا.",
        details: failures.slice(0, 3),
        usage
      });
      return;
    }
    let validatedWordDocument = wordDocumentRequest ? parseWordDocument(answer.text, sevenColumnTable, tableOnly, wordTableRequested) : null;
    if (wordDocumentRequest && !validatedWordDocument) {
      const repairRequest = [{ role: "user" as const, content: [
        "Repair the Word document output. Return ONLY valid JSON: " + '{"title":"...","paragraphs":["..."],"columns":[],"rows":[]}',
        "Read the original request sentence by sentence and preserve every requested requirement, constraint, and exclusion. Do not add a table unless explicitly requested. For prose documents, put all complete content in paragraphs and keep columns and rows empty. For a requested table, include only relevant headings and rows with matching cell counts.",
        sevenColumnTable ? "The customer explicitly requires exactly seven table columns." : "",
        tableOnly ? "The customer requires a blank table only, with exactly eight empty body rows and no paragraphs." : "",
        "Preserve all details and constraints. Do not invent unrelated sections or data.",
        "Original request: " + latestCustomerRequest,
        "Invalid previous output: " + answer.text.slice(0, 14000)
      ].filter(Boolean).join("\n") }];
      try { answer = await callProviderWithRetry(usedProvider as "gemini" | "openrouter", repairRequest, userMemory); }
      catch (error) { console.warn("[Word document repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      validatedWordDocument = parseWordDocument(answer.text, sevenColumnTable, tableOnly, wordTableRequested);
      if (!validatedWordDocument) {
        // Try the other configured provider automatically before returning a failure to the user.
        const alternateProvider = providers.find((candidate) => candidate !== usedProvider);
        if (alternateProvider) {
          try {
            const alternateAnswer = await callProviderWithRetry(alternateProvider as "gemini" | "openrouter", [
              { role: "user", content: [
                "Create the final Word document now. Return ONLY valid JSON with title, paragraphs, columns, and rows.",
                "Review every sentence of the original request and satisfy all explicit requirements. Do not invent content or add a table unless explicitly requested.",
                sevenColumnTable ? "Exactly seven table columns are required." : wordTableRequested ? "A relevant table is explicitly required." : "This is a prose-only document: paragraphs contain the complete text; columns and rows must be empty arrays.",
                tableOnly ? "Blank table only: eight empty rows; no prose or sample values." : "",
                "Original request: " + latestCustomerRequest
              ].filter(Boolean).join("\n") }
            ], userMemory);
            const alternateDocument = parseWordDocument(alternateAnswer.text, sevenColumnTable, tableOnly, wordTableRequested);
            if (alternateDocument) {
              answer = alternateAnswer;
              validatedWordDocument = alternateDocument;
              usedProvider = alternateProvider;
            }
          } catch (error) { console.warn("[Alternate Word provider failed]", error instanceof Error ? error.message : "Unknown error"); }
        }
      }
      if (!validatedWordDocument) {
        res.status(502).json({ error: "تعذر إنشاء المستند بعد محاولات الإصلاح التلقائية. لم يتم خصم وحداتك. حاول بعد قليل، ولن تحتاج إلى إعادة كتابة طلبك." });
        return;
      }
    }
    if (wordDocumentRequest && validatedWordDocument) {
      // Independent quality-control pass: compare the draft against the user's exact request before delivering it.
      try {
        const reviewProvider = usedProvider === "openrouter" ? "openrouter" : (providers.find((candidate) => candidate !== usedProvider) || usedProvider);
        const reviewAnswer = await callProviderWithRetry(reviewProvider as "gemini" | "openrouter", [{
          role: "user",
          content: [
            "You are the final quality reviewer for a Microsoft Word document. Compare the draft against the original user request line by line.",
            "Check that every explicit requirement, requested item, number, name, language, audience, format, and exclusion is satisfied. Identify omissions, contradictions, unsupported assumptions, confusing wording, and unnecessary sections.",
            "Correct any issue you find. Preserve all correct content. Do not add unrequested tables, sample data, sections, or deliverables. Do not shorten or omit required details.",
            "Return ONLY valid JSON with exactly these keys: title, paragraphs, columns, rows. For a prose-only document, columns and rows must be empty arrays. For a requested table, preserve the required columns and matching rows.",
            "Original user request: " + latestCustomerRequest,
            "Draft to review: " + JSON.stringify(validatedWordDocument)
          ].join("\n")
        }], userMemory);
        const reviewedDocument = parseWordDocument(reviewAnswer.text, sevenColumnTable, tableOnly, wordTableRequested);
        if (reviewedDocument) {
          validatedWordDocument = reviewedDocument;
          answer = reviewAnswer;
        } else {
          console.warn("[Word quality review] Reviewer returned invalid structure; retaining the validated draft.");
        }
      } catch (error) {
        console.warn("[Word quality review unavailable] Retaining the validated draft.", error instanceof Error ? error.message : "Unknown error");
      }
    }
    let validatedSpreadsheet = excelRequest ? parseExcelWorkbook(answer.text) : null;
    if (excelRequest && !validatedSpreadsheet) {
      const repairRequest = [{ role: "user" as const, content: [
        "Repair the Excel workbook. Return ONLY valid JSON: " + '{"title":"...","columns":["..."],"rows":[["..."]]}',
        "Use relevant columns and rows of equal width. Preserve the original request and never add unrelated sample data.",
        "Original request: " + latestCustomerRequest,
        "Invalid previous output: " + answer.text.slice(0, 14000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(usedProvider as "gemini" | "openrouter", repairRequest, userMemory); }
      catch (error) { console.warn("[Excel workbook repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      validatedSpreadsheet = parseExcelWorkbook(answer.text);
      if (!validatedSpreadsheet) {
        res.status(502).json({ error: "لم يتم اعتماد ملف Excel لأن مراجعته البنيوية فشلت. لم يتم خصم وحدات." });
        return;
      }
    }
    let validatedHtmlApp = desktopAppRequest ? parseHtmlApp(answer.text) : null;
    if (desktopAppRequest && !validatedHtmlApp) {
      const repairRequest = [{ role: "user" as const, content: [
        "Repair the app output. Return ONLY one complete self-contained HTML document. No Markdown or external dependencies.",
        "Original request: " + latestCustomerRequest,
        "Invalid previous output: " + answer.text.slice(0, 14000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(usedProvider as "gemini" | "openrouter", repairRequest, userMemory); }
      catch (error) { console.warn("[HTML app repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      if (!parseHtmlApp(answer.text)) {
        res.status(502).json({ error: "لم يتم اعتماد التطبيق لأن فحص HTML فشل. لم يتم خصم وحدات." });
        return;
      }
    }
    const latestUsage = await reserveUnits(accessToken, Math.min(5, Math.max(1, Math.ceil(characters / 6000))));
    if (!latestUsage.allowed) {
      res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage: latestUsage });
      return;
    }
    if (desktopAppRequest) {
      const html = parseHtmlApp(answer.text);
      if (!html) {
        res.status(502).json({ error: "تعذر إنشاء التطبيق كملف HTML صالح. أعد إرسال الطلب مرة واحدة." });
        return;
      }
      res.json({
        reply: "تم إنشاء التطبيق وتجهيز معاينته وملف HTML للتحميل.",
        app: { title: latestCustomerRequest.slice(0, 100) || "AL OMDA App", html },
        provider: usedProvider,
        model: answer.model,
        usage: latestUsage,
      });
      return;
    }
    if (excelRequest) {
      const spreadsheet = validatedSpreadsheet;
      if (!spreadsheet) {
        res.status(502).json({ error: "تعذر تكوين ملف Excel منظم. أعد إرسال الطلب مرة واحدة." });
        return;
      }
      res.json({
        reply: "تم إنشاء بيانات المصنف وتجهيز ملف Excel قابل للتحميل والمعاينة.",
        spreadsheet,
        provider: usedProvider,
        model: answer.model,
        usage: latestUsage,
      });
      return;
    }
    if (wordDocumentRequest) {
      const document = validatedWordDocument;
      if (!document) {
        res.status(502).json({ error: "لم يكتمل إنشاء مستند Word بعد محاولات الإصلاح التلقائية. لم يتم خصم وحداتك، واحتفظنا بطلبك؛ حاول بعد قليل." });
        return;
      }
      res.json({
        reply: "تم إعداد محتوى مستند Word. أرفقت لك الملف الجاهز للتحميل.",
        document,
        provider: usedProvider,
        model: answer.model,
        usage: latestUsage,
      });
      return;
    }
    res.json({ reply: answer.text, provider: usedProvider, model: answer.model, usage: latestUsage });
  } catch (error) {

    reportSupabaseError(req, res, error, "The AI request could not be completed.");
  }
});

export default router;
