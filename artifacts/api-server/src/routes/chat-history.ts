import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();
type SavedWordDocument = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };
type SavedSpreadsheet = { title: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string>; sheets?: Array<{ name: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string> }> };
type SavedPresentation = { title: string; slides: Array<{ title: string; bullets: string[]; notes?: string }> };
type SavedSourceData = { title: string; name: string; language: string; code: string };
type SavedAppData = { title: string; html: string };
type SavedToolFailure = { callId: string; tool: string; message: string };
type SavedPendingCall = { id: string; tool: string; arguments: Record<string, unknown> };
type SavedAgentPending = { sessionId: string; calls: SavedPendingCall[] };
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string; agentPending?: SavedAgentPending; toolExecutionStatus?: "with_warnings" | "no_tool_errors"; toolFailures?: SavedToolFailure[]; documentData?: SavedWordDocument; spreadsheetData?: SavedSpreadsheet; presentationData?: SavedPresentation; sourceData?: SavedSourceData; appData?: SavedAppData; taskId?: string; taskTitle?: string };

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

export function validateMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || !item.content.trim() || item.content.length > 8000) return null;
    total += item.content.length;
    if (total > 200000) return null;
    const saved: ChatMessage = { role: item.role, content: item.content, ...(typeof item.provider === "string" ? { provider: item.provider.slice(0, 80) } : {}) };    if (item.agentPending !== undefined) {
      const pending = item.agentPending;
      if (!pending || typeof pending !== "object" || Array.isArray(pending) ||
        typeof pending.sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(pending.sessionId) ||
        !Array.isArray(pending.calls) || pending.calls.length < 1 || pending.calls.length > 20) return null;
      const calls: SavedPendingCall[] = [];
      for (const call of pending.calls) {
        if (!call || typeof call !== "object" || Array.isArray(call) ||
          typeof call.id !== "string" || !call.id.trim() || call.id.length > 120 ||
          typeof call.tool !== "string" || !call.tool.trim() || call.tool.length > 120 ||
          !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) return null;
        const argumentsText = JSON.stringify(call.arguments);
        if (argumentsText.length > 6000) return null;
        calls.push({ id: call.id, tool: call.tool, arguments: call.arguments as Record<string, unknown> });
      }
      if (JSON.stringify(calls).length > 30000) return null;
      saved.agentPending = { sessionId: pending.sessionId, calls };
    }

    if (item.toolExecutionStatus !== undefined) {
      if (item.toolExecutionStatus !== "with_warnings" && item.toolExecutionStatus !== "no_tool_errors") return null;
      saved.toolExecutionStatus = item.toolExecutionStatus;
    }
    if (item.toolFailures !== undefined) {
      if (!Array.isArray(item.toolFailures) || item.toolFailures.length > 20) return null;
      const failures: SavedToolFailure[] = [];
      for (const failure of item.toolFailures) {
        if (!failure || typeof failure.callId !== "string" || !failure.callId.trim() || failure.callId.length > 120 ||
          typeof failure.tool !== "string" || !failure.tool.trim() || failure.tool.length > 120 ||
          typeof failure.message !== "string" || failure.message.length > 1000) return null;
        failures.push({ callId: failure.callId, tool: failure.tool, message: failure.message });
      }
      if (JSON.stringify(failures).length > 30000) return null;
      saved.toolFailures = failures;
    }
    if (item.taskId !== undefined) {
      if (typeof item.taskId !== "string" || !validConversationId(item.taskId)) return null;
      saved.taskId = item.taskId;
    }
    if (item.taskTitle !== undefined) {
      if (typeof item.taskTitle !== "string" || item.taskTitle.length > 160) return null;
      saved.taskTitle = item.taskTitle;
    }
    if (item.documentData !== undefined) {
      const doc = item.documentData;
      if (!doc || typeof doc !== "object" || typeof doc.title !== "string" || doc.title.length > 180 ||
        !Array.isArray(doc.paragraphs) || doc.paragraphs.length > 12 || doc.paragraphs.some((value: unknown) => typeof value !== "string" || value.length > 8000) ||
        !Array.isArray(doc.columns) || doc.columns.length > 12 || doc.columns.some((value: unknown) => typeof value !== "string" || value.length > 180) ||
        !Array.isArray(doc.rows) || doc.rows.length > 100 || (doc.columns.length === 0 && (doc.rows.length > 0 || doc.paragraphs.length === 0)) ||
        doc.rows.some((row: unknown) => !Array.isArray(row) || row.length !== doc.columns.length || row.some((value: unknown) => typeof value !== "string" || value.length > 2000))) return null;
      if (JSON.stringify(doc).length > 70000) return null;
      saved.documentData = { title: doc.title, paragraphs: doc.paragraphs, columns: doc.columns, rows: doc.rows };
    }
    if (item.presentationData !== undefined) {
      const presentation = item.presentationData;
      if (!presentation || typeof presentation !== "object" || typeof presentation.title !== "string" || presentation.title.length > 180 ||
        !Array.isArray(presentation.slides) || presentation.slides.length < 1 || presentation.slides.length > 30 ||
        presentation.slides.some((slide: unknown) => !slide || typeof slide !== "object" ||
          typeof (slide as any).title !== "string" || (slide as any).title.length > 180 ||
          !Array.isArray((slide as any).bullets) || (slide as any).bullets.length > 12 ||
          (slide as any).bullets.some((bullet: unknown) => typeof bullet !== "string" || bullet.length > 1000) ||
          ((slide as any).notes !== undefined && (typeof (slide as any).notes !== "string" || (slide as any).notes.length > 2000)))) return null;
      if (JSON.stringify(presentation).length > 70000) return null;
      saved.presentationData = presentation;
    }
    if (item.sourceData !== undefined) {
      const source = item.sourceData;
      if (!source || typeof source !== "object" || typeof source.title !== "string" || source.title.length > 180 ||
        typeof source.name !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(source.name) ||
        typeof source.language !== "string" || source.language.length > 40 ||
        typeof source.code !== "string" || source.code.length > 50000 || JSON.stringify(source).length > 55000) return null;
      saved.sourceData = source;
    }
    if (item.appData !== undefined) {
      const app = item.appData;
      if (!app || typeof app !== "object" || typeof app.title !== "string" || app.title.length > 180 ||
        typeof app.html !== "string" || app.html.length > 100000 || JSON.stringify(app).length > 110000) return null;
      saved.appData = { title: app.title, html: app.html };
    }
    if (item.spreadsheetData !== undefined) {
      const sheet = item.spreadsheetData;
      const validRows = (columns: unknown, rows: unknown): columns is string[] => Array.isArray(columns) && columns.length >= 1 && columns.length <= 30 &&
        columns.every((value: unknown) => typeof value === "string" && value.length <= 180) &&
        Array.isArray(rows) && rows.length <= 500 &&
        rows.every((row: unknown) => Array.isArray(row) && row.length === columns.length && row.every((value: unknown) =>
          typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 2000)));
      const validFormulas = (formulas: unknown): formulas is Record<string, string> => formulas === undefined ||
        (Boolean(formulas) && typeof formulas === "object" && !Array.isArray(formulas) &&
          Object.entries(formulas as Record<string, unknown>).length <= 500 &&
          Object.entries(formulas as Record<string, unknown>).every(([cell, formula]) => /^[A-Z]{1,3}[1-9][0-9]{0,5}$/i.test(cell) && typeof formula === "string" && formula.length <= 1000));
      if (!sheet || typeof sheet !== "object" || typeof sheet.title !== "string" || sheet.title.length > 180 ||
        !validRows(sheet.columns, sheet.rows) || !validFormulas(sheet.formulas)) return null;
      const savedSheet: SavedSpreadsheet = { title: sheet.title, columns: sheet.columns, rows: sheet.rows, ...(sheet.formulas ? { formulas: sheet.formulas } : {}) };
      if (sheet.sheets !== undefined) {
        if (!Array.isArray(sheet.sheets) || sheet.sheets.length < 1 || sheet.sheets.length > 12 ||
          sheet.sheets.some((entry: any) => !entry || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 31 ||
            !validRows(entry.columns, entry.rows) || !validFormulas(entry.formulas))) return null;
        savedSheet.sheets = sheet.sheets.map((entry: any) => ({ name: entry.name, columns: entry.columns, rows: entry.rows, ...(entry.formulas ? { formulas: entry.formulas } : {}) }));
      }
      if (JSON.stringify(savedSheet).length > 100000) return null;
      saved.spreadsheetData = savedSheet;
    }
    messages.push(saved);
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
    const conversationId = req.params.id;
    if (typeof conversationId !== "string" || !validConversationId(conversationId)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const messages = validateMessages(req.body?.messages);
    if (!messages) { res.status(400).json({ error: "Conversation messages are invalid or too large." }); return; }
    const requestedTitle = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "";
    const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
    const ownerQuery = new URLSearchParams({ select: "id,title", id: `eq.${conversationId}`, user_id: `eq.${session.user.id}`, limit: "1" });
    const ownerResponse = await supabaseFetch(`/rest/v1/ai_conversations?${ownerQuery.toString()}`, {}, session.accessToken);
    const existingRows = await readSupabaseJson<Array<{ id: string; title: string }>>(ownerResponse);
    if (!existingRows[0]) { res.status(404).json({ error: "Conversation not found." }); return; }
    const existingTitle = typeof existingRows[0].title === "string" ? existingRows[0].title.trim() : "";
    const title = requestedTitle || (existingTitle && existingTitle !== "محادثة جديدة" ? existingTitle : firstUserMessage.slice(0, 72) || existingTitle || "محادثة جديدة");
    const query = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
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

router.patch("/ai/conversations/:id", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to rename this conversation." }); return; }
    const conversationId = req.params.id;
    if (typeof conversationId !== "string" || !validConversationId(conversationId)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "";
    if (!title) { res.status(400).json({ error: "Conversation title is required." }); return; }
    const query = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
    }, session.accessToken);
    const rows = await readSupabaseJson<Array<{ id: string; title: string; updated_at: string }>>(response);
    if (!rows[0]) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json({ updated: true, conversation: rows[0] });
  } catch (error) { reportSupabaseError(req, res, error, "Could not rename this conversation."); }
});

router.delete("/ai/conversations/:id", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) { res.status(401).json({ error: "Sign in to delete this conversation." }); return; }
    const conversationId = req.params.id;
    if (typeof conversationId !== "string" || !validConversationId(conversationId)) { res.status(400).json({ error: "Invalid conversation ID." }); return; }
    const query = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
    const response = await supabaseFetch(`/rest/v1/ai_conversations?${query.toString()}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ deleted: true });
  } catch (error) { reportSupabaseError(req, res, error, "Could not delete this conversation."); }
});

export default router;
