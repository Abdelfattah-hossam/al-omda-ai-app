import { Router, type IRouter } from "express";
import { isValidNewTaskPlan } from "../lib/task-plan-validation";
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
  specialty: "business" | "development" | "design" | "marketing" | "research" | "assistant";
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

function sameStep(left: DbTask["steps"][number], right: DbTask["steps"][number]): boolean {
  return left.id === right.id && left.text === right.text && left.output === right.output && left.complete === right.complete && left.state === right.state && left.result === right.result && left.executedAt === right.executedAt && left.executionStatus === right.executionStatus && left.executionError === right.executionError;
}

function isAllowedTaskTransition(previous: DbTask, next: TaskWrite): boolean {
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
    return after.length >= before.length && before.every((note,noteIndex) => JSON.stringify(note) === JSON.stringify(after[noteIndex])) && after.slice(before.length).every(note => note.author === "user" && note.text.trim().length > 0);
  });
  if (!commentsOnly) return false;
  if (previous.steps.some((step, index) => step.result !== next.steps[index]?.result || step.executedAt !== next.steps[index]?.executedAt || step.executionStatus !== next.steps[index]?.executionStatus || step.executionError !== next.steps[index]?.executionError)) return false;

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

router.get("/workspace", async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to load your workspace." });
    return;
  }
  try {
    const profileQuery = new URLSearchParams({
      id: `eq.${session.user.id}`,
      select: "display_name,organization,avatar_path",
      limit: "1",
    });
    const tasksQuery = new URLSearchParams({
      user_id: `eq.${session.user.id}`,
      select: "id,title,request,specialty,steps,status,created_at",
      order: "created_at.desc",
    });
    const [profileResponse, tasksResponse] = await Promise.all([
      supabaseFetch(`/rest/v1/profiles?${profileQuery}`, {}, session.accessToken),
      supabaseFetch(`/rest/v1/tasks?${tasksQuery}`, {}, session.accessToken),
    ]);
    const [profiles, taskRows] = await Promise.all([
      readSupabaseJson<DbProfile[]>(profileResponse),
      readSupabaseJson<DbTask[]>(tasksResponse),
    ]);
    if (!profiles[0]) {
      res.status(503).json({ error: "The profile table is not ready. Run supabase/setup.sql in the Supabase SQL Editor." });
      return;
    }
    res.json(
      GetWorkspaceResponse.parse({
        profile: {
          displayName: profiles[0].display_name,
          organization: profiles[0].organization,
          avatarPath: profiles[0].avatar_path,
        },
        tasks: taskRows.map(mapTask),
      }),
    );
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
          p_daily_limit: 1000, // Reserved DB compatibility argument; the enforced limit is fixed in the function.
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
    res.json(UpdateTaskResponse.parse(mapTask(rows[0])));
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
    res.json(UpdateTaskResponse.parse(mapTask(rows[0])));
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
    res.json({ ok: true, id: params.data.id });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not delete the task.");
  }
});

export default router;
