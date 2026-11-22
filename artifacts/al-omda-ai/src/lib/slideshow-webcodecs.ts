// Explicit frame timestamps avoid real-time capture dropping the end of a
// slideshow when a browser or encoder is busy. Older browsers keep the
// MediaRecorder fallback in slideshow.ts.
export function slideshowFrameTimes(durationSeconds:number,fps=24):Array<{timestamp:number;duration:number}> {
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isInteger(fps)||fps<1)throw new Error('Invalid slideshow timeline');
 return Array.from({length:Math.ceil(durationSeconds*fps)},(_,index)=>({timestamp:index/fps,duration:Math.min(1/fps,durationSeconds-index/fps)}));
}

export async function encodeSlideshowFrames(canvas:HTMLCanvasElement,draw:(elapsedMs:number)=>void,durationMs:number,audio:File|null,onProgress:(value:number)=>void):Promise<Blob|null> {
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined'||(audio&&typeof AudioEncoder==='undefined'))return null;
 const {Output,BufferTarget,CanvasSource,AudioBufferSource,Mp4OutputFormat,WebMOutputFormat,canEncodeVideo,canEncodeAudio}=await import('mediabunny');
 let context:AudioContext|null=null;
 let output:InstanceType<typeof Output>|null=null;
 let finalized=false;
 try {
  let buffer:AudioBuffer|null=null;
  if(audio){
   context=new AudioContext();
   const decoded=await context.decodeAudioData(await audio.arrayBuffer());
   const length=Math.min(decoded.length,Math.ceil(durationMs/1000*decoded.sampleRate));
   if(length===decoded.length)buffer=decoded;
   else {buffer=context.createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);for(let channel=0;channel<decoded.numberOfChannels;channel++)buffer.copyToChannel(decoded.getChannelData(channel).subarray(0,length),channel);}
  }
  const audioOptions=buffer?{numberOfChannels:buffer.numberOfChannels,sampleRate:buffer.sampleRate}:{};
  const videoOptions={width:canvas.width,height:canvas.height,frameRate:24,bitrate:2_000_000};
  const mp4=await canEncodeVideo('avc',videoOptions)&&(!buffer||await canEncodeAudio('aac',audioOptions));
  if(!mp4&&!(await canEncodeVideo('vp8',videoOptions)&&(!buffer||await canEncodeAudio('opus',audioOptions))))return null;
  const target=new BufferTarget();
  output=new Output({target,format:mp4?new Mp4OutputFormat():new WebMOutputFormat()});
  const video=new CanvasSource(canvas,{codec:mp4?'avc':'vp8',bitrate:2_000_000});
  output.addVideoTrack(video,{frameRate:24});
  const sound=buffer?new AudioBufferSource({codec:mp4?'aac':'opus',bitrate:128_000}):null;
  if(sound)output.addAudioTrack(sound);
  await output.start();
  const schedule=slideshowFrameTimes(durationMs/1000);
  for(let index=0;index<schedule.length;index++){
   const frame=schedule[index];draw(frame.timestamp*1000);
   await video.add(frame.timestamp,frame.duration,{keyFrame:index%48===0});
   onProgress(Math.round((index+1)/schedule.length*95));
  }
  video.close();
  if(sound&&buffer){await sound.add(buffer);sound.close();}
  await output.finalize();finalized=true;
  if(!target.buffer?.byteLength)throw new Error('الفيديو الناتج فارغ.');
  if(target.buffer.byteLength>25*1024*1024)throw new Error('الفيديو أكبر من حد الحفظ 25 ميجابايت. قلل عدد الصور أو مدتها.');
  onProgress(100);
  return new Blob([target.buffer],{type:mp4?'video/mp4':'video/webm'});
 } finally {
  if(output&&!finalized)await output.cancel();
  await context?.close();
 }
}
