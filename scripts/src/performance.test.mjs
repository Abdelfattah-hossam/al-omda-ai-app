import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
const ui=readFileSync(new URL('../../artifacts/al-omda-ai/src/AIChat.tsx',import.meta.url),'utf8');
test('unchanged markdown does not rerender with composer typing',()=>assert.ok(ui.includes('const MessageContent=memo(')));
test('studio and voice are loaded only when opened',()=>{assert.ok(ui.includes('const MediaStudio=lazy('));assert.ok(ui.includes('const GeminiLiveVoice=lazy('));assert.ok(ui.includes('<Suspense fallback='));});
test('old compositor optimization never changes scrolling or chat layout',()=>{const css=readFileSync(new URL('../../artifacts/al-omda-ai/src/legacy-performance.css',import.meta.url),'utf8');assert.ok(css.includes('@supports not (height:100dvh)'));assert.ok(css.includes(':not([data-chat-active="true"])'));assert.ok(!/scroll-behavior:|overflow:|height:|position:/.test(css.replace('@supports not (height:100dvh)','')));});
