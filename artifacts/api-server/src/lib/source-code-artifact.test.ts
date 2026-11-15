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


test("accepts a safe self-contained SVG drawing", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="black"/></svg>';
  assert.equal(parseSourceCodeFile(fenced("svg", svg), "Create plan.svg")?.language, "svg");
});

test("rejects active SVG content and event handlers", () => {
  for (const svg of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>bad</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://evil.example/x">]><svg>&x;</svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/a)"/></svg>'
  ]) assert.equal(parseSourceCodeFile(fenced("svg", svg), "Create plan.svg"), null);
});


test("accepts a minimal ASCII DXF drawing with a LINE entity", () => {
  const dxf = [
    "0","SECTION","2","ENTITIES","0","LINE","10","0","20","0","11","100","21","50","0","ENDSEC","0","EOF"
  ].join("\n");
  assert.equal(parseSourceCodeFile(fenced("dxf", dxf), "Create site-plan.dxf")?.name, "al-omda-source.dxf");
});

test("rejects malformed and unsupported DXF source", () => {
  const malformed = ["0","SECTION","2","ENTITIES","0","LINE","10","not-a-number","20","0","0","ENDSEC","0","EOF"].join("\n");
  const unsupported = ["0","SECTION","2","ENTITIES","0","UNSAFE_ENTITY","0","ENDSEC","0","EOF"].join("\n");
  assert.equal(parseSourceCodeFile(fenced("dxf", malformed), "Create site-plan.dxf"), null);
  assert.equal(parseSourceCodeFile(fenced("dxf", unsupported), "Create site-plan.dxf"), null);
});


test("accepts DXF with multiple supported entities and a closed polyline", () => {
  const dxf = [
    "0","SECTION","2","ENTITIES",
    "0","LINE","10","0","20","0","11","10","21","10",
    "0","CIRCLE","10","5","20","5","40","2",
    "0","LWPOLYLINE","90","3","70","1","10","0","20","0","10","10","20","0","10","5","20","8",
    "0","ENDSEC","0","EOF"
  ].join("\n");
  assert.equal(parseSourceCodeFile(fenced("dxf", dxf), "Create plan.dxf")?.language, "dxf");
});

test("rejects DXF with an incomplete group-code/value pair or missing ENDSEC", () => {
  const incomplete = ["0","SECTION","2","ENTITIES","0","LINE","10","0","20","0","11","10","21","10","0","ENDSEC","0"].join("\n");
  const missingEndsec = ["0","SECTION","2","ENTITIES","0","LINE","10","0","20","0","11","10","21","10","0","EOF"].join("\n");
  assert.equal(parseSourceCodeFile(fenced("dxf", incomplete), "Create plan.dxf"), null);
  assert.equal(parseSourceCodeFile(fenced("dxf", missingEndsec), "Create plan.dxf"), null);
});

test("rejects oversized DXF input before parsing", () => {
  assert.equal(parseSourceCodeFile(fenced("dxf", "0\nSECTION\n" + "x".repeat(100001)), "Create plan.dxf"), null);
});


test("accepts DXF ARC, TEXT, and MTEXT entities for preview-capable drawings", () => {
  const dxf = [
    "0","SECTION","2","ENTITIES",
    "0","ARC","10","5","20","5","40","3","50","0","51","180",
    "0","TEXT","10","1","20","2","40","2.5","1","Entrance",
    "0","MTEXT","10","3","20","4","40","2.5","1","Room\\PLabel",
    "0","ENDSEC","0","EOF"
  ].join("\n");
  assert.equal(parseSourceCodeFile(fenced("dxf", dxf), "Create annotations.dxf")?.language, "dxf");
});
