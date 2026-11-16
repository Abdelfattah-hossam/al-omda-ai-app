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
    const content = String(message.content ?? "").slice(-Math.min(maxMessageChars, remaining));
    if (!content) continue;
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
