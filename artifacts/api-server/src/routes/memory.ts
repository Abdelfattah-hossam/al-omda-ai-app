import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();

router.get("/ai/memory", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to access your private AI memory." });
      return;
    }
    const query = new URLSearchParams({ select: "memory_text,updated_at", limit: "1" });
    const response = await supabaseFetch("/rest/v1/ai_user_memory?" + query.toString(), {}, session.accessToken);
    const rows = await readSupabaseJson<Array<{ memory_text?: string; updated_at?: string }>>(response);
    res.json({ memory: rows[0]?.memory_text ?? "", updatedAt: rows[0]?.updated_at ?? null });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load private AI memory.");
  }
});

router.put("/ai/memory", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to save your private AI memory." });
      return;
    }
    const memory = req.body?.memory;
    if (typeof memory !== "string" || memory.length > 6000) {
      res.status(400).json({ error: "Memory must be text no longer than 6,000 characters." });
      return;
    }
    const response = await supabaseFetch("/rest/v1/ai_user_memory?on_conflict=user_id", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: session.user.id, memory_text: memory.trim(), updated_at: new Date().toISOString() }),
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ saved: true, characters: memory.trim().length });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save private AI memory.");
  }
});

router.delete("/ai/memory", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to clear your private AI memory." });
      return;
    }
    const response = await supabaseFetch("/rest/v1/ai_user_memory?user_id=eq." + encodeURIComponent(session.user.id), {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ cleared: true });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not clear private AI memory.");
  }
});

export default router;
