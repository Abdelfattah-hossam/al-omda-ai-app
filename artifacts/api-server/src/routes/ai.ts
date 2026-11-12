import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();
const DAILY_LIMIT = 1000;
type ChatMessage = { role: "user" | "assistant"; content: string };
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
  return messages.filter((message) => message.role === "user").slice(-2).map((message) => message.content).join("\n");
}
function isExcelRequest(messages: ChatMessage[]): boolean {
  const request = getLatestUserRequest(messages);
  return /\b(excel|xlsx|spreadsheet|workbook)\b|إكسل|اكسيل|اكسل|ملف\s*(?:جداول|جدول بيانات)|جدول\s*بيانات|شيت\s*اكسل/i.test(request);
}
function isExplicitWordFileRequest(request: string): boolean {
  return /\b(?:word|docx)\b|ملف\s*(?:و?ورد|word)|مستند\s*(?:و?ورد|word)|صيغة\s*(?:و?ورد|word)/i.test(request);
}
function isDesktopAppRequest(request: string): boolean {
  const normalized = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  const desktop = /desktop|سطح\s*(?:ال)?مكتب|نافذة سطح المكتب/i;
  const clock = /ساعة|clock|hour|watch|وقت|time/i;
  const appAction = /اعمل|اعملي|انشئ|انشاء|ابني|بناء|صمم|برمج|نفذ|تنفذ|تنفيذ|عايز|عاوز|محتاج|create|build|make|develop|generate/i;
  const appNoun = /تطبيق|برنامج|app|application|موقع|website|نظام|مشروع|لوحة\s*تحكم|متجر|ساعة|clock/i;
  return (
    (desktop.test(normalized) && clock.test(normalized)) ||
    (appNoun.test(normalized) && appAction.test(normalized)) ||
    /(?:desktop|سطح\s*(?:ال)?مكتب).{0,100}(?:تطبيق|برنامج|app|نافذة)|(?:تطبيق|برنامج|app).{0,100}(?:desktop|سطح\s*(?:ال)?مكتب)/i.test(normalized)
  );
}
function parseHtmlApp(text: string): string | null {
  const source = text.trim().replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "");
  if (!/<html[\s>]|<!doctype\s+html|<body[\s>]/i.test(source) || !/<script[\s>]/i.test(source) && !/<main[\s>]|<div[\s>]/i.test(source)) return null;
  if (source.length > 90000) return null;
  return source;
}
function isWordDocumentRequest(messages: ChatMessage[]): boolean {
  if (isExcelRequest(messages)) return false;
  const request = getLatestUserRequest(messages);
  const asksForSevenFieldTable = /جدول.{0,70}(?:7|سبع)\s*(?:خانات|أعمدة|اعمدة|حقول)?|(?:7|سبع)\s*(?:خانات|أعمدة|اعمدة|حقول).{0,70}جدول/i.test(request);
  const explicitWord = /\b(word|docx|\\.docx)\b|ملف\s*(?:و?ورد|word)|مستند\s*(?:و?ورد|word)|جدول.{0,60}(?:و?ورد|word|خانات|أعمدة)|(?:و?ورد|word).{0,60}جدول/i.test(request);
  const asksForDownloadableDocument = /(?:ملف|مستند).{0,55}(?:تحميل|جاهز|اعمل|اعملي|عايز|عاوز|محتاج|انشئ|أنشئ)|(?:تحميل|جاهز للتحميل).{0,55}(?:ملف|مستند)/i.test(request);
  return asksForSevenFieldTable || explicitWord || asksForDownloadableDocument;
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
    if (!value || typeof value.title !== "string" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null;
    const columns = value.columns.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim()).slice(0, 30);
    if (!columns.length) return null;
    const rows = value.rows.filter((row: unknown) => Array.isArray(row)).slice(0, 500).map((row: unknown[]) => columns.map((_: string, index: number) => String(row[index] ?? "").slice(0, 2000)));
    if (!rows.length) return null;
    return { title: value.title.trim().slice(0, 180) || "Excel workbook", columns, rows };
  } catch { return null; }
}

function parseWordDocument(text: string, forceSevenColumns: boolean, tableOnly: boolean): { title: string; paragraphs: string[]; columns: string[]; rows: string[][] } | null {
  try {
    let source = text.trim().replace(/^\\s*```(?:json)?\\s*/i, "").replace(/\\s*```\\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1));
    if (!value || typeof value.title !== "string" || !value.title.trim()) return null;
    const rawParagraphs = value.paragraphs === undefined ? [] : value.paragraphs;
    const rawColumns = value.columns === undefined ? [] : value.columns;
    const rawRows = value.rows === undefined ? [] : value.rows;
    if (!Array.isArray(rawParagraphs) || !Array.isArray(rawColumns) || !Array.isArray(rawRows)) return null;
    const paragraphs = tableOnly ? [] : rawParagraphs.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.slice(0, 5000)).slice(0, 80);
    const columns = rawColumns.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim()).slice(0, 12);
    if (forceSevenColumns && columns.length !== 7) return null;
    if (columns.length > 12) return null;
    if (tableOnly && columns.length === 0) return null;
    if (columns.length === 0 && (rawRows.length > 0 || paragraphs.length === 0)) return null;
    const rows = columns.length ? rawRows.filter((row: unknown) => Array.isArray(row)).slice(0, 100).map((row: unknown[]) => columns.map((_: string, index: number) => tableOnly ? "" : String(row[index] ?? "").slice(0, 2000))) : [];
    const finalRows = tableOnly && rows.length === 0 ? Array.from({ length: 8 }, () => columns.map(() => "")) : rows;
    if (columns.length > 0 && finalRows.length === 0) return null;
    return { title: value.title.trim().slice(0, 180), paragraphs, columns, rows: finalRows };
  } catch { return null; }
}
function isCodingRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /code|coding|debug|typescript|javascript|python|react|node|sql|html|css|api|bug|error|stack trace|برمج|كود|بايثون|جافاسكريبت|تايب سكريبت|ريأكت|قاعدة بيانات|تصحيح|خطأ|برنامج|موقع|تطبيق/i.test(last);
}

function systemPrompt(coding: boolean, memory = ""): string {
  const base = "You are AL OMDA AI (العمدة), the AI assistant itself. The name AL OMDA always refers to YOU, the assistant, never to a separate human, colleague, or team. Match the user's language. Before answering, carefully parse the COMPLETE user request and the relevant conversation context. Silently make a requirements checklist: exact deliverable, every requested item, quantities, format, language, audience, constraints, exclusions, and what must not be changed. Resolve references such as this/that/previous using conversation context. Do not skip, reinterpret, or replace any explicit requirement. If a request is actionable and sufficiently clear, do the work rather than merely describing how the user can do it. Before sending the response, silently verify that every requirement is addressed, all generated content is coherent and understandable, calculations and structure are consistent, and any claimed file or action actually exists. For structured files, validate the complete structure before declaring success; if the first output is malformed, correct it and validate again. Never return an empty, irrelevant, generic, or confusing artifact. If a requirement is genuinely ambiguous and changes the result materially, ask one focused question; otherwise make the safest reasonable assumption and state it briefly. Be accurate, practical, and honest about uncertainty. When the user delegates a project, YOU (AL OMDA AI) are the intended executor: analyze the request, create the deliverables or code using available tools, make revisions, and report what was actually completed. The user is the project owner who sets goals, gives direction, and reviews or approves important decisions. Never say the user should execute delegated work themselves. Never claim to have executed code or changed external systems unless a tool actually did so. If you lack a required tool, explain the specific limitation and provide the closest useful work you can actually complete. Do not reveal private reasoning; provide concise conclusions and verifiable results.";
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
    parts: [{ text: message.content }],
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(isCodingRequest(messages), memory) }] },
      contents,
      generationConfig: { maxOutputTokens: isCodingRequest(messages) ? 3000 : 1400, temperature: 0.4 },
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})${providerErrorMessage(payload) ? ": " + providerErrorMessage(payload) : "."}`);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text, model };
}

async function callOpenRouter(messages: ChatMessage[], memory = ""): Promise<{ text: string; model: string }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OpenRouter is not configured.");
  // The special router is restricted to free models; never select a paid model ID.
  const model = "openrouter/free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: { authorization: "Bearer " + key, "content-type": "application/json", "HTTP-Referer": "https://al-omda-ai-app.abdelfattahhossam1.workers.dev", "X-Title": "AL OMDA AI" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt(isCodingRequest(messages), memory) }, ...messages], max_tokens: isCodingRequest(messages) ? 3000 : 1400, temperature: 0.4 }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error("OpenRouter request failed (" + response.status + ")" + (providerErrorMessage(payload) ? ": " + providerErrorMessage(payload) : "."));
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned an empty response.");
  return { text, model: payload?.model || model };
}

async function callProviderWithRetry(provider: "gemini" | "openrouter", messages: ChatMessage[], memory = ""): Promise<{ text: string; model: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return provider === "gemini" ? await callGemini(messages, memory) : await callOpenRouter(messages, memory);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const temporary = /\\b(?:429|500|502|503|504)\\b|empty response|temporarily unavailable|high demand|timeout/i.test(message);
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
      "Include 4 to 7 sequential, specific steps tailored to the actual request. Avoid generic filler. Respect every quantity, budget, location, platform, deadline, and constraint. Each step describes work AL OMDA will carry out, not work the user must do. This is a proposed plan only; do not claim execution has happened.",
      "User request: " + request
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
    if (!answer) { res.status(503).json({ error: "AI project planning is temporarily unavailable. The attempt remains counted in today allowance.", details: failures.slice(0, 2) }); return; }
    let parsed: any;
    try {
      let jsonText = answer.text.trim();
      if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      parsed = JSON.parse(jsonText);
    } catch { res.status(502).json({ error: "The AI returned a plan in an unreadable format. Please try again." }); return; }
    if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim() || !Array.isArray(parsed.steps) || parsed.steps.length < 3 || parsed.steps.length > 8 || parsed.steps.some((step: any) => !step || typeof step.text !== "string" || !step.text.trim() || step.text.length > 1200 || typeof step.output !== "string" || step.output.length > 1200 || typeof step.complete !== "string" || step.complete.length > 1200)) {
      res.status(502).json({ error: "The AI plan did not meet the required structure. Please try again." }); return;
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
    const usage = await reserveUnits(session.accessToken, 2);
    if (!usage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up.", usage }); return; }
    const memory = await loadUserMemory(session.accessToken, session.user.id);
    // Select the file format from the customer's original request only. Planner-generated titles, steps, and acceptance text must never turn an unrelated task into Excel.
    const customerRequest = task.request || "";
    const isFinalDeliverableStep = stepIndex === task.steps.length - 1;
    const excelStep = isFinalDeliverableStep && isExcelRequest([{ role: "user", content: customerRequest }]);
    const wordStep = isFinalDeliverableStep && !excelStep && isExplicitWordFileRequest(customerRequest);
    const htmlAppStep = isFinalDeliverableStep && !excelStep && !wordStep && isDesktopAppRequest(customerRequest);
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
      "Use the original customer request and the previously approved steps. Include useful complete content, not instructions for the user.",
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
    let spreadsheet: { title: string; columns: string[]; rows: string[][] } | null = null;
    let result = answer.text.trim().slice(0, 12000);
    if (htmlAppStep) {
      const html = parseHtmlApp(answer.text);
      if (!html) {
        await saveExecutionFailure("The AI did not return a complete HTML application.");
        res.status(502).json({ error: "تعذر إنشاء التطبيق كملف HTML صالح. أعد تنفيذ الخطوة." });
        return;
      }
      result = "ALOMDA_HTML_APP:" + html;
    } else if (wordStep) {
      const document = parseWordDocument(answer.text, false, false);
      if (!document) {
        await saveExecutionFailure("The AI did not return a valid structured Word document.");
        res.status(502).json({ error: "تعذر إنشاء مستند Word منظم. أعد تنفيذ الخطوة." });
        return;
      }
      result = "ALOMDA_DOCX_JSON:" + JSON.stringify(document);
    } else if (excelStep) {
      spreadsheet = parseExcelWorkbook(answer.text);
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
    res.json({ taskId, stepId, result, ...(spreadsheet ? { spreadsheet } : {}), executedAt, provider, model: answer.model, usage: await currentUsage(session.accessToken) });
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
    const usage = await reserveUnits(session.accessToken, 1);
    if (!usage.allowed) {
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
    res.json({ token: payload.name, model: "gemini-3.1-flash-live-preview", usage: await currentUsage(session.accessToken) });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not start a live voice session.");
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
      messages.push({ role: item.role, content: item.content.trim() });
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
    const excelRequest = isExcelRequest(messages);
    const wordDocumentRequest = !excelRequest && isWordDocumentRequest(messages);
    const latestCustomerRequest = messages.filter((message) => message.role === "user").slice(-1)[0]?.content ?? "";
    const desktopAppRequest = !excelRequest && !wordDocumentRequest && isDesktopAppRequest(latestCustomerRequest);
    const sevenColumnTable = wordDocumentRequest && isSevenColumnTableRequest(messages);
    const tableOnly = wordDocumentRequest && isTableOnlyRequest(messages);
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
        sevenColumnTable ? "The user requested a seven-field table. The columns array MUST contain exactly 7 meaningful column headings." : "Choose the number of columns and rows that best fulfill the user's request.",
        tableOnly ? "TABLE-ONLY BLANK TEMPLATE: return an empty paragraphs array and exactly 8 blank body rows. Every row must contain the correct number of empty strings. Do NOT fill any cells with examples, sample data, explanations, or invented content. The table headers may be inferred from the request." : "For a populated document, include meaningful complete content in rows.",
        "Keep the document in the user's language. For Arabic, write natural Arabic headings and content, suitable for right-to-left Word layout.",
        tableOnly ? "Do not add prose before or after the table. The user asked for the table only." : "Include enough useful rows to make the requested document usable. Do not put code in cells unless the user explicitly requested a code table.",
        "Original user request: " + getLatestUserRequest(messages)
      ].join("\n") }
    ] : messages;
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
      res.status(503).json({ error: "All configured free AI providers are temporarily unavailable. No AI usage was deducted; please retry shortly.", details: failures.slice(0, 3), usage });
      return;
    }
    if (wordDocumentRequest && !parseWordDocument(answer.text, sevenColumnTable, tableOnly)) {
      const repairRequest = [{ role: "user" as const, content: [
        "Repair the Word document output. Return ONLY valid JSON: " + '{"title":"...","paragraphs":["..."],"columns":[],"rows":[]}',
        "A normal written document may use paragraphs only. Use an empty columns and rows array unless the customer explicitly requested a table. If a table is requested, each row must match its column count.",
        sevenColumnTable ? "The customer explicitly requires exactly seven table columns." : "",
        tableOnly ? "The customer requires a blank table only, with exactly eight empty body rows and no paragraphs." : "",
        "Preserve all details and constraints. Do not invent unrelated sections or data.",
        "Original request: " + latestCustomerRequest,
        "Invalid previous output: " + answer.text.slice(0, 14000)
      ].filter(Boolean).join("\n") }];
      try { answer = await callProviderWithRetry(usedProvider as "gemini" | "openrouter", repairRequest, userMemory); }
      catch (error) { console.warn("[Word document repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      if (!parseWordDocument(answer.text, sevenColumnTable, tableOnly)) {
        res.status(502).json({ error: "لم يتم اعتماد مستند Word لأن مراجعته البنيوية فشلت. لم يتم خصم وحدات. أعد المحاولة لاحقًا." });
        return;
      }
    }
    if (excelRequest && !parseExcelWorkbook(answer.text)) {
      const repairRequest = [{ role: "user" as const, content: [
        "Repair the Excel workbook. Return ONLY valid JSON: " + '{"title":"...","columns":["..."],"rows":[["..."]]}',
        "Use relevant columns and rows of equal width. Preserve the original request and never add unrelated sample data.",
        "Original request: " + latestCustomerRequest,
        "Invalid previous output: " + answer.text.slice(0, 14000)
      ].join("\n") }];
      try { answer = await callProviderWithRetry(usedProvider as "gemini" | "openrouter", repairRequest, userMemory); }
      catch (error) { console.warn("[Excel workbook repair failed]", error instanceof Error ? error.message : "Unknown error"); }
      if (!parseExcelWorkbook(answer.text)) {
        res.status(502).json({ error: "لم يتم اعتماد ملف Excel لأن مراجعته البنيوية فشلت. لم يتم خصم وحدات." });
        return;
      }
    }
    if (desktopAppRequest && !parseHtmlApp(answer.text)) {
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
      const spreadsheet = parseExcelWorkbook(answer.text);
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
      const document = parseWordDocument(answer.text, sevenColumnTable, tableOnly);
      if (!document) {
        res.status(502).json({ error: "تعذر تكوين مستند Word منظم. أعد إرسال الطلب مرة واحدة." });
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
