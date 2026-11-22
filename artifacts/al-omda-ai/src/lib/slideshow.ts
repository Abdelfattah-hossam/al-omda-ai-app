export type SlideshowFrame = { src: string; caption: string };

export function chooseVideoMime(supports: (type: string) => boolean): string | null {
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(supports) ?? null;
}

export async function createSlideshow(frames: SlideshowFrame[], seconds: number, audio: File | null, onProgress: (value: number) => void): Promise<Blob> {
  if (!frames.length || frames.length > 8) throw new Error('اختر من صورة واحدة إلى 8 صور.');
  if (typeof MediaRecorder === 'undefined') throw new Error('هذا المتصفح لا يدعم تسجيل الفيديو. استخدم متصفحًا أحدث.');
  const mimeType = chooseVideoMime(type => MediaRecorder.isTypeSupported(type));
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
    const activeRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
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
    activeRecorder.start(500);
    source?.start();
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const frame = (now: number) => {
        try {
          if (recordingError) throw recordingError;
          const elapsed = Math.min(duration, now - start);
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
    return blob;
  } finally {
    cancelAnimationFrame(animation);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    try { source?.stop(); } catch { /* already stopped */ }
    stream.getTracks().forEach(track => track.stop());
    await audioContext?.close();
  }
}
