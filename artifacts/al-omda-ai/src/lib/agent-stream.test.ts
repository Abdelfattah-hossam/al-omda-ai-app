import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readAgentEventStream } from "./agent-stream.js";

function eventStream(chunks: string[], status = 200): Response {
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) { controller.close(); return; }
      controller.enqueue(new TextEncoder().encode(chunks[index++]));
    },
  }), { status, headers: { "content-type": "text/event-stream" } });
}

test("reads split token events and the final completion", async () => {
  const seen: string[] = [];
  const response = eventStream([
    'data: {"type":"token","text":"Hel',
    'lo"}\n\ndata: {"type":"status","status":"thinking"}\n\n',
    'data: {"type":"complete","result":{"status":"completed","message":"Hello"}}\n\n',
  ]);
  const result = await readAgentEventStream(response, (event) => {
    if (event.type === "token") seen.push(event.text || "");
  });
  assert.deepEqual(seen, ["Hello"]);
  assert.deepEqual(result, { status: "completed", message: "Hello" });
});

test("accepts CRLF events and a final event without a trailing delimiter", async () => {
  const response = eventStream([
    'data: {"type":"status","status":"working"}\r\n\r\n',
    'data: {"type":"complete","result":{"status":"completed"}}',
  ]);
  const result = await readAgentEventStream(response);
  assert.deepEqual(result, { status: "completed" });
});

test("surfaces a server-provided error event", async () => {
  const response = eventStream(['data: {"type":"error","error":"Model disconnected"}\n\n']);
  await assert.rejects(() => readAgentEventStream(response), /Model disconnected/);
});

test("rejects malformed event payloads", async () => {
  const response = eventStream(["data: not-json\n\n"]);
  await assert.rejects(() => readAgentEventStream(response), /malformed stream event/);
});

test("rejects a stream that closes without a completion result", async () => {
  const response = eventStream(['data: {"type":"token","text":"partial"}\n\n']);
  await assert.rejects(() => readAgentEventStream(response), /ended before returning a completion/);
});

test("uses the API error message for non-success responses", async () => {
  const response = new Response(JSON.stringify({ error: "Unauthorized runtime token" }), {
    status: 401, headers: { "content-type": "application/json" },
  });
  await assert.rejects(() => readAgentEventStream(response), /Unauthorized runtime token/);
});
