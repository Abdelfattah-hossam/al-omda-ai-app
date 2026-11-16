import assert from "node:assert/strict";
import test from "node:test";
import { detectProjectSpecialty } from "./project-intent.js";

test("creates a project task for explicit build requests", () => {
  for (const request of [
    "اعمل لي تطبيق لإدارة المصاريف",
    "عايز موقع إلكتروني لمتجري",
    "ممكن تعمل لي تطبيق",
    "هل يمكنك إنشاء تطبيق؟",
    "هل تقدر تعمل لي تطبيق؟",
    "هل ممكن تعمل لي تطبيق؟",
    "ابدأ مشروع جديد من الصفر",
    "جهزلي موقع إلكتروني",
    "جهز لي متجر إلكتروني",
    "سوي لي تطبيق لإدارة المخزون",
    "سويلي نظام للحجوزات",
    "صمملي شعار للمتجر",
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
    "إيه رأيك أعمل تطبيق؟",
    "ممكن تشرحلي إزاي أعمل موقع؟",
    "كيف أبدأ مشروعًا؟",
    "What projects can you build?",
    "Can you explain how to create a website?",
    "What is a project management app?",
    "Tell me about building websites",
    "إيه معنى تجهيز موقع إلكتروني؟",
    "إزاي أسوي تطبيق بنفسي؟",
  ]) {
    assert.equal(detectProjectSpecialty(request), null, "misclassified information request: " + request);
  }
});

test("does not create project tasks for negated build requests", () => {
  for (const request of [
    "مش عايز تعمل لي موقع",
    "لا تنشئ تطبيق",
    "لا أريد إنشاء تطبيق",
    "ما تبنيش موقع",
    "ما تجهزش موقع",
    "متسويش تطبيق",
    "من غير ما تبني مشروع",
    "Don't build a website",
    "Do not create an app",
    "I'm not asking you to develop a platform",
    "I don't want you to create a website",
  ]) {
    assert.equal(detectProjectSpecialty(request), null, "misclassified negated request: " + request);
  }
});

test("logs explicit Office and file-creation requests as project tasks", () => {
  for (const request of [
    "اعمللي ملف Excel لمتابعة المصروفات",
    "جهز لي مستند Word بعقد عمل",
    "اعمل عرض PowerPoint للمشروع",
    "I need an Excel spreadsheet for inventory",
    "Create a Word document with a seven-column table",
    "Prepare a PowerPoint presentation for the launch",
    "Create a source code file for the app",
  ]) {
    assert.ok(detectProjectSpecialty(request), "missed file deliverable request: " + request);
  }
});

test("does not create file tasks for questions that only mention Office formats", () => {
  for (const request of [
    "إزاي أعمل ملف Excel؟",
    "ممكن تشرحلي Word؟",
    "What is an Excel spreadsheet?",
    "How do I create a Word document?",
    "Can you explain PowerPoint?",
    "اعمل عرض أسعار للعميل",
    "عايز عرض أسعار للمشروع",
    "عايز أعرف معنى كلمة ملف",
    "اعمل جدول مواعيد",
    "عايز جدول مواعيد",
    "عايز ملف",
  ]) {
    assert.equal(detectProjectSpecialty(request), null, "misclassified Office question: " + request);
  }
});
