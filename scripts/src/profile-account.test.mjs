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

test('physical profile feedback keeps empty name honest and privacy readable',()=>{
 assert.ok(app.includes('No display name is saved'));
 assert.ok(app.includes('No display name yet'));
 assert.ok(app.includes('profile-privacy-card'));
 assert.ok(app.includes("path !== '/profile' && <Link"));
 assert.ok(css.includes('float:none!important'));
 assert.ok(css.includes('padding-bottom:calc(120px + env(safe-area-inset-bottom))'));
});

test('icon glyphs do not inherit active card tiles or Safari compositing effects',()=>{
 const palette=readFileSync('../artifacts/al-omda-ai/src/workspace-palette.css','utf8');
 assert.ok(!palette.includes('.mobile-nav .mobile-nav-link.active svg,.filter-pill'));
 assert.ok(palette.includes('.mobile-nav svg,.profile-settings-page svg'));
 assert.ok(palette.includes('filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important'));
});

test('profile and navigation use equal aligned icon slots, preserving lavender surfaces',()=>{
 const palette=readFileSync('../artifacts/al-omda-ai/src/workspace-palette.css','utf8');
 assert.ok(app.includes('className="profile-heading-icon"'));
 assert.ok(usage.includes('className="profile-heading-icon"'));
 assert.ok(app.includes('className="mobile-nav-icon"'));
 assert.ok(css.includes('grid-template-columns:minmax(0,1fr) 40px 40px!important'));
 assert.ok(css.includes('width:40px!important;height:40px!important;margin:0!important'));
 assert.ok(css.includes('transform:none!important;gap:3px!important'));
 assert.ok(palette.includes('background:#373044!important;border:1px solid #645079!important'));
});
test('voice screenshot identifies release and input independent of speech gate',()=>{
 const voice=readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx','utf8');
 assert.ok(voice.includes('data-testid="voice-capture-diagnostic"'));
 assert.ok(voice.includes('VITE_APP_BUILD_ID'));
 assert.ok(voice.includes("'frames='+inputFramesRef.current"));
 assert.ok(voice.indexOf('inputFramesRef.current++')<voice.indexOf('if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current || assistantResponseActiveRef.current) return;'));
});
test('voice layout reserves dynamic rows and prevents footer overlap',()=>{
 const voice=readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx','utf8');
 const layout=readFileSync('../artifacts/al-omda-ai/src/voice-experience.css','utf8');
 assert.ok(!voice.includes('className="voice-state-label"'));
 assert.ok(!voice.includes('{active&&micDiagnostic&&'));
 assert.ok(layout.includes('min-height:66px!important'));
 assert.ok(layout.includes('flex:0 0 auto!important;min-height:min-content!important'));
});
