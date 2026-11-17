export type AgentHistoryToolCall = {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
};

/** Ensure every tool result has a preceding assistant tool_calls message in persisted model history. */
export function ensureAssistantToolCallMessage(
  messages: Array<Record<string, unknown>>,
  calls: readonly AgentHistoryToolCall[],
): void {
  const recordedIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      if (call && typeof call === "object" && typeof (call as Record<string, unknown>).id === "string") {
        recordedIds.add((call as Record<string, unknown>).id as string);
      }
    }
  }
  const missing = calls.filter((call) => !recordedIds.has(call.id));
  if (!missing.length) return;
  const lastAssistantToolMessage = [...messages].reverse().find((message) =>
    message.role === "assistant" && Array.isArray(message.tool_calls)
  );
  if (lastAssistantToolMessage) {
    lastAssistantToolMessage.tool_calls = [...lastAssistantToolMessage.tool_calls as AgentHistoryToolCall[], ...missing];
  } else {
    messages.push({ role: "assistant", content: "", tool_calls: missing });
  }
}
