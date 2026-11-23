import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const app=readFileSync('../artifacts/al-omda-ai/src/App.tsx','utf8');
const usage=readFileSync('../artifacts/al-omda-ai/src/ProfileUsage.tsx','utf8');
const css=readFileSync('../artifacts/al-omda-ai/src/profile-account.css','utf8');
test('profile preserves account controls and exposes real data tools',()=>{
 for(const item of ['handleSignOut','handleSaveProfile','handleAvatarUpload','toggleLanguage','profile-personal','profile-data','profile-preferences','profile-account-card'])assert.ok(app.includes(item));
 assert.ok(app.includes('exportTasksSheet(tasks.filter(task=>!task.demo))'));
 assert.ok(app.includes('not chat history'));
 assert.ok(app.includes('other devices or sign-in sessions is not available'));
});
test('profile allowance reads account API and never fills in fake usage',()=>{
 assert.ok(usage.includes("fetch('/api/ai/usage'"));
 assert.ok(usage.includes('Number.isFinite'));
 assert.ok(usage.includes("setUsage(null)"));
 assert.ok(usage.includes('Allowance unavailable'));
 assert.ok(usage.includes('not a cash balance'));
 assert.ok(usage.includes('if(!signedIn)return'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.doesNotMatch(css,/ai-chat-composer|chat-messages|scroll-behavior/);
});
test('remaining gold studio and failure UI use the lavender family',()=>{
 const index=readFileSync('../artifacts/al-omda-ai/src/index.css','utf8');
 const error=readFileSync('../artifacts/al-omda-ai/src/components/error-boundary.tsx','utf8');
 assert.ok(!index.includes('#f0d18a'));
 assert.ok(!index.includes('#d5a34c'));
 assert.ok(!error.includes('#d4ae69'));
});
