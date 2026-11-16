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
