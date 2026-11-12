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


function isWordDocumentRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /\b(word|docx|\.docx)\b|ملف\s*(?:وورد|word)|مستند\s*(?:وورد|word)|انشئ.{0,35}(?:ملف|جدول)|أنشئ.{0,35}(?:ملف|جدول)|اعمل.{0,35}(?:ملف|جدول)|جدول.{0,45}(?:وورد|word|خانات|أعمدة)|(?:وورد|word).{0,45}جدول/i.test(last);
}
function isSevenColumnTableRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /7\s*(?:خانات|أعمدة|اعمدة|columns)|سبع\s*(?:خانات|أعمدة|اعمدة)|جدول.{0,35}7|7.{0,25}جدول/i.test(last);
}
function parseWordDocument(text: string, forceSevenColumns: boolean): { title: string; paragraphs: string[]; columns: string[]; rows: string[][] } | null {
  try {
    let source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1));
    if (!value || typeof value.title !== "string" || !Array.isArray(value.columns) || !Array.isArray(value.rows) || !Array.isArray(value.paragraphs ?? [])) return null;
    let columns = value.columns.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim()).slice(0, 12);
    if (forceSevenColumns && columns.length !== 7) return null;
    if (!columns.length || columns.length > 12) return null;
    const rows = value.rows.filter((row: unknown) => Array.isArray(row)).slice(0, 100).map((row: unknown[]) => columns.map((_: string, index: number) => String(row[index] ?? "").slice(0, 1000)));
    if (!rows.length) return null;
    return { title: value.title.trim().slice(0, 180), paragraphs: (value.paragraphs ?? []).filter((item: unknown) => typeof item === "string").map((item: string) => item.slice(0, 3000)).slice(0, 12), columns, rows };
  } catch { return null; }
}

function isCodingRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /code|coding|debug|typescript|javascript|python|react|node|sql|html|css|api|bug|error|stack trace|برمج|كود|بايثون|جافاسكريبت|تايب سكريبت|ريأكت|قاعدة بيانات|تصحيح|خطأ|برنامج|موقع|تطبيق/i.test(last);
}

function systemPrompt(coding: boolean, memory = ""): string {
  const base = "You are AL OMDA AI (العمدة), the AI assistant itself. The name AL OMDA always refers to YOU, the assistant, never to a separate human, colleague, or team. Match the user's language. Be accurate, practical, honest about uncertainty, and never claim to have executed code or changed external systems unless a tool actually did so. When the user delegates a project, YOU (AL OMDA AI) are the intended executor: analyze the request, create the deliverables or code using available tools, make revisions, and report what was actually completed. The user is the project owner who sets goals, gives direction, and reviews or approves important decisions. Never say the user should execute the delegated work themselves. If you lack a required tool, explain the specific limitation and provide the closest useful work you can actually complete.";
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
    headers: { authorization: "Bearer " + key, "content-type": "application/json", "HTTP-Referer": "https://al-omda-ai-app.abdelfattahhossam1.workers.dev", "X-Title": "AL OMDA AI" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt(isCodingRequest(messages), memory) }, ...messages], max_tokens: isCodingRequest(messages) ? 3000 : 1400, temperature: 0.4 }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error("OpenRouter request failed (" + response.status + ")" + (providerErrorMessage(payload) ? ": " + providerErrorMessage(payload) : "."));
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned an empty response.");
  return { text, model: payload?.model || model };
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
    const usage = await reserveUnits(session.accessToken, 1);
    if (!usage.allowed) { res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage }); return; }
    const memory = await loadUserMemory(session.accessToken, session.user.id);
    const failures: string[] = [];
    let answer: { text: string; model: string } | null = null;
    let provider = "";
    for (const candidate of providers) {
      try { answer = candidate === "gemini" ? await callGemini(messages, memory) : await callOpenRouter(messages, memory); provider = candidate; break; }
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
    res.json({ title: parsed.title.trim().slice(0, 120), steps: parsed.steps.map((step: any) => ({ text: step.text.trim(), output: step.output.trim(), complete: step.complete.trim() })), provider, model: answer.model, usage: await currentUsage(session.accessToken) });
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
    const prompt = [
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
        answer = candidate === "gemini" ? await callGemini(messages, memory) : await callOpenRouter(messages, memory);
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
    const result = answer.text.trim().slice(0, 12000);
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
    res.json({ taskId, stepId, result, executedAt, provider, model: answer.model, usage: await currentUsage(session.accessToken) });
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
    const userMemory = await loadUserMemory(accessToken, session.user.id);
    console.info("[AI memory context]", { loaded: Boolean(userMemory.trim()), characters: userMemory.length });
    const wordDocumentRequest = isWordDocumentRequest(messages);
    const sevenColumnTable = wordDocumentRequest && isSevenColumnTableRequest(messages);
    const modelMessages: ChatMessage[] = wordDocumentRequest ? [
      ...messages,
      { role: "user", content: [
        "SPECIAL OUTPUT MODE: Create a real Microsoft Word document deliverable. Do not answer with source code, instructions, or a Markdown table.",
        "Return ONLY valid JSON with this exact schema: " + '{"title":"Document title","paragraphs":["optional intro or notes"],"columns":["column 1","column 2"],"rows":[["cell 1","cell 2"]]}',
        sevenColumnTable ? "The user requested a seven-field table. The columns array MUST contain exactly 7 meaningful column headings, and every row MUST contain exactly 7 cell values. Do not ask a clarifying question; infer sensible headings and sample/content rows from the user's request." : "Choose the number of columns and rows that best fulfill the user's request. Include meaningful, complete content, not placeholder rows.",
        "Keep the document in the user's language. For Arabic, write natural Arabic headings and content, suitable for right-to-left Word layout.",
        "Include enough useful rows to make the requested document usable. Do not put code in cells unless the user explicitly requested a code table.",
        "Original user request: " + messages[messages.length - 1].content
      ].join("\\n") }
    ] : messages;
    const providers = chooseProviders(modelMessages);
    if (providers.length === 0) {
      res.status(503).json({ error: "No free AI provider is connected yet. Configure a free Gemini or OpenRouter key on the Worker." });
      return;
    }
    const units = Math.min(5, Math.max(1, Math.ceil(characters / 6000)));
    const usage = await reserveUnits(accessToken, units);
    if (!usage.allowed) {
      res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage });
      return;
    }

    let answer: { text: string; model: string } | null = null;
    let usedProvider = "";
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        answer = provider === "gemini" ? await callGemini(modelMessages, userMemory) : await callOpenRouter(modelMessages, userMemory);
        usedProvider = provider;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Provider unavailable";
        failures.push(reason);
        console.warn("[AI provider failure]", provider, reason);
      }
    }
    if (!answer) {
      res.status(503).json({ error: "All configured free AI providers are unavailable. This attempt remains counted in today's allowance.", details: failures.slice(0, 3) });
      return;
    }
    const latestUsage = await currentUsage(accessToken);
    if (wordDocumentRequest) {
      const document = parseWordDocument(answer.text, sevenColumnTable);
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
