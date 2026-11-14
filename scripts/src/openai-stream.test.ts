import { test } from "node:test";
import { strict as assert } from "node:assert";
import { consumeOpenAIChatStream } from "./openai-stream.js";

function streamResponse(events: unknown[]): Response {
  const body = events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({
    start(controller) {
      const bytes = new TextEncoder().encode(body);
      controller.enqueue(bytes.slice(0, Math.floor(bytes.length / 2)));
      controller.enqueue(bytes.slice(Math.floor(bytes.length / 2)));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("streams assistant text incrementally and collects usage", async () => {
  const tokens: string[] = [];
  const result = await consumeOpenAIChatStream(streamResponse([
    { choices: [{ delta: { role: "assistant", content: "Hello " } }] },
    { choices: [{ delta: { content: "world" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } },
  ]), (token) => tokens.push(token));
  assert.deepEqual(tokens, ["Hello ", "world"]);
  assert.equal(result.message.content, "Hello world");
  assert.equal((result.usage as any)?.completion_tokens, 3);
  assert.ok(result.generationDurationMs >= 1);
  assert.ok(typeof result.tokensPerSecond === "number");
  assert.ok(result.tokensPerSecond! > 0);
});

test("reassembles streamed function tool calls", async () => {
  const result = await consumeOpenAIChatStream(streamResponse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_", type: "function", function: { name: "files.", arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "abc", function: { name: "write", arguments: '"a.txt","content":"ok"}' } }] }, finish_reason: "tool_calls" }] },
  ]));
  const calls = result.message.tool_calls as any[];
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "call_abc");
  assert.equal(calls[0].function.name, "files.write");
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { path: "a.txt", content: "ok" });
});

test("rejects malformed stream events", async () => {
  const response = new Response("data: not-json\n\n", { status: 200 });
  await assert.rejects(() => consumeOpenAIChatStream(response), /malformed streaming event/);
});

test("accepts CRLF-delimited server-sent events", async () => {
  const response = new Response('data: {"choices":[{"delta":{"content":"CRLF works"}}]}\r\n\r\ndata: [DONE]\r\n\r\n', { status: 200 });
  const result = await consumeOpenAIChatStream(response);
  assert.equal(result.message.content, "CRLF works");
});

test("rejects streams with no event data", async () => {
  const response = new Response(": keep-alive\n\n", { status: 200 });
  await assert.rejects(() => consumeOpenAIChatStream(response), /no streaming events/);
});

test("does not invent throughput when the provider omits completion token usage", async () => {
  const result = await consumeOpenAIChatStream(streamResponse([
    { choices: [{ delta: { content: "No usage metadata" }, finish_reason: "stop" }] },
  ]));
  assert.equal(result.tokensPerSecond, null);
  assert.ok(result.generationDurationMs >= 1);
});
