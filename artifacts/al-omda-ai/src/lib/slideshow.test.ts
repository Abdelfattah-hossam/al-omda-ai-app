import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVideoMime,createSupportedVideoRecorder,slideshowElapsed} from './slideshow.js';
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

test('a first animation timestamp before recorder start cannot select frame minus one',()=>{
 assert.equal(slideshowElapsed(99,100,3000),0);
 assert.equal(slideshowElapsed(3101,100,3000),3000);
 assert.equal(slideshowElapsed(1100,100,3000),1000);
});
