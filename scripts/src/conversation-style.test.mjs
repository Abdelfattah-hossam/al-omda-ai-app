import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const api=readFileSync('../artifacts/api-server/src/routes/ai.ts','utf8');
const voice=readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx','utf8');
const free=readFileSync('../artifacts/al-omda-ai/src/lib/free-speech.ts','utf8');
test('all provider paths share dialect-matching and terse correction guidance',()=>{
 for(const phrase of ['all Arabic dialects','Mirror the user','ظبط الشات','عدل','لا','one short clarifier','Required JSON/file schemas'])assert.ok(api.includes(phrase),phrase);
 assert.ok((api.match(/systemPrompt\(isCodingRequest\(messages\), memory\)/g)||[]).length>=4);
 assert.ok(voice.includes('Mirror the dialect the user actually speaks'));
});
test('speech is free-first, labelled fallback, cancellable, and exact words',()=>{
 assert.ok(free.indexOf("fetch('/api/ai/speech'")<free.indexOf('new SpeechSynthesisUtterance'));
 assert.ok(free.includes("voice.lang.toLowerCase()==='ar-eg'"));
 assert.ok(free.includes('controller.abort()'));
 assert.ok(api.includes('fish-audio/s2.1-pro-free:free'));
 assert.ok(api.includes('Read only the supplied words'));
 assert.ok(voice.includes('Device fallback'));
 assert.ok(voice.includes('إزيك! أنا Munjizly، معاك. قولّي تحب نعمل إيه؟'));
});
test('device fallback ranks Egyptian and enhanced voices, not array order',async()=>{
 const {preferredDeviceVoice}=await import('../../artifacts/al-omda-ai/src/lib/free-speech.ts');
 const voices=[{name:'Basic Arabic',lang:'ar-SA'},{name:'Maged',lang:'ar-EG'},{name:'Maged Enhanced',lang:'ar-EG'},{name:'English',lang:'en-US'}];
 assert.equal(preferredDeviceVoice(voices,'ar-EG')?.name,'Maged Enhanced');
 assert.equal(preferredDeviceVoice(voices,'en-US')?.name,'English');
});
