import {versionOfflineWorker} from '../../artifacts/al-omda-ai/build/offline-cache-version.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../artifacts/al-omda-ai/public/service-worker.js',import.meta.url),'utf8');
test('asset-only deploys change the worker script and cache version, not just the manifest',()=>{
 const first=versionOfflineWorker(source,'assets/chat-a.js');const second=versionOfflineWorker(source,'assets/chat-b.js');
 assert.notEqual(first,second);assert.equal(first,versionOfflineWorker(source,'assets/chat-a.js'));assert.ok(!first.includes('__OMDA_ASSET_VERSION__'));assert.match(first,/al-omda-shell-v7-munjizly-[a-f0-9]{16}/);
 assert.throws(()=>versionOfflineWorker('missing marker','assets'));
});
async function assetRequest(cachedType:string, networkType:string) {
 const listeners:Record<string,(event:any)=>void>={};let removed=false;let fetched=false;let response:Promise<Response>|undefined;
 const request={url:'https://app.test/assets/old-bundle.js',method:'GET',mode:'cors'};
 vm.runInNewContext(source,{self:{location:{origin:'https://app.test'},addEventListener:(name:string,fn:(event:any)=>void)=>listeners[name]=fn},caches:{match:async()=>new Response('cached',{headers:{'content-type':cachedType}}),open:async()=>({delete:async()=>{removed=true;},put:async()=>{}})},fetch:async()=>{fetched=true;return new Response('network',{headers:{'content-type':networkType}});},URL,Response});
 listeners.fetch({request,respondWith:(value:Promise<Response>)=>{response=value;}});
 return {result:await response!,removed:()=>removed,fetched:()=>fetched};
}
test('missing old bundles never cache or serve SPA HTML as JavaScript',async()=>{
 const state=await assetRequest('text/html','text/html');assert.equal(state.result.type,'error');assert.equal(state.removed(),true);assert.equal(state.fetched(),true);
});
test('cached JavaScript stays available offline without fetching',async()=>{
 const state=await assetRequest('application/javascript','text/html');assert.equal(await state.result.text(),'cached');assert.equal(state.fetched(),false);
});
test('invalid cached asset recovers when the network has real JavaScript',async()=>{
 const state=await assetRequest('text/html','application/javascript');assert.equal(await state.result.text(),'network');assert.equal(state.removed(),true);
});
test('first install caches entry and lazy routes before claiming offline readiness',async()=>{
 const listeners:Record<string,(event:any)=>void>={};const batches:string[][]=[];let work:Promise<void>|undefined;let ready=false;
 vm.runInNewContext(source,{self:{addEventListener:(name:string,fn:(event:any)=>void)=>listeners[name]=fn,skipWaiting:async()=>{ready=true;}},caches:{open:async()=>({addAll:async(paths:string[])=>{batches.push(paths);}})},fetch:async()=>({ok:true,json:async()=>({entry:{file:'assets/main.js',css:['assets/main.css']},chat:{file:'assets/chat.js'},private:{file:'api/history'}})})});
 listeners.install({waitUntil:(promise:Promise<void>)=>{work=promise;}});await work;
 assert.equal(ready,true);assert.ok(batches[1].includes('/assets/main.js'));assert.ok(batches[1].includes('/assets/chat.js'));assert.ok(batches[1].includes('/assets/main.css'));assert.ok(!batches.flat().includes('/api/history'));
});
test('private API responses never enter the offline shell cache',()=>{
 const listeners:Record<string,(event:any)=>void>={};let intercepted=false;
 vm.runInNewContext(source,{self:{location:{origin:'https://app.test'},addEventListener:(name:string,fn:(event:any)=>void)=>listeners[name]=fn},URL});
 listeners.fetch({request:{url:'https://app.test/api/ai/conversations',method:'GET',mode:'cors'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});

test('NEXUS B identity is consistent across metadata, install names, icons and preserved originals',()=>{
 const root=new URL('../../artifacts/al-omda-ai/',import.meta.url);
 const html=readFileSync(new URL('index.html',root),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('public/manifest.webmanifest',root),'utf8'));
 assert.match(html,/<title>[^<]*Munjizly[^<]*<\/title>/);
 for(const name of ['og:title','twitter:title']) assert.ok(html.includes(`${name}" content="Munjizly"`));
 assert.equal(manifest.name,'Munjizly');assert.equal(manifest.short_name,'Munjizly');
 assert.match(html,/apple-touch-icon/);assert.match(html,/munjizly-social\.png/);assert.ok(!html.includes('?v=nexusB1?v='));
 for(const item of manifest.icons) assert.ok(readFileSync(new URL('public'+item.src.split('?')[0],root)).length>100);
 for(const name of ['al-omda-mark.svg','al-omda-lockup.svg','al-omda-icon-maskable.svg']){
  const current=readFileSync(new URL('public/brand/'+name,root),'utf8');
  const original=readFileSync(new URL('public/brand/archive-before-nexus-20261123/'+name,root),'utf8');
  assert.notEqual(current,original);assert.match(current,/Munjizly/);assert.ok(!current.includes('#c48e34'));
 }
});
