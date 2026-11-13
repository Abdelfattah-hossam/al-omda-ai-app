import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { isExcelFileRequest, isHowToRequest, isWordFileRequest } from "./chat-intent.js";

describe("chat artifact intent", () => {
  test("does not create files for questions, comparisons, or ordinary mentions", () => {
    const ordinaryMessages = [
      "كيف أعمل ملف Word؟",
      "ممكن تشرحلي ازاي أعمل ملف Word؟",
      "عايز أتعلم أعمل ملف Word",
      "علمني أعمل ملف Excel",
      "ما الفرق بين Word وExcel؟",
      "أنا بستخدم Excel في الشغل",
      "اعمل مقارنة بين Excel وWord",
      "اكتبلي تقرير عن Excel",
      "عايز أعرف Word بيشتغل إزاي",
      "اعمل جدول من 7 أعمدة",
    ];
    for (const message of ordinaryMessages) {
      assert.equal(isWordFileRequest(message), false, "unexpected Word file intent: " + message);
      assert.equal(isExcelFileRequest(message), false, "unexpected Excel file intent: " + message);
    }
  });

  test("creates Word only when the user explicitly asks for a Word file", () => {
    assert.equal(isWordFileRequest("اعمل ملف Word فيه خطة تنفيذ"), true);
    assert.equal(isWordFileRequest("عايز ملف Word للتحميل"), true);
    assert.equal(isWordFileRequest("جهزلي مستند وورد"), true);
    assert.equal(isWordFileRequest("كيف أعمل ملف Word؟"), false);
  });

  test("creates Excel only when the user explicitly asks for an Excel file", () => {
    assert.equal(isExcelFileRequest("جهزلي شيت Excel للميزانية"), true);
    assert.equal(isExcelFileRequest("اعمل ملف Excel"), true);
    assert.equal(isExcelFileRequest("ما الفرق بين Word وExcel؟"), false);
    assert.equal(isExcelFileRequest("كيف أعمل ملف Excel؟"), false);
  });

  test("recognizes explanatory questions as how-to rather than artifact requests", () => {
    assert.equal(isHowToRequest("كيف أعمل ملف Word؟"), true);
    assert.equal(isHowToRequest("اشرحلي Excel"), true);
    assert.equal(isHowToRequest("ممكن تشرحلي ازاي أعمل ملف Word؟"), true);
    assert.equal(isHowToRequest("عايز أتعلم أعمل ملف Word"), true);
    assert.equal(isHowToRequest("علمني أعمل ملف Excel"), true);
  });
});
