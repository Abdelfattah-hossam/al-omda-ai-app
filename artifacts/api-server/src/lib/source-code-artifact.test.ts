import test from "node:test";
import assert from "node:assert/strict";
import { parseSourceCodeFile } from "./source-code-artifact.js";

const fenced = (language: string, code: string) => String.fromCharCode(96).repeat(3) + language + "\n" + code + "\n" + String.fromCharCode(96).repeat(3);

test("accepts a valid JSON source artifact", () => {
  const result = parseSourceCodeFile(fenced("json", '{"ok":true,"count":3}'), "Create settings.json");
  assert.equal(result?.name, "al-omda-source.json");
  assert.equal(result?.language, "json");
});

test("rejects malformed JSON instead of attaching it", () => {
  assert.equal(parseSourceCodeFile(fenced("json", '{"ok": true,'), "Create settings.json"), null);
});

test("rejects a source language that conflicts with the requested extension", () => {
  assert.equal(parseSourceCodeFile(fenced("javascript", "print('hello')"), "Create main.py"), null);
});

test("accepts a complete HTML source file", () => {
  const result = parseSourceCodeFile(fenced("html", "<!doctype html><html><body><h1>Hello</h1></body></html>"), "Create index.html");
  assert.equal(result?.name, "al-omda-source.html");
});

test("rejects HTML output that contains no markup", () => {
  assert.equal(parseSourceCodeFile(fenced("html", "this is not html"), "Create index.html"), null);
});

test("rejects unbalanced CSS blocks", () => {
  assert.equal(parseSourceCodeFile(fenced("css", "body { color: red;"), "Create style.css"), null);
});

test("accepts balanced CSS blocks", () => {
  assert.equal(parseSourceCodeFile(fenced("css", "body { color: red; }"), "Create style.css")?.language, "css");
});

test("rejects prose outside the single source block", () => {
  assert.equal(parseSourceCodeFile("Here is your file:\n" + fenced("js", "console.log('ok');"), "Create app.js"), null);
});

test("rejects empty and oversized files", () => {
  assert.equal(parseSourceCodeFile(fenced("js", "   "), "Create app.js"), null);
  assert.equal(parseSourceCodeFile(fenced("js", "x".repeat(100001)), "Create app.js"), null);
});
