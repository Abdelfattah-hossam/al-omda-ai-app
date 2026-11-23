import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const voice=readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx','utf8');
const css=readFileSync('../artifacts/al-omda-ai/src/voice-experience.css','utf8');
test('voice visuals read actual microphone and PCM playback analysers',()=>{
 assert.ok(voice.includes('source.connect(mic)'));
 assert.ok(voice.includes('player.connect(outputAnalyserRef.current??context.destination)'));
 assert.ok(voice.includes('analyser.getByteFrequencyData(bins)'));
 assert.ok(voice.includes('pendingPcmPlaybackRef.current>0?output:mic'));
 assert.ok(voice.includes('cancelAnimationFrame(animationRef.current)'));
 assert.ok(voice.includes('micAnalyserRef.current?.disconnect()'));
 assert.ok(voice.includes('outputAnalyserRef.current?.disconnect()'));
});
test('voice has honest states and reduced-motion path without composer rules',()=>{
 for(const state of ['connecting','speaking','thinking','listening','idle'])assert.ok(voice.includes('"'+state+'"'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.doesNotMatch(css,/ai-chat-composer|chat-messages|scroll-behavior/);
 assert.ok(voice.includes('if(fallbackUtteranceRef.current)bins.fill(0)'));
});
