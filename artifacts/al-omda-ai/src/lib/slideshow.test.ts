import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVideoMime} from './slideshow.js';
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
