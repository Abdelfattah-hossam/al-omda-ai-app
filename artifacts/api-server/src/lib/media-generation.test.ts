import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaImageError,parseGeneratedJpeg} from './media-generation.js';
import {getWorkspaceAssetMimeType} from './storage-assets.js';
test('free quota failures are graceful and never select a paid fallback',()=>{
 for(const message of ['3036 allocation exceeded','429 rate limit','daily quota'])assert.equal(mediaImageError(new Error(message),true).status,429);
 assert.equal(mediaImageError(new Error('offline'),false).status,503);
});
test('validates generated image payload signatures and bounds',()=>{
 const bytes=Buffer.alloc(150,0);bytes[0]=255;bytes[1]=216;bytes[2]=255;
 assert.equal(parseGeneratedJpeg({image:bytes.toString('base64')}),bytes.toString('base64'));
 for(const value of [null,{}, {image:'bad'}, {image:Buffer.alloc(150).toString('base64')}])assert.equal(parseGeneratedJpeg(value),null);
});
test('video artifacts use real matching MIME types',()=>{
 assert.equal(getWorkspaceAssetMimeType('clip.mp4'),'video/mp4');assert.equal(getWorkspaceAssetMimeType('clip.webm'),'video/webm');
});
