import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const css=readFileSync('../artifacts/al-omda-ai/src/workspace-palette.css','utf8');
test('reference palette is scoped away from chat on every selector',()=>{
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').replace('@layer omda-workspace-palette {','').matchAll(/([^{}]+)\{[^{}]*\}/g);
 let count=0;
 for(const rule of rules){
  assert.ok(rule[1].trim().startsWith('.app-shell:not([data-chat-active="true"])'),rule[1]);count++;
 }
 assert.ok(count>25);
});
test('palette is color only and preserves semantic status colors',()=>{
 assert.ok(css.includes('--omda-accent:#b79aef!important'));
 assert.ok(css.includes('.status-chip.completed'));
 assert.ok(css.includes('.status-chip.stopped'));
 assert.doesNotMatch(css,/(?:^|[;{\s])(?:height|width|position|display|overflow|padding|margin|scroll-behavior|touch-action)\s*:/);
});
