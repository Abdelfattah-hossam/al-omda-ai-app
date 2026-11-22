import assert from 'node:assert/strict';
import test from 'node:test';
import {sandboxedHtmlPreview} from './html-preview';
test('HTML preview preserves Unicode and scripts while blocking network and app access', () => {
 const html='<!doctype html><html><head><title>ساعة القراءة</title></head><body><script>setInterval(()=>{},1000)</script></body></html>';
 const result=sandboxedHtmlPreview(html);
 assert.ok(result.startsWith('<!doctype html><meta charset="utf-8">'));
 assert.ok(result.includes('ساعة القراءة'));
 assert.ok(result.includes("connect-src 'none'"));
 assert.ok(result.includes("frame-src 'none'"));
 assert.ok(result.includes('setInterval'));
});
