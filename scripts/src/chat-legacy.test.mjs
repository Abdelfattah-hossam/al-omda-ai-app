import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../../artifacts/al-omda-ai/src/chat-legacy.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../../artifacts/al-omda-ai/src/main.tsx',import.meta.url),'utf8');
test('legacy chat baseline is isolated from modern layout',()=>{
 assert.ok(css.includes('@supports not (height:100dvh)'));
 assert.ok(css.includes('height:100vh!important'));
 assert.ok(main.includes("import './chat-legacy.css'"));
 assert.ok(!css.replace(/\/\*[\s\S]*?\*\//g,'').includes('@layer'));
 assert.ok(!css.replace(/\/\*[\s\S]*?\*\//g,'').includes(':has('));
});
test('baseline gives every chat ancestor a non-collapsing flex height',()=>{
 for(const selector of ['>.main-area{','>.content-wrap{','.ai-chat-page{','.ai-chat-main{','.ai-chat-main>.panel{','.chat-messages{','.ai-composer{'])assert.ok(css.includes(selector),selector);
});
