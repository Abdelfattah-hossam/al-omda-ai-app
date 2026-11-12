import { Router, type IRouter } from "express";
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
  steps: Array<{ id: string; text: string; output?: string; complete?: string; state: "pending" | "approved" | "rejected" }>;
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
  return left.id === right.id && left.text === right.text && left.state === right.state;
}

function isAllowedTaskTransition(previous: DbTask, next: TaskWrite): boolean {
  if (previous.status === "approved" || previous.status === "stopped") return false;
  if (
    previous.title !== next.title ||
    previous.request !== next.request ||
    previous.specialty !== next.specialty
  ) return false;
  if (previous.steps.length !== next.steps.length) return false;
  if (previous.steps.some((step, index) => step.id !== next.steps[index]?.id)) return false;

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
    return next.status === "review" && previous.status === "review";
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
  if (
    plan.status !== "review" ||
    plan.steps.length === 0 ||
    plan.steps.some((step) => step.state !== "pending") ||
    new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length
  ) {
    res.status(400).json({ error: "New plans must start with every step awaiting your review." });
    return;
  }
  try {
    const response = await supabaseFetch(
      "/rest/v1/tasks?select=id,title,request,specialty,steps,status,created_at",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: session.user.id,
          title: plan.title,
          request: plan.request,
          specialty: plan.specialty,
          steps: plan.steps,
          status: "review",
        }),
      },
      session.accessToken,
    );
    const rows = await readSupabaseJson<DbTask[]>(response);
    if (!rows[0]) {
      res.status(502).json({ error: "Supabase did not return the saved task." });
      return;
    }
    res.status(201).json(CreateTaskResponse.parse(mapTask(rows[0])));
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
