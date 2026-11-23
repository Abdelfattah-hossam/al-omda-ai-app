import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('../artifacts/al-omda-ai/src/mobile-workspace.css','utf8');
const app=readFileSync('../artifacts/al-omda-ai/src/App.tsx','utf8');
test('workspace header keeps existing actions in an accessible mobile disclosure',()=>{
 assert.ok(app.includes('aria-controls="workspace-header-actions"'));
 assert.ok(app.includes('data-open={headerActionsOpen?"true":"false"}'));
 for(const id of ['button-command-palette','button-page-help','button-language','link-profile'])assert.ok(app.includes(id));
 assert.ok(css.includes('.top-actions[data-open="true"]'));
});
test('workspace content reaches viewport and reserves end padding instead of blank dock band',()=>{
 assert.ok(css.includes('height:100dvh!important'));
 assert.ok(css.includes('padding-bottom:calc(176px + env(safe-area-inset-bottom))'));
 assert.ok(css.includes('.app-shell:not([data-chat-active="true"])>.main-area'));
 assert.doesNotMatch(css,/overflow(?:-y)?\s*:|scroll-behavior\s*:/);
});
