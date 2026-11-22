import { fixWebmDuration } from '@fix-webm-duration/fix';

// Only rewrite the small metadata header. The parser intentionally treats
// Clusters as opaque data, so rewriting them can turn an unknown-size Cluster
// into a finite one containing later Clusters. Keep recorded packets untouched.
export function firstWebmClusterOffset(bytes:Uint8Array):number|null {
  const read = (start:number) => {
    if (start>=bytes.length || bytes[start]===0) return null;
    let idWidth=1;while(idWidth<=4 && !(bytes[start]&(1<<(8-idWidth))))idWidth++;
    if(idWidth>4 || start+idWidth>=bytes.length)return null;
    let id=0;for(let i=0;i<idWidth;i++)id=id*256+bytes[start+i];
    const sizeAt=start+idWidth;let width=1;
    while(width<=8 && !(bytes[sizeAt]&(1<<(8-width))))width++;
    if(width>8 || sizeAt+width>bytes.length)return null;
    let size=BigInt(bytes[sizeAt]&((1<<(8-width))-1));
    for(let i=1;i<width;i++)size=size*256n+BigInt(bytes[sizeAt+i]);
    const unknown=size===(1n<<BigInt(7*width))-1n;
    if(!unknown && size>BigInt(Number.MAX_SAFE_INTEGER))return null;
    return {id,payload:sizeAt+width,size:unknown?null:Number(size)};
  };
  let cursor=0;
  while(cursor<bytes.length){
    const item=read(cursor);if(!item)return null;
    if(item.id===0x18538067){
      cursor=item.payload;
      while(cursor<bytes.length){
        const child=read(cursor);if(!child)return null;
        if(child.id===0x1f43b675)return cursor;
        if(child.size===null)return null;
        cursor=child.payload+child.size;
      }
      return null;
    }
    if(item.size===null)return null;
    cursor=item.payload+item.size;
  }
  return null;
}
export async function finalizeVideoDuration(blob:Blob,durationMs:number):Promise<Blob> {
  if (!blob.type.startsWith('video/webm') || !Number.isFinite(durationMs) || durationMs <= 0) return blob;
  const cluster=firstWebmClusterOffset(new Uint8Array(await blob.arrayBuffer()));
  if(cluster===null)return fixWebmDuration(blob,durationMs,{logger:false});
  const header=await fixWebmDuration(blob.slice(0,cluster,blob.type),durationMs,{logger:false});
  return new Blob([header,blob.slice(cluster)],{type:blob.type});
}
export function slideshowRecordingElapsed(now:number,requestedAt:number,startedAt:number|null,duration:number):number {
  if (startedAt === null) {
    if (now-requestedAt > 5000) throw new Error('تعذر بدء تسجيل الفيديو. جرّب متصفحًا آخر.');
    return 0;
  }
  return slideshowElapsed(now,startedAt,duration);
}
export function slideshowElapsed(now:number,start:number,duration:number):number {
  return Math.max(0,Math.min(duration,now-start));
}
export type SlideshowFrame = { src: string; caption: string };

function videoMimeCandidates(withAudio:boolean):string[]{
  return withAudio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
}
export function chooseVideoMime(supports:(type:string)=>boolean,withAudio=false):string|null {
  return videoMimeCandidates(withAudio).find(supports)??null;
}
export function createSupportedVideoRecorder<T>(supports:(type:string)=>boolean,create:(type:string)=>T,withAudio=false):T|null {
  for(const type of videoMimeCandidates(withAudio)){
    if(!supports(type))continue;
    // Some browsers report AAC support but cannot initialize its encoder.
    try{return create(type);}catch{/* try the next real container/codec */}
  }
  return null;
}

export async function createSlideshow(frames: SlideshowFrame[], seconds: number, audio: File | null, onProgress: (value: number) => void): Promise<Blob> {
  if (!frames.length || frames.length > 8) throw new Error('اختر من صورة واحدة إلى 8 صور.');
  if (typeof MediaRecorder === 'undefined') throw new Error('هذا المتصفح لا يدعم تسجيل الفيديو. استخدم متصفحًا أحدث.');
  const mimeType = chooseVideoMime(type => MediaRecorder.isTypeSupported(type), Boolean(audio));
  if (!mimeType) throw new Error('لا توجد صيغة فيديو مدعومة في هذا المتصفح.');
  const images = await Promise.all(frames.map(frame => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر قراءة إحدى الصور.'));
    img.src = frame.src;
  })));
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.captureStream) throw new Error('تسجيل لوحة الرسم غير مدعوم.');
  const stream = canvas.captureStream(24);
  let audioContext: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let recorder: MediaRecorder | null = null;
  let animation = 0;
  try {
    if (audio) {
      audioContext = new AudioContext();
      await audioContext.resume();
      const buffer = await audioContext.decodeAudioData(await audio.arrayBuffer());
      source = audioContext.createBufferSource();
      source.buffer = buffer;
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    }
    const activeRecorder = createSupportedVideoRecorder(type=>MediaRecorder.isTypeSupported(type),type=>new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:2_000_000}),Boolean(audio));
    if(!activeRecorder)throw new Error('تعذر تشغيل مسجل فيديو بهذه الصيغ في المتصفح. جرّب متصفحًا آخر أو صدّر دون صوت.');
    recorder = activeRecorder;
    const chunks: BlobPart[] = [];
    let recordingError: Error | null = null;
    const recorded = new Promise<Blob>(resolve => {
      activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onerror = () => { recordingError = new Error('فشل تسجيل الفيديو.'); };
      activeRecorder.onstop = () => resolve(new Blob(chunks, { type: activeRecorder.mimeType }));
    });
    const duration = Math.max(2, Math.min(10, seconds)) * frames.length * 1000;
    const draw = (elapsed: number) => {
      const index = Math.min(frames.length - 1, Math.floor(elapsed / (duration / frames.length)));
      const img = images[index];
      const local = (elapsed % (duration / frames.length)) / (duration / frames.length);
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * (1 + local * .07);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 720, 1280);
      ctx.drawImage(img, (720 - img.width * scale) / 2, (1280 - img.height * scale) / 2, img.width * scale, img.height * scale);
      const caption = frames[index].caption.trim();
      if (caption) {
        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.fillRect(0, 990, 720, 250);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 38px Arial';
        ctx.textAlign = 'center';
        ctx.direction = /[\u0600-\u06ff]/.test(caption) ? 'rtl' : 'ltr';
        const lines: string[] = [];
        let line = '';
        for (const word of caption.split(/\s+/)) {
          if (ctx.measureText(line + ' ' + word).width > 640 && line) { lines.push(line); line = word; }
          else line += (line ? ' ' : '') + word;
        }
        if (line) lines.push(line);
        lines.slice(0, 4).forEach((value, i) => ctx.fillText(value, 360, 1040 + i * 48));
      }
      onProgress(Math.min(100, Math.round(elapsed / duration * 100)));
    };
    draw(0);
    let recordingStartedAt: number | null = null;
    activeRecorder.onstart = () => { recordingStartedAt = performance.now(); };
    activeRecorder.start(500);
    source?.start();
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const frame = (now: number) => {
        try {
          if (recordingError) throw recordingError;
          const elapsed = slideshowRecordingElapsed(now,start,recordingStartedAt,duration);
          draw(elapsed);
          if (elapsed >= duration) { resolve(); return; }
          animation = requestAnimationFrame(frame);
        } catch (error) { reject(error); }
      };
      animation = requestAnimationFrame(frame);
    });
    if (recordingError) throw recordingError;
    activeRecorder.stop();
    const blob = await recorded;
    if (!blob.size) throw new Error('الفيديو الناتج فارغ.');
    if (blob.size > 25 * 1024 * 1024) throw new Error('الفيديو أكبر من حد الحفظ 25 ميجابايت. قلل عدد الصور أو مدتها.');
    return finalizeVideoDuration(blob,duration);
  } finally {
    cancelAnimationFrame(animation);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    try { source?.stop(); } catch { /* already stopped */ }
    stream.getTracks().forEach(track => track.stop());
    await audioContext?.close();
  }
}
