import{readFileSync}from'node:fs';import test from'node:test';import assert from'node:assert/strict';
const root=new URL('../../native/',import.meta.url);
test('desktop remote content has no Node bridge or insecure renderer',()=>{
 const s=readFileSync(new URL('desktop/main.cjs',root),'utf8');for(const term of ['nodeIntegration:false','contextIsolation:true','sandbox:true','webSecurity:true',"action:'deny'",'will-navigate','will-attach-webview'])assert.ok(s.includes(term),term);assert.ok(!s.includes('preload:'));assert.ok(!s.includes('executeJavaScript('));
});
test('Android wrapper allows only HTTPS app origin and no native JS interface',()=>{
 const s=readFileSync(new URL('android/app/src/main/java/ai/alomda/app/MainActivity.java',root),'utf8');for(const term of ['setAllowFileAccess(false)','setAllowContentAccess(false)','MIXED_CONTENT_NEVER_ALLOW','getOrigin()','ACTION_CREATE_DOCUMENT','RESOURCE_AUDIO_CAPTURE','RESOURCE_VIDEO_CAPTURE'])assert.ok(s.includes(term),term);assert.ok(!s.includes('addJavascriptInterface'));
 const manifest=readFileSync(new URL('android/app/src/main/AndroidManifest.xml',root),'utf8');assert.ok(manifest.includes('usesCleartextTraffic="false"'));assert.ok(manifest.includes('allowBackup="false"'));
});
