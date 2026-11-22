/**
 * First write-class tool for Phase 4 (register 8.11 / 8.12 / 8.13): saves an
 * executed project step's result as an editable Markdown file in the task's
 * workspace folder.
 *
 * Gate design (stateless, no new storage):
 *  1. propose: the server derives the exact action (tool, filename, content,
 *     destination) from the step's saved result and returns it with an
 *     Arabic pre-execution disclosure and a SHA-256 hash of the exact input.
 *  2. approve: the client must echo that hash. The server recomputes the
 *     proposal from the CURRENT step result; any difference (the step was
 *     revised after the user looked) is refused, so a decision always binds
 *     to exactly what was disclosed. Nothing is written without it.
 *  3. every decision (approved, rejected, failed) is logged on the step.
 */

import { sanitizeWorkspaceAssetName } from "./storage-assets.js";

export const WRITE_TOOL_NAME = "save_step_result_file";
export const WRITE_TOOL_RISK_CLASS = "write" as const;
export const WRITE_TOOL_MAX_CONTENT_CHARS = 200_000;
export const WRITE_TOOL_MIME = "text/markdown";

export type WriteProposalInput = {
  taskId: string;
  taskTitle: string;
  stepId: string;
  /** 1-based position of the step in the plan. */
  stepNumber: number;
  stepText: string;
  result: string;
};

export type WriteProposal = {
  tool: typeof WRITE_TOOL_NAME;
  riskClass: typeof WRITE_TOOL_RISK_CLASS;
  /** Storage leaf name, ASCII only (Supabase rejects non-ASCII keys). */
  filename: string;
  /** Arabic display name shown in the disclosure. */
  displayName: string;
  mimeType: typeof WRITE_TOOL_MIME;
  content: string;
  bytes: number;
  inputHash: string;
  /** Arabic pre-execution disclosure lines: tool, input, blast radius. */
  disclosure: string[];
};

/** Hex SHA-256 via WebCrypto (works in Node and Workers). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Builds the Markdown body that would be written. Deterministic. */
export function buildStepResultMarkdown(input: WriteProposalInput): string {
  const title = input.taskTitle.replace(/\s+/g, " ").trim().slice(0, 160) || "مشروع";
  const stepLine = input.stepText.replace(/\s+/g, " ").trim().slice(0, 300);
  return "# " + title + "\n\n## المرحلة " + input.stepNumber + ": " + stepLine + "\n\n" + input.result.trim() + "\n";
}

/**
 * Returns the exact proposal for a step, or null when the step has nothing
 * to save (no result) or the content exceeds the tool's size cap.
 */
export async function buildWriteProposal(input: WriteProposalInput): Promise<WriteProposal | null> {
  if (typeof input.result !== "string" || !input.result.trim()) return null;
  const content = buildStepResultMarkdown(input);
  if (content.length > WRITE_TOOL_MAX_CONTENT_CHARS) return null;
  const filename = sanitizeWorkspaceAssetName("stage-" + input.stepNumber + "-result.md");
  const displayName = "نتيجة-المرحلة-" + input.stepNumber + ".md";
  const bytes = utf8Bytes(content);
  const inputHash = await sha256Hex(
    [WRITE_TOOL_NAME, input.taskId, input.stepId, filename, content].join("\u0000"),
  );
  const sizeKb = Math.max(0.1, Math.round((bytes / 1024) * 10) / 10);
  return {
    tool: WRITE_TOOL_NAME,
    riskClass: WRITE_TOOL_RISK_CLASS,
    filename,
    displayName,
    mimeType: WRITE_TOOL_MIME,
    content,
    bytes,
    inputHash,
    disclosure: [
      "الأداة: " + WRITE_TOOL_NAME + " (فئة الخطر: كتابة)",
      "المدخل: نتيجة المرحلة " + input.stepNumber + " المحفوظة حاليًا، بصيغة Markdown (" + sizeKb + " KB).",
      "الأثر: ينشئ ملفًا جديدًا باسم " + displayName + " داخل مجلد هذا المشروع في أصولك فقط.",
      "لا يعدّل ولا يحذف أي ملف موجود، ولا يرسل شيئًا خارج حسابك، ويمكنك حذف الملف لاحقًا من الأصول.",
    ],
  };
}

export type WriteDecisionLog = {
  decision: "approved" | "rejected" | "failed";
  inputHash: string;
  detail?: string;
};

/** Arabic timeline note for a gated decision (register 8.13). */
export function writeDecisionNote(proposalName: string, log: WriteDecisionLog): string {
  const shortHash = log.inputHash.slice(0, 12);
  if (log.decision === "approved") {
    return "تقرير الأداة " + WRITE_TOOL_NAME + ": اعتمد المستخدم الكتابة وتم حفظ الملف " + proposalName + (log.detail ? " (" + log.detail + ")" : "") + " [" + shortHash + "].";
  }
  if (log.decision === "rejected") {
    return "تقرير الأداة " + WRITE_TOOL_NAME + ": رفض المستخدم حفظ الملف " + proposalName + " ولم يُكتب أي شيء [" + shortHash + "].";
  }
  return "تقرير الأداة " + WRITE_TOOL_NAME + ": اعتمد المستخدم لكن تعذر حفظ الملف " + proposalName + (log.detail ? " (" + log.detail + ")" : "") + " [" + shortHash + "].";
}

/** True when this exact input was already approved and written (idempotency). */
export function hasApprovedWrite(comments: Array<{ author: string; text: string }> | undefined, inputHash: string): boolean {
  const marker = "[" + inputHash.slice(0, 12) + "]";
  return (comments ?? []).some((note) => note.author === "system" && note.text.includes(WRITE_TOOL_NAME) && note.text.includes("اعتمد المستخدم الكتابة") && note.text.includes(marker));
}
