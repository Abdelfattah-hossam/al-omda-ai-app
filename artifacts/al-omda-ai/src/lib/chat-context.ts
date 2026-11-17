export type BoundedChatMessage = { role: "user" | "assistant"; content: string };

/** Keep the tail of a UTF-16 string without starting on a low surrogate. */
export function truncateTextFromStartAtCodePointBoundary(value: string, maxChars: number): string {
  const text = String(value ?? "");
  const limit = Math.max(0, Math.floor(maxChars));
  if (text.length <= limit) return text;
  let start = text.length - limit;
  const first = text.charCodeAt(start);
  const previous = text.charCodeAt(start - 1);
  if (first >= 0xdc00 && first <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) start += 1;
  return text.slice(start);
}

/** Keep the newest useful context while respecting per-message and aggregate API limits. */
export function buildBoundedChatContext(
  messages: readonly BoundedChatMessage[],
  options: { maxMessages?: number; maxMessageChars?: number; maxTotalChars?: number } = {},
): BoundedChatMessage[] {
  const maxMessages = Math.max(1, Math.floor(options.maxMessages ?? 12));
  const maxMessageChars = Math.max(1, Math.floor(options.maxMessageChars ?? 8000));
  const maxTotalChars = Math.max(1, Math.floor(options.maxTotalChars ?? 30000));
  const selected: BoundedChatMessage[] = [];
  let remaining = maxTotalChars;
  for (let index = messages.length - 1; index >= 0 && selected.length < maxMessages && remaining > 0; index -= 1) {
    const message = messages[index];
    const rawContent = String(message.content ?? "");
    const content = truncateTextFromStartAtCodePointBoundary(rawContent, Math.min(maxMessageChars, remaining));
    if (!content.trim()) {
      // Keep the newest message even when it contains only an image attachment.
      // The caller attaches image data to the final bounded message, so dropping
      // this entry would either lose the image or associate it with an older turn.
      if (index === messages.length - 1) {
        selected.unshift({ role: message.role, content });
        continue;
      }
      // If the aggregate budget cuts a useful older message down to whitespace,
      // stop here instead of reaching farther back and admitting a misleading
      // one-character fragment from an even older turn.
      if (rawContent.trim()) break;
      continue;
    }
    selected.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  return selected;
}

/** Truncate UTF-16 text without leaving an unmatched high surrogate at the boundary. */
export function truncateTextAtCodePointBoundary(value: string, maxChars: number): string {
  const text = String(value ?? "");
  const limit = Math.max(0, Math.floor(maxChars));
  if (text.length <= limit) return text;
  let end = limit;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/** Truncate to a visible character budget without splitting emoji or adding an ellipsis when no space remains. */
export function truncateTextWithEllipsis(value: string, maxChars: number): string {
  const text = String(value ?? "").trimEnd();
  const limit = Math.max(0, Math.floor(maxChars));
  if (limit === 0) return "";
  if (text.length <= limit) return text;
  return truncateTextAtCodePointBoundary(text, limit - 1).trimEnd() + "…";
}

export type SyncableChatMessage = {
  role: "user" | "assistant";
  content: string;
  documentData?: unknown;
  spreadsheetData?: unknown;
  presentationData?: unknown;
  sourceData?: unknown;
  appData?: unknown;
  taskId?: string;
  taskTitle?: string;
  agentPending?: unknown;
  toolExecutionStatus?: string;
  toolFailures?: Array<{ callId?: string; tool?: string; message?: string }>;
};

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableJsonValue(record[key])]));
  }
  return value;
}

/** Compare persisted message content and deliverables while ignoring transient provider state and per-device blob URLs. */
export function getChatMessageSyncSignature(messages: readonly SyncableChatMessage[]): string {
  return JSON.stringify(messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.documentData ? { documentData: stableJsonValue(message.documentData) } : {}),
    ...(message.spreadsheetData ? { spreadsheetData: stableJsonValue(message.spreadsheetData) } : {}),
    ...(message.presentationData ? { presentationData: stableJsonValue(message.presentationData) } : {}),
    ...(message.sourceData ? { sourceData: stableJsonValue(message.sourceData) } : {}),
    ...(message.appData ? { appData: stableJsonValue(message.appData) } : {}),
    ...(message.taskId ? { taskId: message.taskId } : {}),
    ...(message.taskTitle ? { taskTitle: message.taskTitle } : {}),
    ...(message.agentPending ? { agentPending: stableJsonValue(message.agentPending) } : {}),
    ...(message.toolExecutionStatus ? { toolExecutionStatus: message.toolExecutionStatus } : {}),
    ...(message.toolFailures ? { toolFailures: stableJsonValue(message.toolFailures) } : {}),
  })));
}


/** Reserve a readable portion of the character budget for the actual assistant reply. */
export function combineReplyAndPlan(reply: string, plan: string, maxChars = 7800): string {
  const limit = Math.max(0, Math.floor(maxChars));
  if (limit === 0) return "";
  const replyText = String(reply ?? "").trimEnd();
  const planText = String(plan ?? "").trimEnd();
  const minimumReplyBudget = replyText ? Math.min(limit, Math.max(1, Math.floor(limit * 0.25))) : 0;
  const planBudget = Math.min(planText.length, Math.max(0, limit - minimumReplyBudget));
  const visiblePlan = truncateTextWithEllipsis(planText, planBudget);
  const visibleReply = truncateTextWithEllipsis(replyText, Math.max(0, limit - visiblePlan.length));
  return visibleReply + visiblePlan;
}


/** Only fetch large persisted message payloads when the server revision changes. */
export function hasConversationUpdatedAtChanged(remoteUpdatedAt: string, lastSyncedUpdatedAt: string): boolean {
  if (!remoteUpdatedAt) return lastSyncedUpdatedAt !== "";
  return remoteUpdatedAt !== lastSyncedUpdatedAt;
}

export type ConversationSyncSummary = { id: string; title: string; updated_at?: string | null };

/** Compare only fields that drive the conversation list; avoid serializing large message payloads on every poll. */
export function hasConversationListChanged(
  current: readonly ConversationSyncSummary[],
  remote: readonly ConversationSyncSummary[],
): boolean {
  if (current.length !== remote.length) return true;
  return remote.some((item, index) => {
    const existing = current[index];
    return !existing || existing.id !== item.id || existing.title !== item.title || (existing.updated_at || "") !== (item.updated_at || "");
  });
}
