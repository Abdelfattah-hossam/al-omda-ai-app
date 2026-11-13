import { test } from "node:test";
import { strict as assert } from "node:assert";
import { inferModelPurpose } from "./model-purpose.js";

test("infers model purpose from explicit coding, review, and research requests", () => {
  assert.equal(inferModelPurpose("Implement a TypeScript feature and fix the bug"), "coding");
  assert.equal(inferModelPurpose("Review the security of this pull request"), "review");
  assert.equal(inferModelPurpose("Research and compare three model providers"), "research");
  assert.equal(inferModelPurpose("راجع الكود واكتشف الثغرات"), "review");
  assert.equal(inferModelPurpose("ابحث وقارن بين مزودي النماذج"), "research");
  assert.equal(inferModelPurpose("عدل الكود وأصلح المشكلة"), "coding");
  assert.equal(inferModelPurpose("Build a website for a small business"), "coding");
});

test("defaults conversational and general requests to the general provider pool", () => {
  assert.equal(inferModelPurpose("Hello, how are you?"), "general");
  assert.equal(inferModelPurpose("Create a personal weekly plan"), "general");
  assert.equal(inferModelPurpose("Create a Word document"), "general");
});
