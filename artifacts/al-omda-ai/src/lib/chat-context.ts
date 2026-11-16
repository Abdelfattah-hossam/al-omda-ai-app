export type BoundedChatMessage = { role: "user" | "assistant"; content: string };

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
    const content = rawContent.slice(-Math.min(maxMessageChars, remaining));
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
  const text = String(value ?? "");
  const limit = Math.max(0, Math.floor(maxChars));
  if (limit === 0) return "";
  if (text.length <= limit) return text;
  return truncateTextAtCodePointBoundary(text, limit - 1).trimEnd() + "…";
}

export type SyncableChatMessage = {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  agentPending?: unknown;
  documentData?: unknown;
  spreadsheetData?: unknown;
  presentationData?: unknown;
  sourceData?: unknown;
  appData?: unknown;
  taskId?: string;
  taskTitle?: string;
};

/** Compare persisted message content and deliverables while ignoring per-device blob URLs. */
export function getChatMessageSyncSignature(messages: readonly SyncableChatMessage[]): string {
  return JSON.stringify(messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.agentPending ? { agentPending: message.agentPending } : {}),
    ...(message.documentData ? { documentData: message.documentData } : {}),
    ...(message.spreadsheetData ? { spreadsheetData: message.spreadsheetData } : {}),
    ...(message.presentationData ? { presentationData: message.presentationData } : {}),
    ...(message.sourceData ? { sourceData: message.sourceData } : {}),
    ...(message.appData ? { appData: message.appData } : {}),
    ...(message.taskId ? { taskId: message.taskId } : {}),
    ...(message.taskTitle ? { taskTitle: message.taskTitle } : {}),
  })));
}
