import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parsePowerPointPresentation } from "../../artifacts/api-server/src/lib/powerpoint.js";
import { fitPowerPointFontSize, parsePowerPointData, parsePowerPointResult } from "../../artifacts/al-omda-ai/src/lib/pptx.js";

const slide = { title: "Overview", body: "A useful summary", bullets: ["First point"], speakerNotes: "Presenter notes" };

test("server parser accepts fenced JSON and JSON surrounded by explanatory text", () => {
  const json = JSON.stringify({ title: "Demo", slides: [slide] });
  assert.equal(parsePowerPointPresentation("```json\n" + json + "\n```")?.title, "Demo");
  assert.equal(parsePowerPointPresentation("Here is the deck:\n" + json + "\nDone.")?.slides.length, 1);
});

test("server parser normalizes optional fields and bounds long slide content", () => {
  const parsed = parsePowerPointPresentation(JSON.stringify({
    title: "Bounded",
    slides: [{ title: "Slide", body: "b".repeat(1200), bullets: Array.from({ length: 11 }, () => "x".repeat(250)) }],
  }));
  assert.ok(parsed);
  assert.equal(parsed.slides[0].body.length, 250);
  assert.equal(parsed.slides[0].bullets.length, 10);
  assert.equal(parsed.slides[0].bullets[0].length, 150);
  assert.equal(parsed.slides[0].speakerNotes, "");
  const bodyOnly = parsePowerPointPresentation(JSON.stringify({ title: "Body only", slides: [{ title: "Long", body: "b".repeat(1200) }] }));
  assert.equal(bodyOnly?.slides[0].body.length, 900);
});

test("server parser rejects malformed JSON, invalid titles, and slide counts outside 1–40", () => {
  assert.equal(parsePowerPointPresentation("{broken"), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify({ title: "", slides: [slide] })), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify({ title: "Empty", slides: [] })), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify({ title: "Too many", slides: Array.from({ length: 41 }, (_, i) => ({ ...slide, title: "Slide " + i })) })), null);
  assert.equal(parsePowerPointPresentation(JSON.stringify({ title: "Bad slide", slides: [{ ...slide, title: 42 }] })), null);
});

test("client parser mirrors server acceptance and task-history prefix parsing", () => {
  const normalized = parsePowerPointData({ title: "Client", slides: [{ title: "One", body: "Body" }] });
  assert.deepEqual(normalized, { title: "Client", slides: [{ title: "One", body: "Body", bullets: [], speakerNotes: "" }] });
  assert.equal(parsePowerPointData({ title: "No content", slides: [{ title: "One" }] }), null);
  assert.equal(parsePowerPointResult("ALOMDA_PPTX_JSON:" + JSON.stringify({ title: "Stored", slides: [slide] }))?.title, "Stored");
  assert.equal(parsePowerPointResult("not a presentation"), null);
});

test("PPTX font sizing responds to text length and the actual slide box dimensions", () => {
  const shortTitle = fitPowerPointFontSize("Quarterly overview", 28, 12.05, 0.8, 1, 0, 16);
  const longTitle = fitPowerPointFontSize("A very long presentation title ".repeat(12), 28, 12.05, 0.8, 1, 0, 16);
  const bodyOnly = fitPowerPointFontSize("A detailed body paragraph ".repeat(30), 19, 11.7, 4.9);
  const narrowBody = fitPowerPointFontSize("A detailed body paragraph ".repeat(30), 19, 4, 1.25);
  assert.ok(shortTitle > longTitle);
  assert.ok(bodyOnly > narrowBody);
  assert.ok(longTitle >= 16);
  assert.ok(narrowBody >= 11);
});

test("client and server parsers normalize bullet lists and speaker notes identically", () => {
  const value = {
    title: "Consistent",
    slides: [{
      title: "One",
      body: "",
      bullets: [...Array.from({ length: 10 }, () => "   "), "Keep this bullet"],
      speakerNotes: "  Presenter notes  ",
    }],
  };
  const server = parsePowerPointPresentation(JSON.stringify(value));
  const client = parsePowerPointData(value);
  assert.deepEqual(client, server);
  assert.equal(client?.slides[0].bullets.length, 1);
  assert.equal(client?.slides[0].speakerNotes, "Presenter notes");
});
