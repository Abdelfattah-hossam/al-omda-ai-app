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

function isCodingRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]?.content ?? "";
  return /code|coding|debug|typescript|javascript|python|react|node|sql|html|css|api|bug|error|stack trace|برمج|كود|بايثون|جافاسكريبت|تايب سكريبت|ريأكت|قاعدة بيانات|تصحيح|خطأ|برنامج|موقع|تطبيق/i.test(last);
}

function systemPrompt(coding: boolean, memory = ""): string {
  const base = "You are AL OMDA AI, a helpful Arabic and English assistant. Match the user's language. Be accurate, practical, honest about uncertainty, and never claim to have executed code or changed external systems unless a tool actually did so.";
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
    const providers = chooseProviders(messages);
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
        answer = provider === "gemini" ? await callGemini(messages, userMemory) : await callOpenRouter(messages, userMemory);
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
    res.json({
      reply: answer.text,
      provider: usedProvider,
      model: answer.model,
      usage: latestUsage,
    });
  } catch (error) {

    reportSupabaseError(req, res, error, "The AI request could not be completed.");
  }
});

export default router;
