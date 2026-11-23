import { Router, type IRouter } from "express";
import {WORKSPACE_PAGE_SIZE,workspaceOffset} from "../lib/workspace-pages.js";
import { isValidNewTaskPlan } from "../lib/task-plan-validation.js";
import { hasCompletedPriorProjectStages } from "../lib/project-stage-sequence.js";
import { isRevisionHistoryUnchanged } from "../lib/task-history.js";
import { getWorkspaceAssetMimeType, MAX_WORKSPACE_ASSET_BYTES, sanitizeWorkspaceAssetName, WORKSPACE_ASSET_BUCKET } from "../lib/storage-assets.js";
import { sanitizeWorkspaceProfile, sanitizeWorkspaceTask } from "../lib/workspace-sanitize.js";
import {
  UpdateProfileResponse,
  UpdateProfileBody,
  CreateTaskBody,
  CreateTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  GetWorkspaceResponse,
} from "@workspace/api-zod";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
  type SupabaseSession,
} from "../lib/supabase";

type DbProfile = {
  display_name: string;
  organization: string;
  avatar_path: string | null;
};

type DbTask = {
  id: string;
  title: string;
  request: string;
  specialty: "business" | "development" | "design" | "marketing" | "research" | "assistant" | "content" | "social" | "education" | "finance";
  steps: Array<{ id: string; text: string; output?: string; complete?: string; result?: string; executedAt?: string; executionStatus?: "succeeded" | "failed"; executionError?: string; comments?: Array<{id:string;author:"user"|"assistant"|"system";text:string;createdAt:string}>; revisionHistory?: Array<{result:string;executedAt?:string;revisionRequestedAt:string;note:string}>; state: "pending" | "approved" | "rejected" }>;
  status: "review" | "paused" | "approved" | "stopped";
  created_at: string;
};

type TaskWrite = {
  title: string;
  request: string;
  specialty: DbTask["specialty"];
  steps: DbTask["steps"];
  status: DbTask["status"];
};

const router: IRouter = Router();

async function currentSession(
  req: Parameters<typeof resolveSession>[0],
  res: Parameters<typeof resolveSession>[1],
): Promise<SupabaseSession | null> {
  if (
    !process.env.SUPABASE_URL?.trim() ||
    !(process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim())
  ) return null;
  return resolveSession(req, res);
}

async function sessionOrReport(
  req: Parameters<typeof resolveSession>[0],
  res: Parameters<typeof resolveSession>[1],
): Promise<SupabaseSession | null | false> {
  try {
    return await currentSession(req, res);
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not check your session.");
    return false;
  }
}

async function getTaskById(id: string, session: SupabaseSession): Promise<DbTask | null> {
  const query = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${session.user.id}`,
    select: "id,title,request,specialty,steps,status,created_at",
    limit: "1",
  });
  const response = await supabaseFetch(`/rest/v1/tasks?${query}`, {}, session.accessToken);
  const rows = await readSupabaseJson<DbTask[]>(response);
  return rows[0] ?? null;
}

function mapTask(row: DbTask) {
  return {
    id: row.id,
    title: row.title,
    request: row.request,
    specialty: row.specialty,
    steps: row.steps,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Compare two datetimes by instant: Postgres serializes timestamptz inside JSONB as
 * "2026-11-22T07:11:17.722+00:00" while the workspace GET response normalizes the same
 * value to "2026-11-22T07:11:17.722Z". A client echoing the normalized value must not
 * count as a modification of the step. Unparseable values compare verbatim. */
function absent<T>(value: T | null | undefined): value is null | undefined {
  return value === null || value === undefined;
}

function sameInstant(left: string | null | undefined, right: string | null | undefined): boolean {
  if (left === right) return true;
  // Postgres JSONB round-trips missing values as null; clients omit them.
  if (absent(left) && absent(right)) return true;
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false;
  return leftTime === rightTime;
}

function sameStep(left: DbTask["steps"][number], right: DbTask["steps"][number]): boolean {
  return left.id === right.id && left.text === right.text && left.output === right.output && left.complete === right.complete && left.state === right.state && (left.result ?? undefined) === (right.result ?? undefined) && sameInstant(left.executedAt, right.executedAt) && (left.executionStatus ?? undefined) === (right.executionStatus ?? undefined) && (left.executionError ?? undefined) === (right.executionError ?? undefined);
}

export function isAllowedTaskTransition(previous: DbTask, next: TaskWrite): boolean {
  if (
    previous.title !== next.title ||
    previous.request !== next.request ||
    previous.specialty !== next.specialty
  ) return false;
  if (previous.steps.length !== next.steps.length) return false;
  if (previous.steps.some((step, index) => step.id !== next.steps[index]?.id)) return false;
  const commentsOnly = previous.steps.every((step,index) => {
    const before = step.comments ?? [];
    const after = next.steps[index].comments ?? [];
    return after.length >= before.length &&
      before.every((note,noteIndex) => {
        const candidate = after[noteIndex];
        return !!candidate && note.id === candidate.id && note.author === candidate.author && note.text === candidate.text && sameInstant(note.createdAt, candidate.createdAt);
      }) &&
      after.slice(before.length).every(note => note.author === "user" && note.text.trim().length > 0) &&
      isRevisionHistoryUnchanged(step.revisionHistory, next.steps[index].revisionHistory);
  });
  if (!commentsOnly) return false;
  if (previous.steps.some((step, index) => (step.result ?? undefined) !== (next.steps[index]?.result ?? undefined) || !sameInstant(step.executedAt, next.steps[index]?.executedAt) || (step.executionStatus ?? undefined) !== (next.steps[index]?.executionStatus ?? undefined) || (step.executionError ?? undefined) !== (next.steps[index]?.executionError ?? undefined))) return false;

  const changedIndices = previous.steps
    .map((step, index) => (sameStep(step, next.steps[index]) ? -1 : index))
    .filter((index) => index >= 0);

  if (previous.status === "paused") {
    return (
      changedIndices.length === 0 &&
      ["paused", "review", "stopped"].includes(next.status)
    );
  }

  if (next.status === "paused" || next.status === "stopped") {
    return changedIndices.length === 0;
  }
  if (changedIndices.length > 1) return false;
  if (changedIndices.length === 0) {
    const onlyCommentsAdded = previous.steps.some((step,index) => (next.steps[index].comments?.length ?? 0) > (step.comments?.length ?? 0));
    return onlyCommentsAdded ? next.status === previous.status : next.status === "review" && previous.status === "review";
  }

  const firstOpen = previous.steps.findIndex((step) => step.state !== "approved");
  const changedIndex = changedIndices[0];
  if (firstOpen < 0 || changedIndex !== firstOpen) return false;

  if (!hasCompletedPriorProjectStages(previous.steps, changedIndex)) return false;

  const oldStep = previous.steps[changedIndex];
  const newStep = next.steps[changedIndex];
  if (oldStep.state === "approved") return false;
  if (oldStep.state === "pending" && !["pending", "approved", "rejected"].includes(newStep.state)) {
    return false;
  }
  if (oldStep.state === "rejected" && !["pending", "approved", "rejected"].includes(newStep.state)) {
    return false;
  }

  const allApproved = next.steps.every((step) => step.state === "approved");
  if (allApproved) {
    return next.status === "approved" && newStep.state === "approved";
  }
  return next.status === "review";
}

// Account-scoped O(1) revision probe; RLS is enforced by the caller's JWT.
router.get("/workspace/revision", async (req,res):Promise<void>=>{
 const session=await sessionOrReport(req,res);if(session===false)return;if(!session){res.status(401).json({error:"Sign in required."});return;}
 res.setHeader("Cache-Control","private, no-store");
 try{
  const response=await supabaseFetch('/rest/v1/rpc/get_workspace_revision',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},session.accessToken);
  const revision=await readSupabaseJson<unknown>(response);
  if(typeof revision!=='string')throw new Error('Invalid workspace revision');
  res.json({revision});
 }catch(error){reportSupabaseError(req,res,error,"Could not check workspace changes.");}
});

router.get("/workspace", async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to load your workspace." });
    return;
  }
  const offset=workspaceOffset(req.query.offset);
  if(offset===null){res.status(400).json({error:"Invalid workspace offset."});return;}
  res.setHeader("Cache-Control","private, no-store");
  try {
    const profileQuery = new URLSearchParams({
      id: `eq.${session.user.id}`,
      select: "display_name,organization,avatar_path",
      limit: "1",
    });
    const tasksQuery = new URLSearchParams({
      user_id: `eq.${session.user.id}`,
      select: "id,title,request,specialty,steps,status,created_at",
      order: "created_at.desc,id.desc",
      limit: String(WORKSPACE_PAGE_SIZE+1),
      offset: String(offset),
    });
    const [profileResponse, tasksResponse] = await Promise.all([
      supabaseFetch(`/rest/v1/profiles?${profileQuery}`, {}, session.accessToken),
      supabaseFetch(`/rest/v1/tasks?${tasksQuery}`, {}, session.accessToken),
    ]);
    const [profiles, taskRows] = await Promise.all([
      readSupabaseJson<DbProfile[]>(profileResponse),
      readSupabaseJson<unknown[]>(tasksResponse),
    ]);
    if (!profiles[0]) {
      res.status(503).json({ error: "The profile table is not ready. Run supabase/setup.sql in the Supabase SQL Editor." });
      return;
    }
    // Legacy or malformed task rows must not take down the whole workspace:
    // sanitize every row, drop only the ones that still fail validation.
    const profile = sanitizeWorkspaceProfile({
      displayName: profiles[0].display_name,
      organization: profiles[0].organization,
      avatarPath: profiles[0].avatar_path,
    });
    const nextOffset=taskRows.length>WORKSPACE_PAGE_SIZE?offset+WORKSPACE_PAGE_SIZE:null;
    const sendWorkspace=(value:unknown)=>res.json({...value as object,nextOffset});
    const tasks = taskRows.slice(0,WORKSPACE_PAGE_SIZE)
      .map((row, index) => {
        const task = sanitizeWorkspaceTask(row);
        if (!task) console.warn("[Workspace] Dropping unreadable task row while loading the workspace.", { index });
        return task;
      })
      .filter((task): task is NonNullable<typeof task> => task !== null);
    const parsed = GetWorkspaceResponse.safeParse({ profile, tasks });
    if (parsed.success) {
      sendWorkspace(parsed.data);
      return;
    }
    const taskSchema = GetWorkspaceResponse.shape.tasks.element;
    const kept = tasks.filter((task) => {
      const result = taskSchema.safeParse(task);
      if (!result.success) {
        console.warn("[Workspace] Dropping task that still failed response validation after sanitization.", {
          id: task.id,
          issues: result.error.issues.slice(0, 3),
        });
      }
      return result.success;
    });
    const reparsed = GetWorkspaceResponse.safeParse({ profile, tasks: kept });
    if (reparsed.success) {
      sendWorkspace(reparsed.data);
      return;
    }
    console.error("[Workspace] Response validation failed after sanitization; returning the profile without tasks.", parsed.error.issues.slice(0, 5));
    sendWorkspace(GetWorkspaceResponse.parse({ profile, tasks: [] }));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load your workspace.");
  }
});

router.put("/profile", requireSameOrigin, async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to update your profile." });
    return;
  }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Profile fields are invalid." });
    return;
  }
  try {
    const query = new URLSearchParams({
      id: `eq.${session.user.id}`,
      select: "display_name,organization,avatar_path",
    });
    const response = await supabaseFetch(
      `/rest/v1/profiles?${query}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          display_name: parsed.data.displayName,
          organization: parsed.data.organization,
        }),
      },
      session.accessToken,
    );
    const rows = await readSupabaseJson<DbProfile[]>(response);
    if (!rows[0]) {
      res.status(404).json({ error: "Profile not found. Run supabase/setup.sql and sign in again." });
      return;
    }
    res.json(
      UpdateProfileResponse.parse({
        displayName: rows[0].display_name,
        organization: rows[0].organization,
        avatarPath: rows[0].avatar_path,
      }),
    );
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save your profile.");
  }
});

router.post("/tasks", requireSameOrigin, async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to save a task." });
    return;
  }
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Task plan is invalid." });
    return;
  }
  const plan = parsed.data;
  if (!isValidNewTaskPlan(plan)) {
    res.status(400).json({ error: "Invalid new plan: provide 3–8 pending steps, each with non-empty text, output, and completion criteria of at most 1,200 characters." });
    return;
  }
  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/create_ai_task_with_quota",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          p_title: plan.title,
          p_request: plan.request,
          p_specialty: plan.specialty,
          p_steps: plan.steps,
          p_daily_limit: 1000,
        }),
      },
      session.accessToken,
    );
    const completion = await readSupabaseJson<{
      saved: boolean;
      allowed?: boolean;
      task?: DbTask;
      used?: number;
      remaining?: number;
      limit?: number;
      resetAt?: string;
    }>(response);
    if (!completion.saved) {
      if (completion.allowed === false) {
        res.status(429).json({
          error: "Your shared daily AI limit is used up. It will reset at the next UTC day.",
          usage: completion,
        });
        return;
      }
      res.status(502).json({ error: "Supabase did not save the project task. No AI units were charged." });
      return;
    }
    if (!completion.task) {
      res.status(502).json({ error: "Supabase did not return the saved task." });
      return;
    }
    res.status(201).json({
      ...CreateTaskResponse.parse(mapTask(completion.task)),
      usage: {
        used: completion.used ?? 0,
        remaining: completion.remaining ?? 0,
        limit: completion.limit ?? 1000,
        resetAt: completion.resetAt ?? "",
      },
    });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not save the task.");
  }
});

router.post("/tasks/artifact", requireSameOrigin, async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) { res.status(401).json({ error: "Sign in to save a chat artifact in Task History." }); return; }

  // The recorded filename is display-only (the storage copy gets its own
  // ASCII-safe key at upload), so keep the user's original characters and strip
  // only control bytes and path segments.
  const filename = (typeof req.body?.filename === "string" ? req.body.filename : "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.trim()
    .slice(0, 120) ?? "";
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim().toLowerCase() : "";
  const size = Number(req.body?.size);
  const title = (typeof req.body?.title === "string" ? req.body.title : filename.replace(/\.[^.]+$/, "")).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160);
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  const specialty = req.body?.specialty;
  const language = req.body?.language === "en" ? "en" : "ar";
  const allowedSpecialties = ["business", "development", "design", "marketing", "research", "assistant", "content", "social", "education", "finance"];

  if (!filename || getWorkspaceAssetMimeType(filename) !== mimeType ||
      !Number.isSafeInteger(size) || size < 1 || size > MAX_WORKSPACE_ASSET_BYTES ||
      !title || title.length > 160 || !request || request.length > 10000 ||
      !allowedSpecialties.includes(specialty)) {
    res.status(400).json({ error: "Generated artifact metadata is invalid." });
    return;
  }

  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/create_ai_artifact_task",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          p_title: title,
          p_request: request,
          p_specialty: specialty,
          p_filename: filename,
          p_mime_type: mimeType,
          p_file_size: size,
          p_language: language,
        }),
      },
      session.accessToken,
    );
    const task = await readSupabaseJson<DbTask>(response);
    res.status(201).json(mapTask(task));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not add the generated file to Task History.");
  }
});

router.put("/tasks/:id", requireSameOrigin, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Task ID is invalid." });
    return;
  }
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to update a task." });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Task update is invalid." });
    return;
  }
  try {
    const previous = await getTaskById(params.data.id, session);
    if (!previous) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    if (!isAllowedTaskTransition(previous, parsed.data)) {
      res.status(409).json({
        error: "Only the next unapproved step can change. Review and approve steps one at a time.",
      });
      return;
    }
    const query = new URLSearchParams({
      id: `eq.${params.data.id}`,
      select: "id,title,request,specialty,steps,status,created_at",
    });
    const response = await supabaseFetch(
      `/rest/v1/tasks?${query}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          title: parsed.data.title,
          request: parsed.data.request,
          specialty: parsed.data.specialty,
          steps: parsed.data.steps,
          status: parsed.data.status,
        }),
      },
      session.accessToken,
    );
    const rows = await readSupabaseJson<DbTask[]>(response);
    if (!rows[0]) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    const savedTask = sanitizeWorkspaceTask(rows[0]);
    if (!savedTask) {
      res.status(500).json({ error: "The saved task could not be read back. Refresh the project." });
      return;
    }
    res.json(UpdateTaskResponse.parse(savedTask));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not update the task.");
  }
});



router.post("/tasks/:id/revise-step", requireSameOrigin, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Task ID is invalid." }); return; }
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) { res.status(401).json({ error: "Sign in to request a revision." }); return; }
  const stepId = typeof req.body?.stepId === "string" ? req.body.stepId : "";
  const noteText = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(stepId) || !noteText) { res.status(400).json({ error: "A step and a revision note are required." }); return; }
  try {
    const previous = await getTaskById(params.data.id, session);
    if (!previous) { res.status(404).json({ error: "Task not found." }); return; }
    if (previous.status === "paused" || previous.status === "stopped") { res.status(409).json({ error: "Resume the task before requesting a revision." }); return; }
    const index = previous.steps.findIndex((step) => step.id === stepId);
    if (index < 0 || !previous.steps[index].result || previous.steps[index].state !== "approved") { res.status(409).json({ error: "Only a completed step can be revised." }); return; }
    const now = new Date().toISOString();
    const updatedSteps = previous.steps.map((step, stepIndex) => {
      if (stepIndex < index) return step;
      if (stepIndex === index) return {
        ...step, state: "pending" as const,
        revisionHistory: [...(step.revisionHistory ?? []), { result: step.result!, ...(step.executedAt ? { executedAt: step.executedAt } : {}), revisionRequestedAt: now, note: noteText }].slice(-20),
        comments: [...(step.comments ?? []), { id: crypto.randomUUID(), author: "user" as const, text: "طلب مراجعة وإعادة تنفيذ: " + noteText, createdAt: now }].slice(-50),
        result: undefined, executedAt: undefined, executionStatus: undefined, executionError: undefined,
      };
      return {
        ...step, state: "pending" as const,
        ...(step.result ? { revisionHistory: [...(step.revisionHistory ?? []), { result: step.result, ...(step.executedAt ? { executedAt: step.executedAt } : {}), revisionRequestedAt: now, note: "أُبطلت هذه النسخة لأن مرحلة سابقة تغيرت؛ يلزم إعادة التنفيذ والفحص." }].slice(-20) } : {}),
        comments: [...(step.comments ?? []), { id: crypto.randomUUID(), author: "system" as const, text: "أُعيدت هذه المرحلة إلى الانتظار لأن مخرج مرحلة سابقة تغيّر، ويلزم تنفيذها وفحصها مجددًا.", createdAt: now }].slice(-50),
        result: undefined, executedAt: undefined, executionStatus: undefined, executionError: undefined,
      };
    });
    const query = new URLSearchParams({ id: "eq." + params.data.id, user_id: "eq." + session.user.id, select: "id,title,request,specialty,steps,status,created_at" });
    const response = await supabaseFetch("/rest/v1/tasks?" + query.toString(), { method: "PATCH", headers: { "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify({ steps: updatedSteps, status: "review" }) }, session.accessToken);
    const rows = await readSupabaseJson<DbTask[]>(response);
    if (!rows[0]) { res.status(409).json({ error: "The task changed while the revision was being saved. Refresh and try again." }); return; }
    const revisedTask = sanitizeWorkspaceTask(rows[0]);
    if (!revisedTask) { res.status(500).json({ error: "The saved task could not be read back. Refresh the project." }); return; }
    res.json(UpdateTaskResponse.parse(revisedTask));
  } catch (error) { reportSupabaseError(req, res, error, "Could not request a task revision."); }
});

router.delete("/tasks/:id", requireSameOrigin, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Task ID is invalid." });
    return;
  }
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to delete a task." });
    return;
  }
  try {
    const query = new URLSearchParams({
      id: `eq.${params.data.id}`,
      user_id: `eq.${session.user.id}`,
    });
    const response = await supabaseFetch(`/rest/v1/tasks?${query}`, {
      method: "DELETE",
      headers: { prefer: "return=representation" },
    }, session.accessToken);
    const deleted = await readSupabaseJson<DbTask[]>(response);
    if (!deleted.length) {
      res.status(404).json({ error: "Task not found or you do not have permission to delete it." });
      return;
    }
    // Cascade: remove the project's stored files so deleting a project does not
    // leave orphaned objects that the Assets UI can no longer reach. Cleanup
    // failures never fail the completed task deletion; they are reported instead.
    let assetsRemoved = 0;
    let assetsFailed = 0;
    try {
      const prefix = `${session.user.id}/${params.data.id}/`;
      const listResponse = await supabaseFetch(`/storage/v1/object/list/${WORKSPACE_ASSET_BUCKET}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefix, limit: 200, offset: 0 }),
      }, session.accessToken);
      const objects = await readSupabaseJson<Array<{ name?: string }>>(listResponse);
      for (const object of objects) {
        if (typeof object.name !== "string" || !object.name) continue;
        // No content-type on a bodyless DELETE: Supabase Storage rejects it.
        const objectPath = (prefix + object.name).split("/").map((part) => encodeURIComponent(part)).join("/");
        const deleteResponse = await supabaseFetch(`/storage/v1/object/${WORKSPACE_ASSET_BUCKET}/${objectPath}`, { method: "DELETE" }, session.accessToken);
        await deleteResponse.arrayBuffer().catch(() => null);
        if (deleteResponse.ok) assetsRemoved += 1;
        else assetsFailed += 1;
      }
    } catch (cleanupError) {
      assetsFailed += 1;
      console.warn("[Task asset cleanup failed]", params.data.id, cleanupError instanceof Error ? cleanupError.message : "Unknown error");
    }
    res.json({ ok: true, id: params.data.id, assetsRemoved, ...(assetsFailed ? { assetsFailed } : {}) });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not delete the task.");
  }
});

export default router;
