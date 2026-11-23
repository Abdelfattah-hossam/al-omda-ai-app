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
  const visualRef=useRef<HTMLDivElement|null>(null);
  const micAnalyserRef=useRef<AnalyserNode|null>(null);
  const outputAnalyserRef=useRef<AnalyserNode|null>(null);
  const animationRef=useRef(0);
  const stopVisualizer=()=>{
    cancelAnimationFrame(animationRef.current);
    micAnalyserRef.current?.disconnect();outputAnalyserRef.current?.disconnect();
    micAnalyserRef.current=null;outputAnalyserRef.current=null;
    visualRef.current?.style.setProperty('--voice-level','0');
    visualRef.current?.querySelectorAll<HTMLElement>('.voice-wave-bar').forEach(bar=>bar.style.setProperty('--bar-level','0'));
  };
  const startVisualizer=(context:AudioContext,source:MediaStreamAudioSourceNode)=>{
    const mic=context.createAnalyser();mic.fftSize=256;mic.smoothingTimeConstant=.72;
    const output=context.createAnalyser();output.fftSize=256;output.smoothingTimeConstant=.72;
    source.connect(mic);output.connect(context.destination);
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
    listening: ar ? "العمدة يسمعك الآن..." : "AL OMDA is listening...",
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
    if(mountedRef.current)setThinking(false);
    setConnectingState(false);
    setActiveState(false);
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
    const sessionId = ++sessionIdRef.current;
    const isCurrentSession = () => mountedRef.current && sessionIdRef.current === sessionId;
    setConnectingState(true);
    try {
      if (mountedRef.current) setStatus(labels.connecting);
      // Request microphone permission before creating a billable temporary Gemini session.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error(ar ? "هذا المتصفح لا يدعم تشغيل الصوت المباشر." : "This browser does not support live audio.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!isCurrentSession()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

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

      const context: AudioContext = new AudioContextClass();
      contextRef.current = context;
      await context.resume();
      if (!isCurrentSession()) {
        void context.close();
        return;
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
                parts: [{ text: "You are AL OMDA AI, a warm and capable voice assistant. Respond naturally in the user's language. When the user speaks Egyptian Arabic, reply in clear Egyptian Arabic. Keep the conversation conversational and concise. You may be interrupted; stop speaking when the user starts talking." }]
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

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      startVisualizer(context,source);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (!isCurrentSession()) return;
        if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current || assistantResponseActiveRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
        const rms = Math.sqrt(energy / Math.max(1, input.length));
        const hasSpeech = rms > 0.012;

        if (hasSpeech) {
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
            socket.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
            speechActiveRef.current = false;
            silenceFramesRef.current = 0;
            setThinking(true);
            setStatus(ar ? "جاري تجهيز رد العمدة..." : "Preparing AL OMDA's reply...");
          }
        }
      };
      source.connect(processor);
      processor.connect(context.destination);

      sessionReadyRef.current = true;
      setConnectingState(false);
      setActiveState(true);
      setStatus(labels.listening);

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
        setStatus(error instanceof Error ? error.message : labels.unavailable);
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
      <div className="omda-voice-orb"><span/><span/><span/><i/></div>
    </div>
    <div className="voice-live-wave" aria-hidden="true">{Array.from({length:28},(_,i)=><i className="voice-wave-bar" key={i}/>)}</div>
    <span className="voice-state-label">{connecting?(ar?"جارٍ الاتصال":"Connecting"):speaking?(ar?"يتحدث":"Speaking"):thinking?(ar?"يفكر":"Thinking"):active?(ar?"يسمعك":"Listening"):(ar?"المس للتحدث":"Tap to talk")}</span>
    <strong className="omda-voice-status" role="status">{connecting ? labels.connecting : speaking ? (ar ? "العمدة بيتكلم..." : "AL OMDA is speaking...") : active ? status || labels.listening : status || (ar ? "ابدأ محادثة صوتية مع العمدة" : "Start a voice conversation with AL OMDA")}</strong>
    <button type="button" className={active ? "omda-voice-end" : "omda-voice-start"} onClick={active ? stop : start} disabled={disabled || connecting}>
      {connecting ? <span className="animate-spin">◌</span> : active ? <PhoneOff size={17}/> : <Mic size={17}/>}
      <span>{connecting ? labels.connecting : active ? labels.stop : labels.start}</span>
    </button>
    <small className="voice-privacy-note">{ar?"الميكروفون يعمل بعد البدء فقط. أنهِ المحادثة لإيقافه.":"Microphone starts only when you begin. End the chat to stop it."}</small>
  </div>;
}