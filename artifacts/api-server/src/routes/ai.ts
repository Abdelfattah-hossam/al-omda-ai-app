import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();
const DAILY_LIMIT = 100;
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

async function refundUnits(accessToken: string, units: number): Promise<void> {
  const response = await supabaseFetch("/rest/v1/rpc/refund_ai_units", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_units: units }),
  }, accessToken);
  await readSupabaseJson<unknown>(response);
}

function getProviders() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
  };
}

function chooseProviders(messages: ChatMessage[]) {
  const last = messages[messages.length - 1]?.content ?? "";
  const coding = /code|coding|debug|typescript|javascript|python|react|node|sql|برمج|كود|بايثون|جافاسكريبت|خطأ|تصحيح/i.test(last);
  const configured = getProviders();
  const order = coding ? ["gemini", "groq", "openrouter"] : ["groq", "gemini", "openrouter"];
  return order.filter((provider) => configured[provider as keyof typeof configured]);
}

async function callGemini(messages: ChatMessage[]): Promise<{ text: string; model: string }> {
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
      systemInstruction: { parts: [{ text: "You are AL OMDA AI, a helpful Arabic and English assistant. Give accurate, practical answers. For code, provide complete, safe examples and explain important assumptions." }] },
      contents,
      generationConfig: { maxOutputTokens: 1400, temperature: 0.4 },
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text, model };
}

async function callCompatible(provider: "groq" | "openrouter", messages: ChatMessage[]): Promise<{ text: string; model: string }> {
  const isGroq = provider === "groq";
  const key = (isGroq ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY)?.trim();
  if (!key) throw new Error(`${provider} is not configured.`);
  // Groq's developer Free plan is rate-limited and does not charge; OpenRouter is pinned to its free-only router.
  const model = isGroq
    ? "openai/gpt-oss-20b"
    : "openrouter/free";
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(isGroq ? {} : { "HTTP-Referer": "https://al-omda-ai-app.abdelfattahhossam1.workers.dev", "X-Title": "AL OMDA AI" }),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are AL OMDA AI, a helpful Arabic and English assistant. Give accurate, practical answers. For code, provide complete, safe examples and explain important assumptions." },
        ...messages,
      ],
      max_tokens: 1400,
      temperature: 0.4,
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`${provider} request failed (${response.status}).`);
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return { text, model: payload?.model || model };
}

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
  let reserved = 0;
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
    const providers = chooseProviders(messages);
    if (providers.length === 0) {
      res.status(503).json({ error: "No free AI provider is connected yet. Configure a free Gemini, Groq, or OpenRouter key on the Worker." });
      return;
    }
    const characters = messages.reduce((total, message) => total + message.content.length, 0);
    const units = Math.min(5, Math.max(1, Math.ceil(characters / 6000)));
    const usage = await reserveUnits(accessToken, units);
    if (!usage.allowed) {
      res.status(429).json({ error: "Your shared daily AI limit is used up. It will reset at the next UTC day.", usage });
      return;
    }
    reserved = units;

    let answer: { text: string; model: string } | null = null;
    let usedProvider = "";
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        answer = provider === "gemini"
          ? await callGemini(messages)
          : await callCompatible(provider as "groq" | "openrouter", messages);
        usedProvider = provider;
        break;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Provider unavailable");
      }
    }
    if (!answer) {
      await refundUnits(accessToken, reserved);
      reserved = 0;
      res.status(503).json({ error: "All configured free AI providers are unavailable. Your daily units were returned.", details: failures.slice(0, 3) });
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
    if (accessToken && reserved > 0) {
      try { await refundUnits(accessToken, reserved); } catch { /* keep the original failure */ }
    }
    reportSupabaseError(req, res, error, "The AI request could not be completed.");
  }
});

export default router;
