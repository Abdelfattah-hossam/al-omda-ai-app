import assert from "node:assert/strict";
import test from "node:test";
import { detectProjectSpecialty } from "./project-intent.js";

test("creates a project task for explicit build requests", () => {
  for (const request of [
    "اعمل لي تطبيق لإدارة المصاريف",
    "عايز موقع إلكتروني لمتجري",
    "ممكن تعمل لي تطبيق",
    "ابدأ مشروع جديد من الصفر",
    "Build me a website",
    "Can you create a mobile app?",
    "I want a website for my business",
  ]) {
    assert.ok(detectProjectSpecialty(request), "missed explicit project request: " + request);
  }
});

test("does not create project tasks for ordinary questions or explanations", () => {
  for (const request of [
    "إيه المشاريع اللي تقدر تعملها؟",
    "هل يمكنك إنشاء تطبيق؟",
    "ممكن تشرحلي إزاي أعمل موقع؟",
    "كيف أبدأ مشروعًا؟",
    "What projects can you build?",
    "Can you explain how to create a website?",
    "What is a project management app?",
    "Tell me about building websites",
  ]) {
    assert.equal(detectProjectSpecialty(request), null, "misclassified information request: " + request);
  }
});

test("does not create project tasks for negated build requests", () => {
  for (const request of [
    "مش عايز تعمل لي موقع",
    "لا تنشئ تطبيق",
    "من غير ما تبني مشروع",
    "Don't build a website",
    "Do not create an app",
    "I'm not asking you to develop a platform",
  ]) {
    assert.equal(detectProjectSpecialty(request), null, "misclassified negated request: " + request);
  }
});
