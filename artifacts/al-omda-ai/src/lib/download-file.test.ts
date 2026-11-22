import test from "node:test";
import assert from "node:assert/strict";
import { detectIosDevice, downloadBlobAsFile } from "./download-file";
import {serializeCsv} from './csv-export';
import {loadAssetPages} from './asset-pages';
import {loadSearchFolders} from './workspace-search';
import {readFileSync} from 'node:fs';

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.1";
const DESKTOP_MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

test("detects iPhone and iPad user agents", () => {
  assert.equal(detectIosDevice(IPHONE_UA, "iPhone", 5), true);
  assert.equal(detectIosDevice(IPAD_UA, "iPad", 5), true);
});

test("detects iPadOS desktop-mode Safari (MacIntel with touch)", () => {
  assert.equal(detectIosDevice(IPADOS_DESKTOP_UA, "MacIntel", 5), true);
});

test("does not flag desktop or Android browsers", () => {
  assert.equal(detectIosDevice(DESKTOP_MAC_UA, "MacIntel", 0), false);
  assert.equal(detectIosDevice(WINDOWS_UA, "Win32", 0), false);
  assert.equal(detectIosDevice(ANDROID_UA, "Linux armv8l", 5), false);
});

test('CSV export uses a real BOM, CRLF rows, and CSV quoting',()=>{
 const csv=serializeCsv([['Metric','Value'],['عربي','a,"b"'],['Multiline','first\nsecond'],['Nullable',null]]);
 assert.equal(csv.charCodeAt(0),0xFEFF);
 assert.equal(csv,'\uFEFF"Metric","Value"\r\n"عربي","a,""b"""\r\n"Multiline","first\nsecond"\r\n"Nullable",""');
 assert.ok(!csv.includes('\\r\\n'));
});

async function withBrowser(navigatorValue:Record<string,unknown>,check:(state:{anchors:{name:string;url:string}[];timers:number[]})=>Promise<void>){
 const anchors:{name:string;url:string}[]=[];const timers:number[]=[];
 const patches:[object,string,unknown][]=[
  [globalThis,'navigator',navigatorValue],
  [globalThis,'window',{setTimeout:(_callback:()=>void,delay:number)=>{timers.push(delay);return 0;}}],
  [globalThis,'document',{body:{appendChild:()=>{}},createElement:()=>{const a={href:'',download:'',remove:()=>{},click:()=>anchors.push({name:a.download,url:a.href})};return a;}}],
  [URL,'createObjectURL',()=> 'blob:unit-test'],
 ];
 const originals=patches.map(([target,key])=>[target,key,Object.getOwnPropertyDescriptor(target,key)]as const);
 try{for(const[target,key,value]of patches)Object.defineProperty(target,key,{configurable:true,writable:true,value});await check({anchors,timers});}
 finally{for(const[target,key,descriptor]of originals){if(descriptor)Object.defineProperty(target,key,descriptor);else Reflect.deleteProperty(target,key);}}
}

test('iOS shares a real named file without opening a blob tab',async()=>{
 let shared:File|undefined;
 await withBrowser({userAgent:IPHONE_UA,platform:'iPhone',maxTouchPoints:5,canShare:()=>true,share:async(payload:{files:File[]})=>{shared=payload.files[0];}},async({anchors})=>{
  await downloadBlobAsFile(new Blob(['test'],{type:'application/test'}),'تقرير-اختبار.docx');
  assert.equal(shared?.name,'تقرير-اختبار.docx');assert.equal(shared?.type,'application/test');assert.equal(await shared?.text(),'test');assert.equal(anchors.length,0);
 });
});

test('iOS share cancellation does not trigger a second download',async()=>{
 await withBrowser({userAgent:IPHONE_UA,platform:'iPhone',maxTouchPoints:5,share:async()=>{throw new DOMException('Cancelled','AbortError');}},async({anchors})=>{
  await downloadBlobAsFile(new Blob(['test']),'cancelled.csv');assert.equal(anchors.length,0);
 });
});

test('iOS unavailable or rejected sharing keeps a named download fallback',async()=>{
 for(const share of [undefined,async()=>{throw new Error('Unavailable');}])await withBrowser({userAgent:IPHONE_UA,platform:'iPhone',maxTouchPoints:5,share},async({anchors,timers})=>{
  await downloadBlobAsFile(new Blob(['test']),'fallback.xlsx');assert.deepEqual(anchors,[{name:'fallback.xlsx',url:'blob:unit-test'}]);assert.deepEqual(timers,[1500]);
 });
});

test('desktop continues to download a named file directly',async()=>{
 await withBrowser({userAgent:WINDOWS_UA,platform:'Win32',maxTouchPoints:0},async({anchors})=>{
  await downloadBlobAsFile(new Blob(['test']),'report.pdf');assert.deepEqual(anchors,[{name:'report.pdf',url:'blob:unit-test'}]);
 });
});

test('workspace exports and search use the same named-file delivery path',()=>{
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const search=app.slice(app.indexOf('const downloadCommandAsset ='),app.indexOf('const label ='));
 assert.match(search,/await downloadBlobAsFile\(blob,asset.name\)/);
 assert.ok(!search.includes('createObjectURL'));
 assert.ok(!app.includes('link.download ='));
 assert.ok(!app.includes(".join('\\\\r\\\\n')"));
 assert.ok(!app.includes("tasks.filter(task=>!task.demo).slice(0,15)"));
});

test('asset pagination reads every page, including an empty final page',async()=>{
 for(const count of [0,99,100,200,201]){
  const fixture=Array.from({length:count},(_,i)=>i);const offsets:number[]=[];
  const found=await loadAssetPages(async offset=>{offsets.push(offset);return fixture.slice(offset,offset+100);});
  assert.deepEqual(found,fixture);assert.equal(offsets.length,Math.floor(count/100)+1);
 }
});

test('asset pagination cancels before scheduling more reads and rejects partial failures',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(loadAssetPages(async()=>{calls++;controller.abort();return Array.from({length:100},(_,i)=>i);},controller.signal),{name:'AbortError'});
 assert.equal(calls,1);
 await assert.rejects(loadAssetPages(async offset=>{if(offset===100)throw new Error('Synthetic later-page failure');return Array.from({length:100},(_,i)=>i);}),/later-page failure/);
});

test('global file lookup visits older folders with at most four active requests',async()=>{
 const folders=Array.from({length:24},(_,i)=>({url:'/folder/'+i,projectId:String(i)}));
 let active=0,maxActive=0;
 const found=await loadSearchFolders(folders,async folder=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return [folder.projectId];});
 assert.deepEqual(found,folders.map(x=>x.projectId));assert.equal(maxActive,4);assert.ok(found.includes('23'));
});

test('global file lookup isolates folder failures and stops scheduling after close',async()=>{
 const folders=Array.from({length:8},(_,i)=>({url:'/folder/'+i,projectId:String(i)}));
 const found=await loadSearchFolders(folders,async folder=>{if(folder.projectId==='3')throw new Error('Synthetic folder failure');return [folder.projectId];});
 assert.deepEqual(found,['0','1','2','4','5','6','7']);
 let keepGoing=true,requested=0;
 await loadSearchFolders(folders,async()=>{requested++;keepGoing=false;return [];},()=>keepGoing);
 assert.equal(requested,1);
});
