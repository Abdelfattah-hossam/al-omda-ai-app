import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVideoMime} from './slideshow.js';
test('video export chooses MP4 when the browser supports it, not by renaming WebM',()=>{
 assert.equal(chooseVideoMime(type=>type==='video/mp4'),'video/mp4');
 assert.equal(chooseVideoMime(type=>type==='video/webm'),'video/webm');
 assert.equal(chooseVideoMime(()=>false),null);
});
