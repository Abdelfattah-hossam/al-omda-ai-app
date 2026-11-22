import { Router, type IRouter } from "express";
import { readSupabaseJson, reportSupabaseError, requireSameOrigin, resolveSession, supabaseFetch } from "../lib/supabase";
import { WORKSPACE_ASSET_BUCKET } from "../lib/storage-assets.js";
import { buildWriteProposal, hasApprovedWrite, writeDecisionNote, WRITE_TOOL_NAME, type WriteProposal } from "../lib/write-tools.js";

/**
 * Gated write-tier tool actions (register 8.11/8.12/8.13). A write is only
 * performed by /approve, bound to the exact input hash the user was shown.
 */
const router: IRouter = Router();

type Note = { id: string; author: "user" | "assistant" | "system"; text: string; createdAt: string };
type StepRow = { id: string; text: string; result?: string; state: string; comments?: Note[] };
type TaskRow = { id: string; title: string; status: string; steps: StepRow[] };

async function loadStepContext(req: Parameters<typeof resolveSession>[0], res: Parameters<typeof resolveSession>[1]) {
  const session = await resolveSession(req, res);
  if (!session) { res.status(401).json({ error: "Sign in to use project tools." }); return null; }
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
  const stepId = typeof req.body?.stepId === "string" ? req.body.stepId : "";
  if (!/^[0-9a-f-]{36}$/i.test(taskId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(stepId)) {
    res.status(400).json({ error: "A valid task and step are required." }); return null;
  }
  const query = new URLSearchParams({ id: "eq." + taskId, user_id: "eq." + session.user.id, select: "id,title,status,steps", limit: "1" });
  const response = await supabaseFetch("/rest/v1/tasks?" + query.toString(), {}, session.accessToken);
  const rows = await readSupabaseJson<TaskRow[]>(response);
  const task = rows[0];
  if (!task) { res.status(404).json({ error: "Project not found in your account." }); return null; }
  const stepIndex = task.steps.findIndex((item) => item.id === stepId);
  if (stepIndex < 0) { res.status(404).json({ error: "Project step not found." }); return null; }
  const step = task.steps[stepIndex];
  if (step.state !== "approved" || !step.result) {
    res.status(409).json({ error: "Only an approved step with a saved result can be saved as a file." }); return null;
  }
  const proposal = await buildWriteProposal({ taskId, taskTitle: task.title, stepId, stepNumber: stepIndex + 1, stepText: step.text, result: step.result });
  if (!proposal) { res.status(422).json({ error: "This step result cannot be saved as a file (empty or too large)." }); return null; }
  return { session, task, step, taskId, stepId, proposal, query };
}

async function appendNote(
  ctx: { session: { accessToken: string; user: { id: string } }; taskId: string; stepId: string; query: URLSearchParams },
  text: string,
): Promise<void> {
  try {
    const latestResponse = await supabaseFetch("/rest/v1/tasks?" + ctx.query.toString(), {}, ctx.session.accessToken);
    const latest = (await readSupabaseJson<TaskRow[]>(latestResponse))[0];
    if (!latest) return;
    const steps = latest.steps.map((item) => item.id === ctx.stepId
      ? { ...item, comments: [...(item.comments ?? []), { id: crypto.randomUUID(), author: "system" as const, text: text.slice(0, 450), createdAt: new Date().toISOString() }].slice(-50) }
      : item);
    const patchQuery = new URLSearchParams({ id: "eq." + ctx.taskId, user_id: "eq." + ctx.session.user.id });
    await supabaseFetch("/rest/v1/tasks?" + patchQuery.toString(), {
      method: "PATCH",
      headers: { "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ steps }),
    }, ctx.session.accessToken);
  } catch (error) {
    console.warn("[tool action log could not be saved]", error instanceof Error ? error.message : "Unknown error");
  }
}

function publicProposal(proposal: WriteProposal) {
  return {
    tool: proposal.tool,
    riskClass: proposal.riskClass,
    displayName: proposal.displayName,
    bytes: proposal.bytes,
    inputHash: proposal.inputHash,
    disclosure: proposal.disclosure,
  };
}

/** Step 1: show exactly what would be written. No side effects. */
router.post("/ai/tool-actions/save-step-file/propose", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const ctx = await loadStepContext(req, res);
    if (!ctx) return;
    res.json({ proposal: publicProposal(ctx.proposal), alreadySaved: hasApprovedWrite(ctx.step.comments, ctx.proposal.inputHash) });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not prepare the file action.");
  }
});

/** Step 2: record the user's decision; only "approve" with a matching hash writes. */
router.post("/ai/tool-actions/save-step-file/decide", requireSameOrigin, async (req, res): Promise<void> => {
  try {
    const decision = req.body?.decision === "approve" ? "approve" : req.body?.decision === "reject" ? "reject" : "";
    const inputHash = typeof req.body?.inputHash === "string" ? req.body.inputHash : "";
    if (!decision || !/^[0-9a-f]{64}$/.test(inputHash)) {
      res.status(400).json({ error: "A decision and the input hash you were shown are required." }); return;
    }
    const ctx = await loadStepContext(req, res);
    if (!ctx) return;
    if (ctx.proposal.inputHash !== inputHash) {
      res.status(409).json({ error: "The step changed after you reviewed this action. Review it again before approving." }); return;
    }
    if (decision === "reject") {
      await appendNote(ctx, writeDecisionNote(ctx.proposal.displayName, { decision: "rejected", inputHash }));
      res.json({ decision: "rejected", written: false }); return;
    }
    if (hasApprovedWrite(ctx.step.comments, inputHash)) {
      res.status(409).json({ error: "This exact file was already saved for this step." }); return;
    }
    const path = `${ctx.session.user.id}/${ctx.taskId}/${crypto.randomUUID()}-${ctx.proposal.filename}`;
    const objectPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
    try {
      const uploaded = await supabaseFetch(`/storage/v1/object/${WORKSPACE_ASSET_BUCKET}/${objectPath}`, {
        method: "POST",
        headers: { "content-type": ctx.proposal.mimeType, "x-upsert": "false" },
        body: Buffer.from(ctx.proposal.content, "utf-8"),
      }, ctx.session.accessToken);
      await readSupabaseJson<unknown>(uploaded);
    } catch (error) {
      await appendNote(ctx, writeDecisionNote(ctx.proposal.displayName, { decision: "failed", inputHash, detail: error instanceof Error ? error.message.slice(0, 120) : "upload failed" }));
      reportSupabaseError(req, res, error, "Could not save the file.");
      return;
    }
    await appendNote(ctx, writeDecisionNote(ctx.proposal.displayName, { decision: "approved", inputHash, detail: (ctx.proposal.bytes / 1024).toFixed(1) + " KB" }));
    res.status(201).json({ decision: "approved", written: true, tool: WRITE_TOOL_NAME, path, name: ctx.proposal.displayName, mimeType: ctx.proposal.mimeType, size: ctx.proposal.bytes });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not complete the file action.");
  }
});

export default router;
