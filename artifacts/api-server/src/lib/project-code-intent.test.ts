import assert from "node:assert/strict";
import test from "node:test";
import { isMultiFileProjectRequest, isStandaloneHtmlRequest } from "./project-code-intent.js";

test("routes full websites and business systems to multi-file project artifacts", () => {
  assert.equal(isMultiFileProjectRequest("Build a website like Amazon"), true);
  assert.equal(isMultiFileProjectRequest("I want a website like Amazon"), true);
  assert.equal(isMultiFileProjectRequest("Create an online store"), true);
  assert.equal(isMultiFileProjectRequest("Build a full application"), true);
  assert.equal(isMultiFileProjectRequest("Create an e-commerce marketplace with checkout and admin dashboard"), true);
  assert.equal(isMultiFileProjectRequest("اعمل موقع زي أمازون مع متجر وسلة مشتريات ولوحة تحكم"), true);
  assert.equal(isMultiFileProjectRequest("ابني نظام إدارة مخزون وقاعدة بيانات"), true);
});

test("keeps explicit one-file HTML and small utilities on the standalone path", () => {
  assert.equal(isStandaloneHtmlRequest("Create a single HTML file"), true);
  assert.equal(isStandaloneHtmlRequest("اعمل ملف HTML واحد فقط"), true);
  assert.equal(isMultiFileProjectRequest("Create a desktop clock"), false);
  assert.equal(isMultiFileProjectRequest("Build a simple calculator app"), false);
  assert.equal(isMultiFileProjectRequest("Build a website as a single HTML file"), false);
});
