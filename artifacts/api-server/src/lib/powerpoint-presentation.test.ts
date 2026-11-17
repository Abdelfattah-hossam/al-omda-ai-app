import test from "node:test";
import assert from "node:assert/strict";
import { getRequestedPowerPointSlideCount, parsePowerPointPresentation } from "./powerpoint-presentation.js";

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
  assert.equal(parsePowerPointPresentation("{\"title\":"), null);
});


test("rejects slides without any content bullets", () => {
  const emptyBullets = { ...base, slides: base.slides.map((slide, index) => index === 1 ? { ...slide, bullets: [] } : slide) };
  assert.equal(parsePowerPointPresentation(JSON.stringify(emptyBullets)), null);
});


test("rejects oversized presentation payloads before parsing", () => {
  assert.equal(parsePowerPointPresentation(" ".repeat(1_000_001)), null);
});


test("rejects slides whose combined bullet text is too long for a readable slide", () => {
  const crowded = {
    ...base,
    slides: base.slides.map((slide, index) => index === 1
      ? { ...slide, bullets: ["x".repeat(700), "y".repeat(700), "z".repeat(700), "w".repeat(301)] }
      : slide),
  };
  assert.equal(parsePowerPointPresentation(JSON.stringify(crowded)), null);
});

test("extracts exact requested slide counts in English and Arabic", () => {
  assert.equal(getRequestedPowerPointSlideCount("Create a PowerPoint with 8 slides"), 8);
  assert.equal(getRequestedPowerPointSlideCount("اعمل عرض تقديمي من ٨ شرائح"), 8);
  assert.equal(getRequestedPowerPointSlideCount("Make a presentation"), null);
  assert.equal(getRequestedPowerPointSlideCount("Create 40 slides"), null);
});
