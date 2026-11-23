import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const voice=readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx','utf8');
const css=readFileSync('../artifacts/al-omda-ai/src/voice-experience.css','utf8');
test('voice visuals read actual microphone and PCM playback analysers',()=>{
 assert.ok(voice.includes('source.connect(mic)'));
 assert.ok(voice.includes('player.connect(outputAnalyserRef.current??context.destination)'));
 assert.ok(voice.includes('analyser.getByteFrequencyData(bins)'));
 assert.ok(voice.includes('pendingPcmPlaybackRef.current>0||freeSpeechCancelRef.current?output:mic'));
 assert.ok(voice.includes('cancelAnimationFrame(animationRef.current)'));
 assert.ok(voice.includes('micAnalyserRef.current?.disconnect()'));
 assert.ok(voice.includes('outputAnalyserRef.current?.disconnect()'));
});
test('voice has honest states and reduced-motion path without composer rules',()=>{
 for(const state of ['connecting','speaking','thinking','listening','idle'])assert.ok(voice.includes('"'+state+'"'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.doesNotMatch(css,/ai-chat-composer|chat-messages|(?:^|[;{\s])scroll-behavior\s*:/);
 assert.ok(voice.includes('freeSpeechCancelRef.current?.()'));
});
test('iOS audio unlock runs in tap before asynchronous permission and token work',()=>{
 const start=voice.slice(voice.indexOf('const start = async'));
 assert.ok(start.indexOf('new AudioContextClass()')<start.indexOf('await navigator.mediaDevices.getUserMedia'));
 assert.ok(start.indexOf('const resumed = context.resume()')<start.indexOf('await navigator.mediaDevices.getUserMedia'));
 assert.ok(start.indexOf('Prove the input graph')<start.indexOf('fetch("/api/ai/live-token"'));
 assert.ok(voice.includes('context.state !== "running"'));
 assert.ok(voice.includes('No microphone samples arrived'));
 assert.ok(voice.includes("name==='NotAllowedError'"));
 assert.ok(voice.includes('The microphone is supplying silent frames'));
 assert.ok(voice.includes('event.outputBuffer.getChannelData(0).fill(0)'));
});
test('Safari orb is native SVG, without CSS blend or conic clipping layers',()=>{
 assert.ok(voice.includes('<svg className="omda-voice-orb"'));
 assert.ok(voice.includes('<radialGradient'));
 assert.doesNotMatch(css,/mix-blend-mode|conic-gradient|filter:saturate/);
 assert.ok(css.includes('.ai-chat-live-backdrop{position:fixed!important;inset:0!important'));
});
const chat=readFileSync('../artifacts/al-omda-ai/src/AIChat.tsx','utf8');
test('dictation waits for native start, times out and explains Safari abort',()=>{
 assert.ok(chat.includes('recognition.onstart='));
 assert.ok(chat.includes('window.clearTimeout(voiceStartTimerRef.current)'));
 assert.ok(chat.includes('Safari did not start dictation'));
 assert.ok(chat.includes('Safari aborted dictation'));
 assert.ok(chat.includes('if(!event.results[index]?.isFinal)continue'));
 assert.ok(chat.includes('className="ai-dictation-status" role="status"'));
});

test('iPhone capture keeps routing diagnostics and explicit noise gate',()=>{
 assert.ok(voice.includes('turnArmedRef.current && gateRef.current.process'));
 assert.ok(voice.includes('if(!validTurnRef.current)return'));
 assert.ok(voice.includes('Listening automatically.'));
 assert.ok(voice.includes('if(!assistantResponseActiveRef.current)resumeListening()'));
 assert.ok(voice.includes('pendingPcmPlaybackRef.current>0||freeSpeechCancelRef.current'));
 assert.ok(!voice.includes('Tap New speaking turn'));
 assert.ok(voice.includes('Only transcribe actual intelligible speech'));
 assert.ok(voice.includes('noiseSuppression:{ideal:true}'));
 assert.ok(voice.includes('autoGainControl:{ideal:false}'));
 assert.ok(voice.includes('silenceDurationRef.current >= 650'));
 assert.ok(!voice.includes('Finish speaking turn now'));
 assert.ok(!voice.includes('voice-capture-diagnostic'));
 assert.ok(voice.includes('autoStartedRef.current=true;void start()'));
 assert.ok(chat.includes('onClick={openLiveVoice}'));
 assert.ok(chat.includes('const context:AudioContext=new AudioContextClass()'));
 assert.ok(voice.includes("document.visibilityState==='hidden'"));
 assert.ok(voice.includes("audioSession.type='play-and-record'"));
 assert.ok(voice.includes('mic.connect(silent)'));
 assert.ok(voice.includes('track?.muted'));
 assert.ok(voice.includes('peakInputRef.current.toFixed(5)'));
});

test('barge-in cancels current and queued playback and keeps permission safeguards',()=>{
 assert.ok(voice.includes('START_OF_ACTIVITY_INTERRUPTS'));assert.ok(voice.includes('for(const player of playersRef.current)'));assert.ok(voice.includes('player.stop()'));assert.ok(voice.includes('bargeGateRef.current.process'));assert.ok(voice.includes('preRollRef.current'));assert.ok(voice.includes('context.onstatechange='));assert.ok(voice.includes('if(!validTurnRef.current)return'));
});
