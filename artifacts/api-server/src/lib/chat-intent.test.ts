import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { getLatestUserRequest, isExcelFileRequest, isHowToRequest, isStandaloneGreeting, isWordFileRequest } from "./chat-intent.js";

describe("chat artifact intent", () => {
  test("does not create files for questions, comparisons, or ordinary mentions", () => {
    const ordinaryMessages = [
      "كيف أعمل ملف Word؟",
      "ممكن تشرحلي ازاي أعمل ملف Word؟",
      "ممكن تقولي ازاي أعمل ملف Word؟",
      "عايز أتعلم أعمل ملف Word",
      "علمني أعمل ملف Excel",
      "How do I create an Excel file?",
      "How can I make a Word document?",
      "ما الفرق بين Word وExcel؟",
      "أنا بستخدم Excel في الشغل",
      "اعمل مقارنة بين Excel وWord",
      "اكتبلي تقرير عن Excel",
      "عايز أعرف Word بيشتغل إزاي",
      "اعمل جدول من 7 أعمدة",
      "مش عايز ملف Word",
      "مش عايز تعمل لي ملف Word",
      "لا تعمل ملف Word",
      "من غير ملف Excel",
      "ما تعملش ملف Excel",
      "Don't create a Word file",
      "Do not generate an Excel workbook",
    ];
    for (const message of ordinaryMessages) {
      assert.equal(isWordFileRequest(message), false, "unexpected Word file intent: " + message);
      assert.equal(isExcelFileRequest(message), false, "unexpected Excel file intent: " + message);
    }
  });

  test("creates Word only when the user explicitly asks for a Word file", () => {
    for (const message of [
      "اعمل ملف Word فيه خطة تنفيذ",
      "عايز ملف Word للتحميل",
      "جهزلي مستند وورد",
      "ممكن تعمل لي ملف Word",
      "أنشئ ملف Word",
      "Create a Word document",
      "Make a Word doc",
    ]) {
      assert.equal(isWordFileRequest(message), true, "missed Word file intent: " + message);
    }
    assert.equal(isWordFileRequest("كيف أعمل ملف Word؟"), false);
    assert.equal(isWordFileRequest("مش عايز ملف Word"), false);
    assert.equal(isWordFileRequest("لا تعمل ملف Word"), false);
  });

  test("creates Excel only when the user explicitly asks for an Excel file", () => {
    for (const message of [
      "جهزلي شيت Excel للميزانية",
      "اعمل ملف Excel",
      "تعمل لي ملف Excel للمبيعات",
      "Create an Excel spreadsheet",
      "Generate an XLSX workbook",
    ]) {
      assert.equal(isExcelFileRequest(message), true, "missed Excel file intent: " + message);
    }
    assert.equal(isExcelFileRequest("ما الفرق بين Word وExcel؟"), false);
    assert.equal(isExcelFileRequest("كيف أعمل ملف Excel؟"), false);
    assert.equal(isExcelFileRequest("مش عايز ملف Excel"), false);
    assert.equal(isExcelFileRequest("ما تعملش ملف Excel"), false);
  });

  test("recognizes explanatory questions as how-to rather than artifact requests", () => {
    for (const message of [
      "كيف أعمل ملف Word؟",
      "اشرحلي Excel",
      "ممكن تشرحلي ازاي أعمل ملف Word؟",
      "ممكن تقولي ازاي أعمل ملف Word؟",
      "عايز أتعلم أعمل ملف Word",
      "علمني أعمل ملف Excel",
      "How do I create an Excel file?",
    ]) {
      assert.equal(isHowToRequest(message), true, "missed how-to intent: " + message);
    }
  });
});


describe("latest-turn intent isolation", () => {
  test("a greeting stays a greeting even after an earlier file request", () => {
    const messages = [
      { role: "user" as const, content: "اعمل ملف Word لخطة المشروع" },
      { role: "assistant" as const, content: "حاضر، ما التفاصيل؟" },
      { role: "user" as const, content: "صباح الخير" },
    ];
    const latest = getLatestUserRequest(messages);
    assert.equal(latest, "صباح الخير");
    assert.equal(isStandaloneGreeting(latest), true);
    assert.equal(isWordFileRequest(latest), false);
    assert.equal(isExcelFileRequest(latest), false);
  });

  test("a new explicit file request is recognized as the current turn", () => {
    const messages = [
      { role: "user" as const, content: "كيفك؟" },
      { role: "assistant" as const, content: "بخير، شكرًا" },
      { role: "user" as const, content: "جهزلي ملف Excel للمبيعات" },
    ];
    const latest = getLatestUserRequest(messages);
    assert.equal(isStandaloneGreeting(latest), false);
    assert.equal(isExcelFileRequest(latest), true);
  });

  test("greeting phrases embedded in a real request are not treated as standalone greetings", () => {
    assert.equal(isStandaloneGreeting("صباح الخير، اعمل ملف Word"), false);
    assert.equal(isStandaloneGreeting("Hello, create an Excel workbook"), false);
  });

  test("normalizes Arabic diacritics and trailing punctuation in greetings", () => {
    assert.equal(isStandaloneGreeting("السَّلَامُ عَلَيْكُمْ!"), true);
    assert.equal(isStandaloneGreeting("كيفك؟؟"), true);
  });
});
