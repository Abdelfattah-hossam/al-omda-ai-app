import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVideoMime,createSupportedVideoRecorder,slideshowElapsed,slideshowRecordingElapsed,finalizeVideoDuration,firstWebmClusterOffset} from './slideshow.js';
test('video export chooses MP4 when the browser supports it, not by renaming WebM',()=>{
 assert.equal(chooseVideoMime(type=>type==='video/mp4'),'video/mp4');
 assert.equal(chooseVideoMime(type=>type==='video/webm'),'video/webm');
 assert.equal(chooseVideoMime(()=>false),null);
});

test('narrated MP4 explicitly requires AAC for device compatibility, otherwise uses real WebM',()=>{
 assert.equal(chooseVideoMime(()=>true,true),'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
 assert.equal(chooseVideoMime(type=>type==='video/mp4'||type==='video/webm',true),'video/webm');
 assert.equal(chooseVideoMime(type=>type==='video/mp4',true),null);
});

test('recorder constructor failure falls back even when the browser claims codec support',()=>{
 const attempts:string[]=[];
 const result=createSupportedVideoRecorder(()=>true,type=>{attempts.push(type);if(type.includes('mp4a'))throw new Error('encoder unavailable');return {type};},true);
 assert.equal(result?.type,'video/webm;codecs=vp8,opus');assert.equal(attempts.length,2);
 assert.equal(createSupportedVideoRecorder(()=>true,()=>{throw new Error('no encoder');},true),null);
});

test('recording timeline waits for actual recorder readiness while frames keep rendering',()=>{
 assert.equal(slideshowRecordingElapsed(900,0,null,6000),0);
 assert.equal(slideshowRecordingElapsed(1900,0,900,6000),1000);
 assert.equal(slideshowRecordingElapsed(7000,0,900,6000),6000);
 assert.throws(()=>slideshowRecordingElapsed(5001,0,null,6000));
});
test('WebM finalization writes real six-second duration metadata and leaves MP4 alone',async()=>{
 const globalReader=globalThis as unknown as {FileReader?:unknown};const original=globalReader.FileReader;
 globalReader.FileReader=class {result:ArrayBuffer|null=null;onloadend:(()=>void)|null=null;readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
 try {
  const source=new Blob([new Uint8Array([0x18,0x53,0x80,0x67,0x8c,0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40])],{type:'video/webm'});
  const fixed=await finalizeVideoDuration(source,6000);const bytes=new Uint8Array(await fixed.arrayBuffer());
  const index=bytes.findIndex((value,i)=>value===0x44&&bytes[i+1]===0x89);
  assert.ok(index>=0);assert.equal(bytes[index+2],0x88);assert.equal(new DataView(bytes.buffer).getFloat64(index+3),6000);assert.equal(fixed.type,'video/webm');
  const clusterBytes=new Uint8Array([0x1f,0x43,0xb6,0x75,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xe7,0x81,0]);
  const metadata=new Uint8Array([0x18,0x53,0x80,0x67,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40]);
  const recording=new Blob([metadata,clusterBytes,clusterBytes],{type:'video/webm'});const finalized=new Uint8Array(await (await finalizeVideoDuration(recording,6000)).arrayBuffer());
  const clusterAt=firstWebmClusterOffset(finalized);assert.ok(clusterAt!==null);assert.deepEqual(finalized.slice(clusterAt),new Uint8Array([...clusterBytes,...clusterBytes]));
  assert.equal(firstWebmClusterOffset(new Uint8Array([0,1,2])),null);
  const mp4=new Blob(['fixture'],{type:'video/mp4'});assert.equal(await finalizeVideoDuration(mp4,6000),mp4);assert.equal(await finalizeVideoDuration(source,NaN),source);
 } finally {if(original===undefined)delete globalReader.FileReader;else globalReader.FileReader=original;}
});
test('a first animation timestamp before recorder start cannot select frame minus one',()=>{
 assert.equal(slideshowElapsed(99,100,3000),0);
 assert.equal(slideshowElapsed(3101,100,3000),3000);
 assert.equal(slideshowElapsed(1100,100,3000),1000);
});
