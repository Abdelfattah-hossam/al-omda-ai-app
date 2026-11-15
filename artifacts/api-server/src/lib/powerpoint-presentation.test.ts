import test from "node:test";
import assert from "node:assert/strict";
import { parsePowerPointPresentation } from "./powerpoint-presentation.js";

const base = {
  title: "Project overview",
  slides: [
    { title: "Opening", bullets: ["Purpose"] },
    { title: "Plan", bullets: ["First step", "Second step"], notes: "Explain the timeline and owners." },
    { title: "Conclusion", bullets: ["Next action"] },
  ],
};

test("accepts a valid presentation and preserves optional speaker notes", () => {
  const result = parsePowerPointPresentation(JSON.stringify(base));
  assert.equal(result?.slides.length, 3);
  assert.equal(result?.slides[1].notes, "Explain the timeline and owners.");
  assert.equal(result?.slides[0].notes, undefined);
});

test("accepts fenced JSON presentation output", () => {
  const result = parsePowerPointPresentation("```json\n" + JSON.stringify(base) + "\n```");
  assert.equal(result?.title, "Project overview");
});

test("rejects presentations outside the slide count limits", () => {
  assert.equal(parsePowerPointPresentation(JSON.stringify({ ...base, slides: base.slides.slice(0, 2) })), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify({ ...base, slides: Array.from({ length: 31 }, () => base.slides[0]) })), null);
});

test("rejects malformed bullets and oversized speaker notes", () => {
  const badBullets = { ...base, slides: base.slides.map((slide, index) => index === 0 ? { ...slide, bullets: [""] } : slide) };
  const badNotes = { ...base, slides: base.slides.map((slide, index) => index === 0 ? { ...slide, notes: "x".repeat(2001) } : slide) };
  assert.equal(parsePowerPointPresentation(JSON.stringify(badBullets)), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify(badNotes)), null);
});

test("rejects oversized titles and malformed JSON", () => {
  assert.equal(parsePowerPointPresentation(JSON.stringify({ ...base, title: "x".repeat(181) })), null);
  assert.equal(parsePowerPointPresentation('{"title":')), null);
});
