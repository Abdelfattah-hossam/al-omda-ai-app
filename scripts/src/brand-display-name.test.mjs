import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../../artifacts/al-omda-ai/',import.meta.url);
test('display name is exact in install metadata and brand assets',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');
 assert.match(html,/<title>AL OMDA Ai<\/title>/);
 for(const key of ['og:title','twitter:title','apple-mobile-web-app-title','application-name']) assert.ok(html.includes(`${key}" content="AL OMDA Ai"`));
 const manifest=JSON.parse(readFileSync(new URL('public/manifest.webmanifest',root),'utf8'));
 assert.equal(manifest.name,'AL OMDA Ai');assert.equal(manifest.short_name,'AL OMDA Ai');assert.equal(manifest.id,'/');
 for(const name of readdirSync(new URL('public/brand/',root)).filter(x=>x.endsWith('.svg'))){
  const s=readFileSync(new URL('public/brand/'+name,root),'utf8');assert.match(s,/AL OMDA Ai/);assert.ok(!/العمدة|العمده|Al OMDA AI/.test(s));
 }
});
test('active UI and generated document branding avoid legacy spelling',()=>{
 for(const name of ['src/App.tsx','src/AIChat.tsx','src/GeminiLiveVoice.tsx','src/main.tsx','src/lib/office-ooxml.ts']){
  let s=readFileSync(new URL(name,root),'utf8');
  // Legacy default profile names remain recognizable without rewriting saved account records.
  s=s.replace("'مستخدم العمدة', 'Al OMDA AI user'",'');
  assert.ok(!/العمدة|العمده|Al OMDA AI|AL OMDA AI/.test(s),name);assert.ok(s.includes('AL OMDA Ai'),name);
 }
});

test('assistant byline preserves mixed-case product name',()=>{
 const css=readFileSync(new URL('src/index.css',root),'utf8');
 assert.match(css,/\.chat-message\.assistant>strong\{text-transform:none\}/);
});
