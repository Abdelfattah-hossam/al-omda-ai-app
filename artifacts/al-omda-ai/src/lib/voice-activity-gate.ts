// Client-side noise gate. A fresh user-armed turn calibrates before accepting speech.
export class VoiceActivityGate {
 calibrationMs=0; noise=0; consecutiveMs=0; voicedMs=0;
 reset(){this.calibrationMs=0;this.noise=0;this.consecutiveMs=0;this.voicedMs=0;}
 process(rms:number,durationMs:number){
  if(!Number.isFinite(rms)||rms<0)return false;
  if(this.calibrationMs<600){this.noise=this.calibrationMs?this.noise*.8+rms*.2:rms;this.calibrationMs+=durationMs;return false;}
  const threshold=Math.max(.004,this.noise*3.2);
  if(rms>threshold){this.consecutiveMs+=durationMs;this.voicedMs+=durationMs;}
  else{this.consecutiveMs=0;if(this.voicedMs===0)this.noise=this.noise*.98+rms*.02;}
  return this.consecutiveMs>=250;
 }
}
