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

test("routes professional requests to domain-specific provider pools", () => {
  assert.equal(inferModelPurpose("Review this employment contract for legal compliance"), "legal");
  assert.equal(inferModelPurpose("راجع عقد العمل من الناحية القانونية"), "legal");
  assert.equal(inferModelPurpose("Calculate the structural beam load and foundation requirements"), "engineering");
  assert.equal(inferModelPurpose("احسب الأحمال الإنشائية ومتطلبات الأساسات"), "engineering");
  assert.equal(inferModelPurpose("Explain the clinical diagnosis and treatment options"), "medical");
  assert.equal(inferModelPurpose("اشرح التشخيص الطبي وخيارات العلاج"), "medical");
  assert.equal(inferModelPurpose("Prepare a cash-flow forecast and investment budget"), "finance");
  assert.equal(inferModelPurpose("جهز ميزانية الاستثمار والتدفق النقدي"), "finance");
  assert.equal(inferModelPurpose("Create a marketing campaign and sales strategy"), "business");
  assert.equal(inferModelPurpose("ضع خطة تسويق واستراتيجية مبيعات"), "business");
  assert.equal(inferModelPurpose("Build a website for a small business"), "coding");
});
