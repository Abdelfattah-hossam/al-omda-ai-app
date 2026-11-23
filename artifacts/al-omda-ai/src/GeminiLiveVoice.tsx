import {VoiceActivityGate} from './lib/voice-activity-gate';
import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff } from "lucide-react";

type Props = {
  language: "ar" | "en";
  disabled?: boolean;
  onTranscript: (role: "user" | "assistant", text: string) => void;
};

function downsampleTo16k(input: Float32Array, sampleRate: number): Int16Array {
  if (sampleRate === 16000) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) output[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
    return output;
  }
  const ratio = sampleRate / 16000;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let total = 0;
    for (let j = start; j < end; j++) total += input[j];
    const sample = total / Math.max(1, end - start);
    output[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return output;
}

function toBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function GeminiLiveVoice({ language, disabled, onTranscript }: Props) {
  const ar = language === "ar";
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState("");
  const [thinking,setThinking]=useState(false);
  const [heardSpeech,setHeardSpeech]=useState(false);
  const [turnArmed,setTurnArmed]=useState(false);
  const turnArmedRef=useRef(false);
  const validTurnRef=useRef(false);
  const gateRef=useRef(new VoiceActivityGate());
  const captureTimerRef=useRef(0);
  const silentGainRef=useRef<GainNode|null>(null);
  const peakInputRef=useRef(0);
  const inputFramesRef=useRef(0);
  const [micDiagnostic,setMicDiagnostic]=useState('');
  const visualRef=useRef<HTMLDivElement|null>(null);
  const micAnalyserRef=useRef<AnalyserNode|null>(null);
  const outputAnalyserRef=useRef<AnalyserNode|null>(null);
  const animationRef=useRef(0);
  const stopVisualizer=()=>{
    cancelAnimationFrame(animationRef.current);
    micAnalyserRef.current?.disconnect();outputAnalyserRef.current?.disconnect();
    micAnalyserRef.current=null;outputAnalyserRef.current=null;
    silentGainRef.current?.disconnect();silentGainRef.current=null;
    visualRef.current?.style.setProperty('--voice-level','0');
    visualRef.current?.querySelectorAll<HTMLElement>('.voice-wave-bar').forEach(bar=>bar.style.setProperty('--bar-level','0'));
  };
  const startVisualizer=(context:AudioContext,source:MediaStreamAudioSourceNode)=>{
    const mic=context.createAnalyser();mic.fftSize=256;mic.smoothingTimeConstant=.72;
    const output=context.createAnalyser();output.fftSize=256;output.smoothingTimeConstant=.72;
    source.connect(mic);output.connect(context.destination);
    // Keep the analyser in a rendered graph on WebKit without mic feedback.
    const silent=context.createGain();silent.gain.value=0;mic.connect(silent);silent.connect(context.destination);silentGainRef.current=silent;
    micAnalyserRef.current=mic;outputAnalyserRef.current=output;
    const bins=new Uint8Array(128);let last=0;
    const draw=(time:number)=>{
      if(time-last>40){
        last=time;
        const analyser=pendingPcmPlaybackRef.current>0?output:mic;
        if(fallbackUtteranceRef.current)bins.fill(0);else analyser.getByteFrequencyData(bins);
        const energy=bins.reduce((n,v)=>n+v,0)/bins.length/255;
        visualRef.current?.style.setProperty('--voice-level',String(Math.min(1,energy*3)));
        visualRef.current?.querySelectorAll<HTMLElement>('.voice-wave-bar').forEach((bar,i)=>{
          const start=Math.floor(i*bins.length/28),end=Math.floor((i+1)*bins.length/28);
          let sum=0;for(let j=start;j<end;j++)sum+=bins[j];
          bar.style.setProperty('--bar-level',String(Math.min(1,sum/Math.max(1,end-start)/150)));
        });
      }
      animationRef.current=requestAnimationFrame(draw);
    };
    animationRef.current=requestAnimationFrame(draw);
  };
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const mountedRef = useRef(true);
  // State updates are asynchronous; refs prevent rapid taps from opening
  // multiple live sessions before React has rendered the connecting state.
  const connectingRef = useRef(false);
  const activeRef = useRef(false);
  // Each session owns its callbacks and resources. Old socket events must not
  // tear down a newer session after stop/restart or modal unmount.
  const sessionIdRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const userTranscriptRef = useRef("");
  const assistantTranscriptRef = useRef("");
  const speechActiveRef = useRef(false);
  const silenceFramesRef = useRef(0);
  const pendingPcmPlaybackRef = useRef(0);
  const assistantTurnCompleteRef = useRef(false);
  const assistantResponseActiveRef = useRef(false);
  const fallbackUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const labels = {
    start: ar ? "محادثة صوتية مباشرة" : "Live voice conversation",
    stop: ar ? "إنهاء المحادثة" : "End voice chat",
    connecting: ar ? "جارٍ الاتصال بالعمدة..." : "Connecting to AL OMDA...",
    listening: ar ? "الميكروفون جاهز، اتكلم الآن" : "Microphone ready. Speak now",
    unavailable: ar ? "المحادثة الصوتية غير متاحة حاليًا." : "Live voice is unavailable right now.",
  };

  const setConnectingState = (value: boolean) => {
    connectingRef.current = value;
    if (mountedRef.current) setConnecting(value);
  };

  const setActiveState = (value: boolean) => {
    activeRef.current = value;
    if (mountedRef.current) setActive(value);
  };

  const cleanup = (expectedSessionId?: number) => {
    if (expectedSessionId !== undefined && sessionIdRef.current !== expectedSessionId) return;
    sessionIdRef.current += 1;
    stopVisualizer();
    window.clearTimeout(captureTimerRef.current);
    if(mountedRef.current){setThinking(false);setHeardSpeech(false);}
    setConnectingState(false);
    setActiveState(false);
    turnArmedRef.current=false;validTurnRef.current=false;gateRef.current.reset();
    if(mountedRef.current)setTurnArmed(false);
    sessionReadyRef.current = false;
    speechActiveRef.current = false;
    silenceFramesRef.current = 0;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    socketRef.current?.close();
    void contextRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    socketRef.current = null;
    contextRef.current = null;
    nextPlayTimeRef.current = 0;
    pendingPcmPlaybackRef.current = 0;
    assistantTurnCompleteRef.current = false;
    assistantResponseActiveRef.current = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    fallbackUtteranceRef.current = null;
    if (mountedRef.current) setSpeaking(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopVisualizer();
      window.clearTimeout(captureTimerRef.current);
      sessionIdRef.current += 1;
      connectingRef.current = false;
      activeRef.current = false;
      sessionReadyRef.current = false;
      speechActiveRef.current = false;
      assistantResponseActiveRef.current = false;
      assistantTurnCompleteRef.current = true;
      silenceFramesRef.current = 0;
      pendingPcmPlaybackRef.current = 0;
      nextPlayTimeRef.current = 0;
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.close();
      void contextRef.current?.close();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      fallbackUtteranceRef.current = null;
    };
  }, []);

  const start = async () => {
    if (activeRef.current || connectingRef.current || disabled || !mountedRef.current) return;
    peakInputRef.current=0;inputFramesRef.current=0;setMicDiagnostic('');
    const sessionId = ++sessionIdRef.current;
    const isCurrentSession = () => mountedRef.current && sessionIdRef.current === sessionId;
    setConnectingState(true);
    try {
      if (mountedRef.current) setStatus(labels.connecting);
      // Request microphone permission before creating a billable temporary Gemini session.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error(ar ? "هذا المتصفح لا يدعم تشغيل الصوت المباشر." : "This browser does not support live audio.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(ar ? "الميكروفون غير متاح في هذا المتصفح. افتح التطبيق في Safari واسمح بالميكروفون." : "Microphone unavailable. Open in Safari and allow microphone access.");
      // iOS requires creation AND the first resume in the original tap, before any await.
      // WebKit can otherwise keep a playback-only audio route on iPhone.
      if('audioSession' in navigator){try{(navigator as any).audioSession.type='play-and-record';}catch{/* Older Safari does not expose audio-session routing. */}}
      const context: AudioContext = new AudioContextClass();
      contextRef.current = context;
      const resumed = context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!isCurrentSession()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      await resumed;
      // Permission can interrupt the already-unlocked iOS context. Resume the same context again.
      if(context.state!=="running")await context.resume();
      if (!isCurrentSession()) return;
      if (context.state !== "running") throw new Error(ar ? "تعذر تشغيل صوت الميكروفون. اضغط بدء مرة أخرى واسمح بالميكروفون في إعدادات Safari." : "Microphone audio could not start. Tap Start again and allow microphone access in Safari settings.");
      if (!stream.getAudioTracks().some(track=>track.enabled && track.readyState==='live')) throw new Error(ar ? "الميكروفون غير متاح. تحقق من إذن Safari." : "Microphone is unavailable. Check Safari permission.");
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      sourceRef.current=source;processorRef.current=processor;
      startVisualizer(context,source);
      // Prove the input graph is processing before opening the provider session.
      await new Promise<void>((resolve,reject)=>{
        const timer=window.setTimeout(()=>reject(new Error(ar ? "لا تصل عينات من الميكروفون. أغلق أي مكالمة أخرى ثم أعد البدء، وتحقق من إذن الميكروفون في Safari." : "No microphone samples arrived. End other calls, check Safari microphone permission, then start again.")),6000);
        processor.onaudioprocess=(event)=>{
          event.outputBuffer.getChannelData(0).fill(0);
          if(!isCurrentSession()){window.clearTimeout(timer);reject(new Error('Session ended'));return;}
          if(event.inputBuffer.length>0){window.clearTimeout(timer);resolve();}
        };
        source.connect(processor);processor.connect(context.destination);
      });
      if(!isCurrentSession())return;
      const tokenResponse = await fetch("/api/ai/live-token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!isCurrentSession()) return;
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!isCurrentSession()) return;
      if (!tokenResponse.ok || typeof tokenData.token !== "string") {
        const diagnostic = [tokenData.error, tokenData.details].filter((value) => typeof value === "string" && value.trim()).join(" — ");
        throw new Error(diagnostic || labels.unavailable);
      }

      const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(tokenData.token));
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        let lastServerMessage = "";
        let opened = false;
        let setupComplete = false;
        const timeout = window.setTimeout(() => {
          const detail = lastServerMessage ? " — " + lastServerMessage.slice(0, 700) : "";
          reject(new Error((ar ? "انتهت مهلة اتصال Gemini بعد فتح القناة." : "Gemini connection timed out after the WebSocket opened.") + detail));
        }, 15000);
        socket.onopen = () => {
          opened = true;
          socket.send(JSON.stringify({
            setup: {
              model: "models/gemini-3.1-flash-live-preview",
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
              systemInstruction: {
                parts: [{ text: `You are AL OMDA AI, a warm and capable voice assistant. Respond naturally in the user's language. When the user speaks Egyptian Arabic, reply in clear Egyptian Arabic. Only transcribe actual intelligible speech. Never infer words from silence or background noise. The interface language is ${ar ? 'Arabic (Egyptian)' : 'English'}; prioritize that language for input transcription. Keep the conversation conversational and concise. You may be interrupted; stop speaking when the user starts talking.` }]
              }
            }
          }));
        };
        socket.onerror = () => {
          if (!isCurrentSession()) return;
          window.clearTimeout(timeout);
          reject(new Error(opened ? (ar ? "فُتح اتصال Gemini لكن حدث خطأ أثناء تهيئة الجلسة." : "Gemini WebSocket opened but failed during session setup.") : labels.unavailable));
        };
        socket.onmessage = async (event) => {
          if (!isCurrentSession()) return;
          let message: any;
          try {
            const raw = typeof event.data === "string" ? event.data : await event.data.text();
            if (!isCurrentSession()) return;
            lastServerMessage = raw;
            message = JSON.parse(raw);
          } catch { return; }
          if (message.setupComplete) {
            setupComplete = true;
            window.clearTimeout(timeout);
            resolve();
          } else if (message.error) {
            window.clearTimeout(timeout);
            reject(new Error(message.error.message || labels.unavailable));
          }
        };
        socket.onclose = (event) => {
          window.clearTimeout(timeout);
          if (!setupComplete) {
            const detail = [event.code ? "code " + event.code : "", event.reason || ""].filter(Boolean).join(": ");
            reject(new Error((ar ? "أغلق Gemini الاتصال قبل اكتمال الجلسة." : "Gemini closed the connection before setup completed.") + (detail ? " — " + detail : "")));
          }
        };
      });
      if (!isCurrentSession()) {
        socket.close();
        void context.close();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error(ar ? "انقطع اتصال Gemini أثناء تجهيز الصوت." : "Gemini disconnected while preparing audio.");
      }

      processor.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0);
        if (!isCurrentSession()) return;
        if(context.state!=="running"){
          setStatus(ar ? "توقف صوت الميكروفون. أنهِ المحادثة ثم ابدأ مرة أخرى." : "Microphone audio paused. End the chat and start again.");
          cleanup(sessionId);return;
        }
        if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current || assistantResponseActiveRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
        const rms = Math.sqrt(energy / Math.max(1, input.length));
        inputFramesRef.current++;
        peakInputRef.current=Math.max(peakInputRef.current,rms);
        const durationMs=input.length/context.sampleRate*1000;
        const hasSpeech=turnArmedRef.current && gateRef.current.process(rms,durationMs);
        if(inputFramesRef.current%12===0){
          const track=stream.getAudioTracks()[0];
          setMicDiagnostic((ar?'مستوى الميكروفون: ':'Mic level: ')+Math.round(Math.min(100,peakInputRef.current*10000))+'%'+(track?.muted?(ar?' · المسار مكتوم':' · track muted'):''));
        }

        if(!turnArmedRef.current)return;
        if (hasSpeech) {
          setHeardSpeech(true);
          window.clearTimeout(captureTimerRef.current);
          if (!speechActiveRef.current) {
            // A new user utterance opens exactly one new assistant response cycle.
            setThinking(false);
            assistantTurnCompleteRef.current = false;
            userTranscriptRef.current = "";
            assistantTranscriptRef.current = "";
            receivedAudioChunks = 0;
            socket.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
            speechActiveRef.current = true;
            setStatus(ar ? "سمعتك... اتكلم براحتك" : "I hear you... go ahead");
          }
          silenceFramesRef.current = 0;
        } else if (!speechActiveRef.current) {
          return;
        }

        const pcm = downsampleTo16k(input, context.sampleRate);
        socket.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: "audio/pcm;rate=16000", data: toBase64(pcm) }
          }
        }));

        if (!hasSpeech) {
          silenceFramesRef.current += 1;
          if (silenceFramesRef.current >= 8) {
            validTurnRef.current=gateRef.current.voicedMs>=350;
            turnArmedRef.current=false;setTurnArmed(false);
            socket.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
            speechActiveRef.current = false;
            silenceFramesRef.current = 0;
            setThinking(true);
            setStatus(ar ? "جاري تجهيز رد العمدة..." : "Preparing AL OMDA's reply...");
          }
        }
      };
      stream.getAudioTracks().forEach(track=>{
        track.onended=()=>{if(isCurrentSession()){setStatus(ar?"توقف الميكروفون. أعد البدء واسمح باستخدامه.":"Microphone stopped. Start again and allow access.");cleanup(sessionId);}};
      });
      captureTimerRef.current=window.setTimeout(()=>{
        if(isCurrentSession()&&peakInputRef.current<.0015){
          const track=stream.getAudioTracks()[0];
          setStatus(context.state!=="running"?(ar?'Safari أوقف مسار الصوت. أنهِ المحادثة وابدأ مرة أخرى.':'Safari paused audio. End the chat and start again.'):track?.muted?(ar?'Safari يرسل مسار ميكروفون مكتومًا. أغلق أي مكالمة أو تطبيق يستخدم الميكروفون ثم أعد البدء.':'Safari reports a muted microphone track. End other calls or microphone apps and start again.'):peakInputRef.current===0?(ar?'وصلت إطارات صامتة من الميكروفون، وليس خطأ في الاتصال بالعمدة. أنهِ المحادثة وأغلق أي مكالمة أخرى ثم أعد البدء.':'The microphone is supplying silent frames, not a connection error. End this chat and other calls, then start again.'):(ar?'صوت الميكروفون ضعيف جدًا. قرّب الهاتف وتحدث بصوت أعلى.':'Microphone audio is very quiet. Move closer and speak louder.'));
          setMicDiagnostic((ar?'عينات: ':'Frames: ')+inputFramesRef.current+' · '+(ar?'أعلى مستوى: ':'Peak: ')+peakInputRef.current.toFixed(5));
        }
      },8000);
      sessionReadyRef.current = true;
      setConnectingState(false);
      setActiveState(true);
      setStatus(ar?'متصل. اضغط «دور كلام جديد» ثم انتظر لحظة قبل التحدث.':'Connected. Tap New speaking turn, pause briefly, then speak.');

      let receivedAudioChunks = 0;
      socket.onmessage = async (event) => {
        if (!isCurrentSession()) return;
        let message: any;
        try {
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          if (!isCurrentSession()) return;
          message = JSON.parse(raw);
        } catch {
          if (isCurrentSession() && mountedRef.current) setStatus(ar ? "وصلت رسالة غير مفهومة من Gemini." : "Received an unreadable message from Gemini.");
          return;
        }
        if (message.error) {
          if (mountedRef.current) setStatus((ar ? "خطأ من Gemini: " : "Gemini error: ") + (message.error.message || "Unknown error"));
          return;
        }
        const serverContent = message.serverContent;
        if (!serverContent) return;
        // Unsolicited/noise-only server content never enters the chat or playback.
        if(!validTurnRef.current)return;
        if (serverContent.interrupted) nextPlayTimeRef.current = context.currentTime;
        const inputText = serverContent.inputTranscription?.text;
        if (typeof inputText === "string" && inputText.trim()) userTranscriptRef.current += inputText;
        const outputText = serverContent.outputTranscription?.text;
        if (typeof outputText === "string" && outputText.trim()) {
          assistantResponseActiveRef.current = true;
          speechActiveRef.current = false;
          silenceFramesRef.current = 0;
          assistantTranscriptRef.current += outputText;
          if (mountedRef.current) setStatus(ar ? "وصل رد العمدة..." : "AL OMDA's reply arrived...");
        }
        const parts = serverContent.modelTurn?.parts;
        if (Array.isArray(parts)) {
          if (parts.length) {
            assistantResponseActiveRef.current = true;
            speechActiveRef.current = false;
            silenceFramesRef.current = 0;
          }
          for (const part of parts) {
            const data = part?.inlineData?.data ?? part?.inline_data?.data;
            if (typeof data !== "string" || data.length < 8) continue;
            const binary = atob(data);
            if (binary.length < 4) continue;
            const pcm = new Int16Array(Math.floor(binary.length / 2));
            for (let i = 0; i < pcm.length; i++) {
              const low = binary.charCodeAt(i * 2);
              const high = binary.charCodeAt(i * 2 + 1);
              pcm[i] = (high << 8) | low;
            }
            const buffer = context.createBuffer(1, pcm.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
            const player = context.createBufferSource();
            player.buffer = buffer;
            player.connect(outputAnalyserRef.current??context.destination);
            const startAt = Math.max(context.currentTime + 0.03, nextPlayTimeRef.current);
            pendingPcmPlaybackRef.current += 1;
            // Keep the turn-complete latch set until the next user utterance.
            // Audio chunks can arrive in trailing/duplicate frames after turnComplete.
            player.onended = () => {
              if (!isCurrentSession()) return;
              pendingPcmPlaybackRef.current = Math.max(0, pendingPcmPlaybackRef.current - 1);
              if (assistantTurnCompleteRef.current && pendingPcmPlaybackRef.current === 0) {
                assistantResponseActiveRef.current = false;
                if (mountedRef.current) {
                  setSpeaking(false);
                  setStatus(ar ? "اتكلم تاني لما تحب..." : "Speak again whenever you are ready...");
                }
              }
            };
            player.start(startAt);
            nextPlayTimeRef.current = startAt + buffer.duration;
            receivedAudioChunks++;
            if (mountedRef.current) { setThinking(false);setStatus(ar ? "العمدة بيتكلم..." : "AL OMDA is speaking..."); setSpeaking(true); }
          }
        }
        if (serverContent.turnComplete && !assistantTurnCompleteRef.current) {
          // Gemini may deliver repeated turnComplete frames. Process each voice turn once.
          setThinking(false);
          assistantTurnCompleteRef.current = true;
          if (pendingPcmPlaybackRef.current === 0 && mountedRef.current) setSpeaking(false);
          const userText = userTranscriptRef.current.trim();
          const assistantText = assistantTranscriptRef.current.trim();
          // Clear the completed turn immediately so later turns cannot append stale transcripts.
          userTranscriptRef.current = "";
          assistantTranscriptRef.current = "";
          if (userText) onTranscript("user", userText);
          if (assistantText) {
            onTranscript("assistant", assistantText);
            if (receivedAudioChunks === 0 && "speechSynthesis" in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(assistantText);
              utterance.lang = ar ? "ar-EG" : "en-US";
              utterance.rate = 0.96;
              fallbackUtteranceRef.current = utterance;
              utterance.onend = () => {
                if (fallbackUtteranceRef.current === utterance) {
                  fallbackUtteranceRef.current = null;
                  assistantResponseActiveRef.current = false;
                  if (mountedRef.current) {
                    setSpeaking(false);
                    setStatus(ar ? "اتكلم تاني لما تحب..." : "Speak again whenever you are ready...");
                  }
                }
              };
              utterance.onerror = () => {
                if (fallbackUtteranceRef.current === utterance) {
                  fallbackUtteranceRef.current = null;
                  assistantResponseActiveRef.current = false;
                  if (mountedRef.current) {
                    setSpeaking(false);
                    setStatus(ar ? "اتكلم تاني لما تحب..." : "Speak again whenever you are ready...");
                  }
                }
              };
              window.speechSynthesis.speak(utterance);
              if (mountedRef.current) {
                setSpeaking(true);
                setStatus(ar ? "العمدة بيرد بالصوت المتاح على جهازك..." : "AL OMDA is replying with your device voice...");
              }
            } else if (mountedRef.current) {
              assistantResponseActiveRef.current = pendingPcmPlaybackRef.current > 0;
              setStatus(pendingPcmPlaybackRef.current > 0
                ? (ar ? "استنى لحد ما العمدة يخلص كلامه..." : "Please wait until AL OMDA finishes speaking...")
                : (ar ? "اتكلم تاني لما تحب..." : "Speak again whenever you are ready..."));
            }
          } else if (mountedRef.current) {
            assistantResponseActiveRef.current = pendingPcmPlaybackRef.current > 0;
            setStatus(ar ? "Gemini استقبل دور الكلام لكنه لم يرسل ردًا. جرّب جملة أقصر." : "Gemini received the turn but sent no reply.");
          }
          userTranscriptRef.current = "";
          assistantTranscriptRef.current = "";
          receivedAudioChunks = 0;
          validTurnRef.current=false;
        }
      };
      socket.onclose = () => {
        if (isCurrentSession()) {
          setStatus(ar ? "انقطع الاتصال الصوتي." : "Voice connection ended.");
          cleanup(sessionId);
        }
      };
    } catch (error) {
      const wasCurrentSession = isCurrentSession();
      cleanup(sessionId);
      if (wasCurrentSession && mountedRef.current) {
        const name=error instanceof DOMException?error.name:'';
        setStatus(name==='NotAllowedError'?(ar?'الميكروفون غير مسموح. من إعدادات الموقع في Safari اسمح بالميكروفون ثم اضغط بدء.':'Microphone permission denied. Allow microphone in Safari website settings, then tap Start.'):name==='NotFoundError'?(ar?'لم نعثر على ميكروفون متاح.':'No microphone was found.'):name==='NotReadableError'?(ar?'الميكروفون مشغول أو تعذر تشغيله. أغلق المكالمات الأخرى وحاول مجددًا.':'Microphone is busy or unavailable. End other calls and try again.'):error instanceof Error ? error.message : labels.unavailable);
      }
    }
  };

  const stop = () => {
    if (mountedRef.current) setSpeaking(false);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    cleanup();
    setStatus(ar ? "انتهت المحادثة الصوتية." : "Voice conversation ended.");
  };

  return <div ref={visualRef} className="omda-live-voice" data-state={connecting?"connecting":speaking?"speaking":thinking?"thinking":active?"listening":"idle"} data-active={active} data-speaking={speaking} data-connecting={connecting}>
    <span className="voice-mode-kicker">{ar?"العمدة · مساعدك الصوتي":"AL OMDA · VOICE ASSISTANT"}</span>
    <div className="omda-voice-orb-wrap" role="img" aria-label={speaking ? (ar ? "العمدة يتحدث" : "AL OMDA is speaking") : active ? labels.listening : labels.start}>
      <svg className="omda-voice-orb" viewBox="0 0 160 160" aria-hidden="true"><defs><radialGradient id="voiceOrbFill" cx="30%" cy="23%" r="85%"><stop offset="0" stopColor="#f3d9ff"/><stop offset=".32" stopColor="#c99af5"/><stop offset=".7" stopColor="#8989e3"/><stop offset="1" stopColor="#69c7ed"/></radialGradient></defs><circle cx="80" cy="80" r="69" fill="url(#voiceOrbFill)"/><ellipse cx="80" cy="80" rx="56" ry="26" fill="none" stroke="#f1e4ff" strokeOpacity=".55" strokeWidth="1.2" transform="rotate(-30 80 80)"/><ellipse cx="80" cy="80" rx="27" ry="62" fill="none" stroke="#f1e4ff" strokeOpacity=".55" strokeWidth="1.2" transform="rotate(-28 80 80)"/><circle cx="80" cy="80" r="69" fill="none" stroke="#e9caff" strokeOpacity=".5"/></svg>
    </div>
    <div className="voice-live-wave" aria-hidden="true">{Array.from({length:28},(_,i)=><i className="voice-wave-bar" key={i}/>)}</div>
    <span className="voice-state-label">{connecting?(ar?"جارٍ الاتصال":"Connecting"):speaking?(ar?"يتحدث":"Speaking"):thinking?(ar?"يفكر":"Thinking"):active?(turnArmed?heardSpeech?(ar?"رصدنا صوتك":"Voice detected"):(ar?"انتظر ثم تكلّم":"Pause, then speak"):(ar?"اضغط لفتح دور كلام":"Tap to open a speaking turn")):(ar?"المس للتحدث":"Tap to talk")}</span>
    <strong className="omda-voice-status" role="status">{connecting ? labels.connecting : speaking ? (ar ? "العمدة بيتكلم..." : "AL OMDA is speaking...") : active ? status || labels.listening : status || (ar ? "ابدأ محادثة صوتية مع العمدة" : "Start a voice conversation with AL OMDA")}</strong>
    {active&&<button type="button" className="ai-chat-live-test" disabled={turnArmed||speaking||thinking} onClick={()=>{
      gateRef.current.reset();validTurnRef.current=false;turnArmedRef.current=true;setTurnArmed(true);setHeardSpeech(false);
      setStatus(ar?'انتظر لحظة لمعايرة الضجيج، ثم تكلّم. لن تُرسل الضوضاء وحدها.':'Pause briefly for noise calibration, then speak. Noise alone is not sent.');
    }}>{turnArmed?(ar?'دور الكلام مفتوح':'Speaking turn open'):(ar?'دور كلام جديد':'New speaking turn')}</button>}
    <button type="button" className={active ? "omda-voice-end" : "omda-voice-start"} onClick={active ? stop : start} disabled={disabled || connecting}>
      {connecting ? <span className="animate-spin">◌</span> : active ? <PhoneOff size={17}/> : <Mic size={17}/>}
      <span>{connecting ? labels.connecting : active ? labels.stop : labels.start}</span>
    </button>
    {active&&micDiagnostic&&<small className="voice-privacy-note" role="status">{micDiagnostic}</small>}
    <small className="voice-privacy-note">{ar?"الميكروفون يعمل بعد البدء فقط. أنهِ المحادثة لإيقافه.":"Microphone starts only when you begin. End the chat to stop it."}</small>
  </div>;
}