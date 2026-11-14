import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isPowerPointRequestText } from "../../artifacts/api-server/src/lib/powerpoint-intent.js";

test("detects English and Arabic requests to create PowerPoint presentations", () => {
  for (const request of [
    "Create a presentation about Q3 sales",
    "Prepare slides about solar energy",
    "Build a slide deck for the product launch",
    "اعمل ملف بوربوينت عن الطاقة الشمسية",
    "أنشئ عرض تقديمي عن إدارة الوقت",
  ]) assert.equal(isPowerPointRequestText(request), true, request);
});

test("does not turn help, negated, or edit requests into new presentations", () => {
  for (const request of [
    "Do not create a PowerPoint file. Give me three presentation tips instead.",
    "I can't download my PowerPoint file",
    "Why won't PowerPoint export my deck?",
    "How do I create a presentation?",
    "Show me how to create a PowerPoint presentation",
    "Create a presentation about climate change",
    "Make my PowerPoint font bigger",
    "لا تعمل ملف بوربوينت",
  ]) assert.equal(isPowerPointRequestText(request), false, request);
});
