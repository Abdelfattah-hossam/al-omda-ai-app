import { test } from "node:test";
import { strict as assert } from "node:assert";
import { appendMcpImageObservations, appendMcpToolResult } from "./mcp-content.js";

test("keeps MCP text output in the matching tool response", () => {
  const messages: Array<Record<string, unknown>> = [];
  appendMcpToolResult(messages, { id: "call-1", function: { name: "computer.screenshot" } }, { content: [{ type: "text", text: "Screenshot captured" }] }, []);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "tool");
  assert.equal(messages[0].content, "Screenshot captured");
});

test("converts a bounded MCP screenshot into a model-readable image observation", () => {
  const messages: Array<Record<string, unknown>> = [];
  const images: Array<{ mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string; toolName: string }> = [];
  appendMcpToolResult(messages, { id: "call-2", function: { name: "computer.screenshot" } }, { content: [{ type: "image", mimeType: "image/png", data: "aGVsbG8=" }] }, images);
  assert.equal(messages[0].role, "tool");
  assert.equal(images.length, 1);
  appendMcpImageObservations(messages, images);
  const observation = messages[1] as { role: string; content: Array<any> };
  assert.equal(observation.role, "user");
  assert.equal(observation.content[1].image_url.url, "data:image/png;base64,aGVsbG8=");
});

test("omits oversized and unsupported images without passing base64 to the model", () => {
  const messages: Array<Record<string, unknown>> = [];
  const images: Array<{ mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string; toolName: string }> = [];
  appendMcpToolResult(messages, { id: "call-3" }, { content: [
    { type: "image", mimeType: "image/gif", data: "aGVsbG8=" },
    { type: "image", mimeType: "image/png", data: "x".repeat(600001) },
  ] }, images);
  assert.equal(images.length, 0);
  assert.match(String(messages[0].content), /Image omitted/);
});

test("replaces earlier screenshot payloads before appending a new observation", () => {
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }] }];
  appendMcpImageObservations(messages, [{ mimeType: "image/jpeg", data: "aGVsbG8=", toolName: "screenshot" }]);
  assert.equal(typeof messages[0].content, "string");
  assert.match(String(messages[0].content), /Earlier desktop screenshot omitted/);
  assert.equal(messages.length, 2);
});
