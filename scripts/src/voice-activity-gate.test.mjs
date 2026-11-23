import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceActivityGate,speechBandRatio} from '../../artifacts/al-omda-ai/src/lib/voice-activity-gate.ts';
test('silence and steady background noise never open a speaking turn',()=>{
 for(const rms of [0,.0001,.0015,.004,.012,.03]){
  const gate=new VoiceActivityGate();
  for(let i=0;i<200;i++)assert.equal(gate.process(rms,85),false);
 }
});
test('a brief click does not count as sustained speech',()=>{
 const gate=new VoiceActivityGate();for(let i=0;i<10;i++)gate.process(.001,85);
 assert.equal(gate.process(.2,85),false);assert.equal(gate.process(.001,85),false);
});
test('sustained voice above the calibrated floor is accepted',()=>{
 const gate=new VoiceActivityGate();for(let i=0;i<10;i++)gate.process(.001,85);
 assert.equal(gate.process(.02,85),false);assert.equal(gate.process(.02,85),false);assert.equal(gate.process(.02,85),false);assert.equal(gate.process(.02,85),true);
 gate.reset();assert.equal(gate.voicedMs,0);
});

test('speech-band check rejects low-frequency rumble and high-frequency hiss',()=>{
 const low=new Uint8Array(128);low[1]=200;assert.equal(speechBandRatio(low,48000,256),0);
 const high=new Uint8Array(128);high[100]=200;assert.equal(speechBandRatio(high,48000,256),0);
 const speech=new Uint8Array(128);speech[8]=200;assert.equal(speechBandRatio(speech,48000,256),1);
});
