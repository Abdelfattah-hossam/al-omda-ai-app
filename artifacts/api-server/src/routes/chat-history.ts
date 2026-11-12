import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string };

router.get("/ai/history", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to load your chat history." });
      return;
    }
    const query = new URLSearchParams({
      select: "messages",
      user_id: `eq.${session.user.id}`,
      limit: "1",
    });
    const response = await supabaseFetch(`/rest/v1/ai_chat_history?${query.toString()}`, {}, session.accessToken);
    const rows = await readSupabaseJson<Array<{ messages: ChatMessage[] }>>(response);
    res.json({ messages: Array.isArray(rows[0]?.messages) ? rows[0].messages : [] });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load chat history.");
  }
});

router.put("/ai/history", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to save your chat history." });
      return;
    }
    const raw = req.body?.messages;
    if (!Array.isArray(raw) || raw.length > 100) {
      res.status(400).json({ error: "Chat history must contain no more than 100 messages." });
      return;
    }
    const messages: ChatMessage[] = [];
    let total = 0;
    for (const item of raw) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || !item.content.trim() || item.content.length > 8000) {
        res.status(400).json({ error: "A chat history message is invalid or too long." });
        return;
      }
      total += item.content.length;
      if (total > 200000) {
        res.status(400).json({ error: "Chat history is too large to save." });
        return;
      }
      messages.push({
        role: item.role,
        content: item.content,
        ...(typeof item.provider === "string" ? { provider: item.provider.slice(0, 80) } : {}),
      });
    }
    const response = await supabaseFetch("/rest/v1/ai_chat_history?on_conflict=user_id", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: session.user.id, messages, updated_at: new Date().toISOString() }),
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ saved: true, count: messages.length });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save chat history.");
  }
});

router.delete("/ai/history", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to clear your chat history." });
      return;
    }
    const query = new URLSearchParams({ user_id: `eq.${session.user.id}` });
    const response = await supabaseFetch(`/rest/v1/ai_chat_history?${query.toString()}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ cleared: true });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not clear chat history.");
  }
});


function validConversationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || !item.content.trim() || item.content.length > 8000) return null;
    total += item.content.length;
    if (total > 200000) return null;
    messages.push({ role: item.role, content: item.content, ...(typeof item.provider === "string" ? { provider: item.provider.slice(0, 80) } : {}) });
  }
  return messages;
}

router.get("/ai/conversations", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to load conversations." }); return; }
    const query = new URLSearchParams({ select: "id,title,created_at,updated_at", user_id: `eq.${session.user.id}`, order: "updated_at.desc", limit: "100" });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, {}, session.accessToken);
    const conversations = await readSupabaseJson<Array<{ id: string; title: string; created_at: string; updated_at: string }>>(response);
    res.json({ conversations });
  } catch (error) { reportSupabaseError(req, res, error, "Could not load conversations."); }
});

router.post("/ai/conversations", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to create a conversation." }); return; }
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "محادثة جديدة";
    const response = await supabaseFetch("/rest/v1/ai_conversations", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: session.user.id, title: title || "محادثة جديدة", messages: [] }),
    }, session.accessToken);
    const rows = await readSupabaseJson<Array<{ id: string; title: string; created_at: string; updated_at: string }>>(response);
    if (!rows[0]?.id) { res.status(502).json({ error: "Conversation was not created." }); return; }
    res.status(201).json({ conversation: rows[0] });
  } catch (error) { reportSupabaseError(req, res, error, "Could not create a conversation."); }
});

router.get("/ai/conversations/:id", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to load this conversation." }); return; }
    if (!validConversationId(req.params.id)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const query = new URLSearchParams({ select: "id,title,messages,created_at,updated_at", id: `eq.${req.params.id}`, user_id: `eq.${session.user.id}`, limit: "1" });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, {}, session.accessToken);
    const rows = await readSupabaseJson<Array<{ id: string; title: string; messages: ChatMessage[]; created_at: string; updated_at: string }>>(response);
    if (!rows[0]) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json({ conversation: rows[0] });
  } catch (error) { reportSupabaseError(req, res, error, "Could not load this conversation."); }
});

router.put("/ai/conversations/:id", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to save this conversation." }); return; }
    if (!validConversationId(req.params.id)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const messages = validateMessages(req.body?.messages);
    if (!messages) { res.status(400).json({ error: "Conversation messages are invalid or too large." }); return; }
    const requestedTitle = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "";
    const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
    const title = requestedTitle || firstUserMessage.slice(0, 72) || "محادثة جديدة";
    const query = new URLSearchParams({ id: `eq.${req.params.id}`, user_id: `eq.${session.user.id}` });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ title, messages, updated_at: new Date().toISOString() }),
    }, session.accessToken);
    const rows = await readSupabaseJson<Array<{ id: string; title: string; updated_at: string }>>(response);
    if (!rows[0]) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json({ saved: true, conversation: rows[0] });
  } catch (error) { reportSupabaseError(req, res, error, "Could not save this conversation."); }
});

router.delete("/ai/conversations/:id", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to delete this conversation." }); return; }
    if (!validConversationId(req.params.id)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const query = new URLSearchParams({ id: `eq.${req.params.id}`, user_id: `eq.${session.user.id}` });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ deleted: true });
  } catch (error) { reportSupabaseError(req, res, error, "Could not delete this conversation."); }
});

export default router;
