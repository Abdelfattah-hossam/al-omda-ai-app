import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const chat = readFileSync("../artifacts/al-omda-ai/src/AIChat.tsx", "utf8");
const css = readFileSync("../artifacts/al-omda-ai/src/chat-design.css", "utf8");
const app = readFileSync("../artifacts/al-omda-ai/src/App.tsx", "utf8");
const entry = readFileSync("../artifacts/al-omda-ai/src/main.tsx", "utf8");
test("the supplied design is scoped to chat, not the rest of the app", () => {
 assert.ok(entry.includes("import './chat-design.css'"));
 for (const rule of css.split("\n").filter(line => line.includes("!important") && !line.startsWith("@media"))) assert.ok(rule.includes('.app-shell[data-chat-active="true"]'), rule);
 assert.ok(css.includes("#0b0b0b"));
 assert.ok(!css.includes("scroll-behavior"));
});
test("document-only attachments expose Send", () => {
 assert.ok(chat.includes("input.trim() || pendingImage || pendingFile ? <button type=\"submit\""));
});
test("desktop sidebar can collapse and the account name comes from App", () => {
 assert.ok(chat.includes("setDesktopSidebarCollapsed(value=>!value)"));
 assert.ok(chat.includes("displayName?.trim()"));
 assert.ok(app.includes("displayName={name}"));
 assert.ok(app.includes("onToggleLanguage={toggleLanguage}"));
 assert.ok(chat.includes("onPageHelp &&"));
});
test("welcome actions use real tools while old analysis and planning remain available", () => {
 for (const action of ["activateMode('word')", "activateMode('excel')", "onClick={openCodeCanvas}", "onClick={openSettings}", "Analyze data", "Plan a project"]) assert.ok(chat.includes(action));
});
test("save and close waits for a successful save", () => {
 assert.ok(chat.includes("const saveMemory = async (): Promise<boolean>"));
 assert.ok(chat.includes("saveMemory().then(saved=>{if(saved)setShowSettingsModal(false);})"));
 assert.ok(chat.includes('className={"ai-chat-settings-feedback"'));
});
test("Canvas has an actual DOM-updating sample without widening sandbox permissions", () => {
 assert.ok(chat.includes("canvas-status"));
 assert.ok(chat.includes("textContent='تم التشغيل بنجاح!'"));
 assert.ok(!chat.includes('sandbox="allow-scripts allow-modals"'));
});
