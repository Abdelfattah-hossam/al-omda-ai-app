export type StreamedCompletion = {
  message: Record<string, unknown>;
  usage: Record<string, unknown> | null;
  /** Span between the first and last content/tool delta; excludes time-to-first-token and post-stream overhead. */
  generationDurationMs: number;
  /** Completion tokens divided by generationDurationMs; null when usage or a positive interval is unavailable. */
  tokensPerSecond: number | null;
};

export async function consumeOpenAIChatStream(
  response: Response,
  onToken?: (text: string) => void,
): Promise<StreamedCompletion> {
  if (!response.body) throw new Error("Model provider returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: unknown = null;
  let finishReason: unknown;
  let firstGenerationDeltaAt: number | null = null;
  let lastGenerationDeltaAt: number | null = null;
  let seenEvent = false;
  const toolCalls = new Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }>();

  const consumeEvent = (event: string) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    seenEvent = true;
    if (data === "[DONE]") return;
    let chunk: any;
    try { chunk = JSON.parse(data); }
    catch { throw new Error("Model provider returned a malformed streaming event."); }
    if (chunk.usage && typeof chunk.usage === "object") usage = chunk.usage as Record<string, unknown>;
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta && typeof choice.delta === "object" ? choice.delta : {};
    const hasContentDelta = typeof delta.content === "string" && Boolean(delta.content);
    const hasToolDelta = Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0;
    if (hasContentDelta || hasToolDelta) {
      // One timestamp per SSE event keeps callback work from inflating throughput.
      const deltaAt = performance.now();
      if (firstGenerationDeltaAt === null) firstGenerationDeltaAt = deltaAt;
      lastGenerationDeltaAt = deltaAt;
    }
    if (hasContentDelta) {
      content += delta.content;
      onToken?.(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = Number.isInteger(part?.index) ? part.index : 0;
        const current = toolCalls.get(index) || { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (typeof part?.id === "string") current.id += part.id;
        if (part?.type === "function") current.type = "function";
        if (typeof part?.function?.name === "string") current.function.name += part.function.name;
        if (typeof part?.function?.arguments === "string") current.function.arguments += part.function.arguments;
        toolCalls.set(index, current);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary && boundary.index !== undefined) {
      consumeEvent(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
      boundary = /\r?\n\r?\n/.exec(buffer);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  if (!seenEvent) throw new Error("Model provider returned no streaming events.");

  const message: Record<string, unknown> = { role: "assistant", content };
  if (toolCalls.size) message.tool_calls = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call);
  if (finishReason) message.finish_reason = finishReason;
  const generationDurationMs = firstGenerationDeltaAt !== null && lastGenerationDeltaAt !== null ? lastGenerationDeltaAt - firstGenerationDeltaAt : 0;
  const usageRecord = usage && typeof usage === "object" ? usage as Record<string, unknown> : null;
  const completionTokens = typeof usageRecord?.completion_tokens === "number" ? usageRecord.completion_tokens : null;
  const tokensPerSecond = completionTokens !== null && generationDurationMs > 0
    ? Math.round((completionTokens / generationDurationMs) * 1000 * 10) / 10
    : null;
  return { message, usage: usageRecord, generationDurationMs, tokensPerSecond };
}
