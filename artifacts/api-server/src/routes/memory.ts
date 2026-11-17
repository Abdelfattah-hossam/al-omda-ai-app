import { Router, type IRouter } from "express";
import { parseMemoryEdge, parseMemoryNode, type MemoryEdgeInput, type MemoryNodeInput } from "../lib/memory-graph.js";
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


router.get("/ai/memory/graph", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to access your private knowledge graph." });
      return;
    }
    const nodesQuery = new URLSearchParams({
      select: "id,node_type,label,normalized_label,details,source,confidence,created_at,updated_at",
      user_id: "eq." + session.user.id,
      order: "updated_at.desc",
      limit: "200",
    });
    const edgesQuery = new URLSearchParams({
      select: "id,source_node_id,target_node_id,relation,details,source,confidence,created_at",
      user_id: "eq." + session.user.id,
      order: "created_at.desc",
      limit: "500",
    });
    const nodesResponse = await supabaseFetch("/rest/v1/ai_memory_nodes?" + nodesQuery.toString(), {}, session.accessToken);
    const nodes = await readSupabaseJson<Array<Record<string, unknown>>>(nodesResponse);
    let edges: Array<Record<string, unknown>> = [];
    if (nodes.length > 0) {
      const edgesResponse = await supabaseFetch("/rest/v1/ai_memory_edges?" + edgesQuery.toString(), {}, session.accessToken);
      edges = await readSupabaseJson<Array<Record<string, unknown>>>(edgesResponse);
    }
    res.json({ nodes, edges });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load the private knowledge graph.");
  }
});

router.post("/ai/memory/graph/nodes", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to save private memory nodes." });
      return;
    }
    const input = req.body?.nodes;
    if (!Array.isArray(input) || input.length < 1 || input.length > 25) {
      res.status(400).json({ error: "Send between 1 and 25 memory nodes." });
      return;
    }
    let nodes: MemoryNodeInput[];
    try {
      const parsed = input.map((item: unknown) => ({ ...parseMemoryNode(item, session.user.id), updated_at: new Date().toISOString() }));
      nodes = [...new Map(parsed.map((node) => [node.node_type + ":" + node.normalized_label, node])).values()];
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid memory node." });
      return;
    }
    const response = await supabaseFetch("/rest/v1/ai_memory_nodes?on_conflict=user_id,node_type,normalized_label", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(nodes),
    }, session.accessToken);
    const saved = await readSupabaseJson<Array<Record<string, unknown>>>(response);
    res.status(201).json({ saved: true, nodes: saved });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save private memory nodes.");
  }
});

router.post("/ai/memory/graph/edges", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to save private memory relationships." });
      return;
    }
    const input = req.body?.edges;
    if (!Array.isArray(input) || input.length < 1 || input.length > 50) {
      res.status(400).json({ error: "Send between 1 and 50 memory relationships." });
      return;
    }
    let edges: MemoryEdgeInput[];
    try {
      const parsed = input.map((item: unknown) => parseMemoryEdge(item, session.user.id));
      edges = [...new Map(parsed.map((edge) => [
        [edge.source_node_id, edge.target_node_id, edge.relation].join(":"),
        edge,
      ])).values()];
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid memory relationship." });
      return;
    }
    const response = await supabaseFetch("/rest/v1/ai_memory_edges?on_conflict=user_id,source_node_id,target_node_id,relation", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(edges),
    }, session.accessToken);
    const saved = await readSupabaseJson<Array<Record<string, unknown>>>(response);
    res.status(201).json({ saved: true, edges: saved });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save private memory relationships.");
  }
});

router.delete("/ai/memory/graph", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to clear your private knowledge graph." });
      return;
    }
    const response = await supabaseFetch("/rest/v1/ai_memory_nodes?user_id=eq." + encodeURIComponent(session.user.id), {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ cleared: true });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not clear the private knowledge graph.");
  }
});

export default router;
