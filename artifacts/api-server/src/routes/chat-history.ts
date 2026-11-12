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

export default router;
