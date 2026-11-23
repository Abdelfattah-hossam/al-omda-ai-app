/** Conservative residual-input gate after browser echo cancellation,not speaker ID. */
export class VoiceBargeInGate {
 voicedMs=0;noise=.002;
 reset(){this.voicedMs=0;}
 process(rms:number,speechLike:boolean,durationMs:number,outputRms:number){
  const threshold=Math.max(.018,this.noise*4,outputRms*.65);
  if(!speechLike||rms<threshold){this.voicedMs=0;this.noise=this.noise*.98+Math.min(rms,.01)*.02;return false;}
  this.voicedMs+=durationMs;return this.voicedMs>=300;
 }
}
