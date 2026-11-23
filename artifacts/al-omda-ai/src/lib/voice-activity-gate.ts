// Client-side noise gate. A fresh listening turn calibrates before accepting speech.
export class VoiceActivityGate {
 calibrationMs=0; noise=0; consecutiveMs=0; voicedMs=0;
 reset(){this.calibrationMs=0;this.noise=0;this.consecutiveMs=0;this.voicedMs=0;}
 process(rms:number,durationMs:number){
  if(!Number.isFinite(rms)||rms<0)return false;
  if(this.calibrationMs<600){this.noise=this.calibrationMs?this.noise*.8+rms*.2:rms;this.calibrationMs+=durationMs;return false;}
  const threshold=Math.max(.006,this.noise*4);
  if(rms>threshold){this.consecutiveMs+=durationMs;this.voicedMs+=durationMs;}
  else{this.consecutiveMs=0;if(this.voicedMs===0)this.noise=this.noise*.98+rms*.02;}
  return this.consecutiveMs>=300;
 }
}

export function speechBandRatio(bins:Uint8Array,sampleRate:number,fftSize:number):number{
 let speech=0,total=0;
 for(let i=1;i<bins.length;i++){const hz=i*sampleRate/fftSize;const energy=bins[i]*bins[i];total+=energy;if(hz>=250&&hz<=3600)speech+=energy;}
 return total>0?speech/total:0;
}
