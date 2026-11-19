import { Router, type IRouter } from "express";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  requireSameOriginRead,
  resolveSession,
  supabaseFetch,
  type SupabaseSession,
} from "../lib/supabase";

type RecordKind = "contact" | "event" | "ticket";
type DbRecord = {
  id: string;
  kind: RecordKind;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  due_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const router: IRouter = Router();
const allowedKinds = new Set<RecordKind>(["contact", "event", "ticket"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;
type AuditCursor = { createdAt: string; id: string };
type AuditRow = { id: string; action: "created" | "updated" | "deleted"; record_kind: "contact" | "event" | "ticket"; record_id: string; created_at: string };

export function parseAuditCursor(createdAt: unknown, id: unknown): AuditCursor | null | undefined {
  if (createdAt === undefined && id === undefined) return null;
  if (typeof createdAt !== "string" || typeof id !== "string" || !uuidPattern.test(id)) return undefined;
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return undefined;
  return { createdAt: date.toISOString(), id };
}

export function buildAuditPage<T extends { id: string; created_at: string }>(rows: T[], pageSize = PAGE_SIZE) {
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    rows: pageRows,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export function parsePageOffset(rawOffset: unknown): number | null {
  if (rawOffset === undefined) return 0;
  if (typeof rawOffset !== "string" || rawOffset.length === 0 || rawOffset.length > 12) return null;
  if (![...rawOffset].every(char => char >= "0" && char <= "9")) return null;
  const offset = Number(rawOffset);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000 ? offset : null;
}

async function getSession(req: Parameters<typeof resolveSession>[0], res: Parameters<typeof resolveSession>[1]): Promise<SupabaseSession | null | false> {
  try {
    if (!process.env.SUPABASE_URL?.trim() || !(process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim())) {
      res.status(503).json({ error: "Collaboration storage is not configured." });
      return false;
    }
    const session = await resolveSession(req, res);
    if (!session) res.status(401).json({ error: "Sign in to use this workspace." });
    return session;
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not verify your session.");
    return false;
  }
}

export function validPayload(body: unknown, kind: RecordKind): { title: string; description: string; status: DbRecord["status"]; due_at: string | null; metadata: Record<string, unknown> } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (value.status !== undefined && value.status !== "open" && value.status !== "in_progress" && value.status !== "resolved") return null;
  const status = (value.status ?? "open") as DbRecord["status"];
  const dueAt = typeof value.dueAt === "string" && value.dueAt.trim() ? value.dueAt.trim() : null;
  const parsedDueAt = dueAt ? new Date(dueAt) : null;
  const metadata = value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata) ? value.metadata as Record<string, unknown> : {};
  if (!title || title.length > 160 || description.length > 4000 || JSON.stringify(metadata).length > 7000) return null;
  if (dueAt && (!parsedDueAt || !Number.isFinite(parsedDueAt.getTime()))) return null;
  if (kind === "contact") {
    for (const key of ["email", "phone", "company"]) {
      const item = metadata[key];
      if (item !== undefined && (typeof item !== "string" || item.length > 200)) return null;
    }
  }
  if (kind === "event" && !dueAt) return null;
  if (kind === "ticket" && !["open", "in_progress", "resolved"].includes(String(value.status ?? "open"))) return null;
  return { title, description, status, due_at: parsedDueAt ? parsedDueAt.toISOString() : null, metadata };
}

function mapRecord(row: DbRecord) {
  return { id: row.id, kind: row.kind, title: row.title, description: row.description, status: row.status, dueAt: row.due_at ? new Date(row.due_at).toISOString() : null, metadata: row.metadata ?? {}, createdAt: row.created_at, updatedAt: row.updated_at };
}

router.get("/collaboration/audit", requireSameOriginRead, async (req, res): Promise<void> => {
  const session = await getSession(req, res);
  if (!session) return;
  try {
    const cursor = parseAuditCursor(req.query.beforeCreatedAt, req.query.beforeId);
    if (cursor === undefined) { res.status(400).json({ error: "Audit cursor is invalid." }); return; }
    const query = new URLSearchParams({
      select: "id,action,record_kind,record_id,created_at",
      user_id: "eq." + session.user.id,
      order: "created_at.desc,id.desc",
      limit: String(PAGE_SIZE + 1),
    });
    if (cursor) {
      query.set("or", "(created_at.lt." + cursor.createdAt + ",and(created_at.eq." + cursor.createdAt + ",id.lt." + cursor.id + "))");
    }
    const response = await supabaseFetch("/rest/v1/collaboration_audit_events?" + query.toString(), {}, session.accessToken);
    const rows = await readSupabaseJson<AuditRow[]>(response);
    const page = buildAuditPage(rows);
    res.json({ events: page.rows, nextCursor: page.nextCursor });
  } catch (error) { reportSupabaseError(req, res, error, "Could not load audit events."); }
});

router.get("/collaboration/:kind", requireSameOriginRead, async (req, res): Promise<void> => {
  const kind = req.params.kind as RecordKind;
  if (!allowedKinds.has(kind)) { res.status(404).json({ error: "Workspace type not found." }); return; }
  const session = await getSession(req, res);
  if (!session) return;
  try {
    const offset = parsePageOffset(req.query.offset);
    if (offset === null) { res.status(400).json({ error: "Pagination offset is invalid." }); return; }
    const pageSize = PAGE_SIZE;
    // Fetch one extra row to determine whether another page exists.
    const query = new URLSearchParams({ select: "id,kind,title,description,status,due_at,metadata,created_at,updated_at", user_id: "eq." + session.user.id, kind: "eq." + kind, order: "created_at.desc", limit: String(pageSize + 1), offset: String(offset) });
    const response = await supabaseFetch("/rest/v1/collaboration_records?" + query.toString(), {}, session.accessToken);
    const rows = await readSupabaseJson<DbRecord[]>(response);
    const hasMore = rows.length > pageSize;
    res.json({ records: (hasMore ? rows.slice(0, pageSize) : rows).map(mapRecord), nextOffset: hasMore ? offset + pageSize : null });
  } catch (error) { reportSupabaseError(req, res, error, "Could not load collaboration records."); }
});

router.post("/collaboration/:kind", requireSameOrigin, async (req, res): Promise<void> => {
  const kind = req.params.kind as RecordKind;
  if (!allowedKinds.has(kind)) { res.status(404).json({ error: "Workspace type not found." }); return; }
  const session = await getSession(req, res);
  if (!session) return;
  const payload = validPayload(req.body, kind);
  if (!payload) { res.status(400).json({ error: "Record details are invalid. Check the title, date, and fields." }); return; }
  try {
    const response = await supabaseFetch("/rest/v1/collaboration_records?select=id,kind,title,description,status,due_at,metadata,created_at,updated_at", {
      method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...payload, kind, user_id: session.user.id }),
    }, session.accessToken);
    const rows = await readSupabaseJson<DbRecord[]>(response);
    if (!rows[0]) { res.status(502).json({ error: "The record was not saved." }); return; }
    res.status(201).json({ record: mapRecord(rows[0]) });
  } catch (error) { reportSupabaseError(req, res, error, "Could not save the record."); }
});

router.patch("/collaboration/:kind/:id", requireSameOrigin, async (req, res): Promise<void> => {
  const kind = req.params.kind as RecordKind;
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId;
  if (!allowedKinds.has(kind) || !uuidPattern.test(id)) { res.status(400).json({ error: "Record reference is invalid." }); return; }
  const session = await getSession(req, res);
  if (!session) return;
  const payload = validPayload(req.body, kind);
  if (!payload) { res.status(400).json({ error: "Record details are invalid." }); return; }
  try {
    const query = new URLSearchParams({ id: "eq." + id, user_id: "eq." + session.user.id, kind: "eq." + kind, select: "id,kind,title,description,status,due_at,metadata,created_at,updated_at" });
    const response = await supabaseFetch("/rest/v1/collaboration_records?" + query.toString(), {
      method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    }, session.accessToken);
    const rows = await readSupabaseJson<DbRecord[]>(response);
    if (!rows[0]) { res.status(404).json({ error: "Record not found." }); return; }
    res.json({ record: mapRecord(rows[0]) });
  } catch (error) { reportSupabaseError(req, res, error, "Could not update the record."); }
});

router.delete("/collaboration/:kind/:id", requireSameOrigin, async (req, res): Promise<void> => {
  const kind = req.params.kind as RecordKind;
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId;
  if (!allowedKinds.has(kind) || !uuidPattern.test(id)) { res.status(400).json({ error: "Record reference is invalid." }); return; }
  const session = await getSession(req, res);
  if (!session) return;
  try {
    const query = new URLSearchParams({ id: "eq." + id, user_id: "eq." + session.user.id, kind: "eq." + kind, select: "id" });
    const response = await supabaseFetch("/rest/v1/collaboration_records?" + query.toString(), {
      method: "DELETE", headers: { Prefer: "return=representation" },
    }, session.accessToken);
    const rows = await readSupabaseJson<Array<{id:string}>>(response);
    if (!rows[0]) { res.status(404).json({ error: "Record not found." }); return; }
    res.json({ deleted: true, id });
  } catch (error) { reportSupabaseError(req, res, error, "Could not delete the record."); }
});

export default router;
