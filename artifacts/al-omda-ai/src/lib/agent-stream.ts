export type AgentStreamEvent = {
  type: "token" | "status" | "complete" | "error";
  text?: string;
  provider?: string;
  status?: string;
  turn?: number;
  tools?: string[];
  role?: string;
  agentCount?: number;
  result?: Record<string, unknown>;
  error?: string;
};

export async function readAgentEventStream(
  response: Response,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "Local Agent stream request failed.");
  }
  if (!response.body) throw new Error("Local Agent did not return a readable event stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Record<string, unknown> | null = null;
  let streamError = "";

  const consume = (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    let event: AgentStreamEvent;
    try { event = JSON.parse(data) as AgentStreamEvent; }
    catch { throw new Error("Local Agent returned a malformed stream event."); }
    onEvent?.(event);
    if (event.type === "complete" && event.result && typeof event.result === "object") result = event.result;
    if (event.type === "error") streamError = event.error || "Local Agent stream failed.";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("Local Agent stream ended before returning a completion result.");
  return result;
}
