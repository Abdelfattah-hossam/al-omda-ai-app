/**
 * Defensive normalization for rows read from Supabase before they are validated
 * by the generated response schemas. Legacy or malformed rows must never take
 * down the whole workspace response: every field is coerced to a value the
 * schema accepts, and only rows whose identity cannot be recovered are dropped.
 */

const SPECIALTIES = ["business", "development", "design", "marketing", "research", "assistant"] as const;
const TASK_STATUSES = ["review", "paused", "approved", "stopped"] as const;
const STEP_STATES = ["pending", "approved", "rejected"] as const;
const COMMENT_AUTHORS = ["user", "assistant", "system"] as const;
const EXECUTION_STATUSES = ["succeeded", "failed"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SanitizedWorkspaceProfile = {
  displayName: string;
  organization: string;
  avatarPath: string | null;
};

export type SanitizedWorkspaceStep = {
  id: string;
  text: string;
  output?: string;
  complete?: string;
  result?: string;
  executedAt?: string;
  executionStatus?: (typeof EXECUTION_STATUSES)[number];
  executionError?: string;
  comments?: Array<{ id: string; author: (typeof COMMENT_AUTHORS)[number]; text: string; createdAt: string }>;
  revisionHistory?: Array<{ result: string; executedAt?: string; revisionRequestedAt: string; note: string }>;
  state: (typeof STEP_STATES)[number];
};

export type SanitizedWorkspaceTask = {
  id: string;
  title: string;
  request: string;
  specialty: (typeof SPECIALTIES)[number];
  steps: SanitizedWorkspaceStep[];
  status: (typeof TASK_STATUSES)[number];
  createdAt: string;
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

/** Normalize any parseable date string to the ISO format the response schema requires. */
function normalizeDateTime(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function sanitizeWorkspaceProfile(raw: unknown): SanitizedWorkspaceProfile {
  const profile = asRecord(raw) ?? {};
  return {
    displayName: text(profile.displayName, 100) ?? "",
    organization: text(profile.organization, 120) ?? "",
    avatarPath: typeof profile.avatarPath === "string" ? profile.avatarPath : null,
  };
}

function sanitizeStep(raw: unknown, index: number): SanitizedWorkspaceStep | null {
  const step = asRecord(raw);
  if (!step) return null;
  const id = (typeof step.id === "string" && step.id.trim() ? step.id.trim() : `step-${index + 1}`).slice(0, 80) || `step-${index + 1}`;
  const rawText = text(step.text, 2000) ?? (step.text == null ? "" : String(step.text));
  const stepText = rawText.trim() ? rawText : "(بدون نص)";
  const sanitized: SanitizedWorkspaceStep = {
    id,
    text: stepText,
    state: pick(step.state, STEP_STATES, "pending"),
  };
  const output = text(step.output, 1200);
  if (output !== undefined) sanitized.output = output;
  const complete = text(step.complete, 1200);
  if (complete !== undefined) sanitized.complete = complete;
  const result = text(step.result, 12000);
  if (result !== undefined) sanitized.result = result;
  const executedAt = normalizeDateTime(step.executedAt);
  if (executedAt) sanitized.executedAt = executedAt;
  if (typeof step.executionStatus === "string" && (EXECUTION_STATUSES as readonly string[]).includes(step.executionStatus)) {
    sanitized.executionStatus = step.executionStatus as (typeof EXECUTION_STATUSES)[number];
  }
  const executionError = text(step.executionError, 500);
  if (executionError !== undefined) sanitized.executionError = executionError;
  if (Array.isArray(step.comments)) {
    const comments = step.comments
      .map((entry, noteIndex) => {
        const note = asRecord(entry);
        if (!note) return null;
        const noteText = text(note.text, 2000);
        if (!noteText || !noteText.trim()) return null;
        return {
          id: (typeof note.id === "string" && note.id.trim() ? note.id.trim() : `comment-${noteIndex + 1}`).slice(0, 80),
          author: pick(note.author, COMMENT_AUTHORS, "system"),
          text: noteText,
          createdAt: normalizeDateTime(note.createdAt) ?? new Date().toISOString(),
        };
      })
      .filter((note): note is NonNullable<typeof note> => note !== null)
      .slice(0, 50);
    sanitized.comments = comments;
  }
  if (Array.isArray(step.revisionHistory)) {
    sanitized.revisionHistory = step.revisionHistory
      .map((entry) => {
        const revision = asRecord(entry);
        if (!revision) return null;
        const sanitizedRevision: NonNullable<SanitizedWorkspaceStep["revisionHistory"]>[number] = {
          result: text(revision.result, 12000) ?? "",
          revisionRequestedAt: normalizeDateTime(revision.revisionRequestedAt) ?? new Date().toISOString(),
          note: text(revision.note, 2000) ?? "",
        };
        const revisedAt = normalizeDateTime(revision.executedAt);
        if (revisedAt) sanitizedRevision.executedAt = revisedAt;
        return sanitizedRevision;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }
  return sanitized;
}

/**
 * Recover a task row into the API response shape. Returns null only when the
 * row has no usable identity, which cannot be repaired safely.
 */
export function sanitizeWorkspaceTask(raw: unknown): SanitizedWorkspaceTask | null {
  const task = asRecord(raw);
  if (!task) return null;
  if (typeof task.id !== "string" || !UUID.test(task.id)) return null;
  const title = text(task.title, 160)?.trim() ? (task.title as string).slice(0, 160) : "(بدون عنوان)";
  const request = text(task.request, 10000)?.trim() ? (task.request as string).slice(0, 10000) : title;
  const steps = Array.isArray(task.steps)
    ? task.steps.map((step, index) => sanitizeStep(step, index)).filter((step): step is NonNullable<typeof step> => step !== null)
    : [];
  return {
    id: task.id,
    title,
    request,
    specialty: pick(task.specialty, SPECIALTIES, "assistant"),
    steps,
    status: pick(task.status, TASK_STATUSES, "review"),
    createdAt: typeof task.createdAt === "string" ? task.createdAt : typeof task.created_at === "string" ? task.created_at : new Date().toISOString(),
  };
}
