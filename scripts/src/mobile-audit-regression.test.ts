import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync("../artifacts/al-omda-ai/src/App.tsx", "utf8");
const collab = readFileSync("../artifacts/al-omda-ai/src/CollaborationWorkspace.tsx", "utf8");
const css = readFileSync("../artifacts/al-omda-ai/src/index.css", "utf8");
test("collaboration deletion requires explicit in-app confirmation and preserves cancel and error paths",()=>{
 assert.ok(!collab.includes('window.confirm('));assert.ok(collab.includes('role="alertdialog"'));assert.ok(collab.includes('requestRemove(record)'));assert.ok(collab.includes('if(!record||deleting)return;'));assert.ok(collab.includes('setDeleteError(cause instanceof Error'));assert.ok(collab.includes('if(editingId===record.id)reset();'));assert.ok(collab.includes('document.body)'));
});
test("pipeline progress measures execution, not approval", () => {
 const section = app.slice(app.indexOf("  const pipelinePage ="), app.indexOf("  const assetsPage ="));
 assert.ok(section.includes("executionCount(task)/task.steps.length"));
 assert.ok(!section.includes("?count(task)/task.steps.length"));
});
test("calendar has event-specific statuses without changing stored values", () => {
 assert.ok(collab.includes('open: "مجدول"'));
 assert.ok(collab.includes('resolved: "انتهى"'));
 assert.ok(collab.includes('value="resolved">{statusLabels.resolved}'));
});
test("drawer labels can wrap on mobile", () => {
 assert.match(css, /curtain-launcher-item strong \{\s+white-space:normal;/);
});
test("analytics error copy is gated on an actual error", () => {
 assert.ok(app.includes("liveUserAnalyticsError ? (isAr?'تعذر تحميل التحليلات"));
});

test("provider settings show all configured fallback engines", () => {
 const chat = readFileSync("../artifacts/al-omda-ai/src/AIChat.tsx", "utf8");
 for (const provider of ["groq", "cloudflare"]) {
  assert.ok(chat.includes("usage?.providers?." + provider));
 }
 assert.ok(chat.includes("Gemini · Groq · OpenRouter · Cloudflare"));
});


test("Arabic dashboard labels preserve joining and launcher descriptions wrap", () => {
 assert.ok(css.includes('.app-shell[dir="rtl"]:not([data-chat-active="true"])'));
 assert.ok(css.includes('letter-spacing:normal!important;'));
 assert.ok(css.includes('.app-launcher-copy :is(strong,small)'));
 assert.ok(app.includes("+' أداة')"));
});
test("dashboard does not address a placeholder as a saved name", () => {
 assert.ok(app.includes("const hasGreetingName = Boolean(greetingName)"));
 assert.ok(app.includes("hasGreetingName ? `${t('hello')} ${greetingName}`"));
});
test("mobile workspace scroll area ends above both fixed controls without changing chat", () => {
 assert.ok(css.includes('--workspace-dock-space:calc(144px + env(safe-area-inset-bottom))'));
 assert.ok(css.includes('.app-shell:not([data-chat-active="true"]) > .main-area {\n    height:calc(100dvh - var(--workspace-dock-space))'));
});

test("project lists paginate without removing projects and keep filters", () => {
 assert.ok(app.includes('const visibleProjects = projects.slice((currentPage - 1) * 8, currentPage * 8)'));
 assert.ok(app.includes('{visibleProjects.map(task=>'));
 assert.ok(app.includes('[query, projectCategoryFilter, historyStatusFilter]'));
});
test("chat quality is controlled by prompt rules, not scroll or composer code", () => {
 const ai = readFileSync('../artifacts/api-server/src/routes/ai.ts', 'utf8');
 assert.ok(ai.includes('Greetings are greetings'));
 assert.ok(ai.includes('clear, warm Egyptian Arabic'));
 assert.ok(ai.includes('executionStyle + conversationalStyle + memoryContext'));
});

test("iPhone shell avoids the legacy chat height cap and gives dock one bottom inset", () => {
 assert.ok(css.includes('.app-shell[data-chat-active="true"]>.main-area .ai-chat-page{max-height:100%!important;}'));
 assert.ok(css.includes('bottom:calc(95px + env(safe-area-inset-bottom))!important;'));
 assert.ok(css.includes('height:74px!important;min-height:74px!important;max-height:74px!important;padding:8px!important;'));
 assert.ok(css.includes('padding-top:calc(20px + env(safe-area-inset-top))!important;'));
});
test("studio escapes transformed ancestors and retains dark gold controls", () => {
 const studio = readFileSync('../artifacts/al-omda-ai/src/MediaStudio.tsx', 'utf8');
 assert.ok(studio.includes('return createPortal('));
 assert.ok(studio.includes('</section></div>,document.body)'));
 assert.ok(css.includes('flex:0 1 980px;min-width:0;max-width:100%;overflow-x:hidden;'));
 assert.ok(css.includes('.media-studio .button-primary{background:linear-gradient(135deg,#f0d18a,#d5a34c)'));
});
