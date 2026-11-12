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
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const sessionReadyRef = useRef(false);
  const userTranscriptRef = useRef("");
  const assistantTranscriptRef = useRef("");
  const speechActiveRef = useRef(false);
  const silenceFramesRef = useRef(0);

  const labels = {
    start: ar ? "محادثة صوتية مباشرة" : "Live voice conversation",
    stop: ar ? "إنهاء المحادثة" : "End voice chat",
    connecting: ar ? "جارٍ الاتصال بالعمدة..." : "Connecting to AL OMDA...",
    listening: ar ? "العمدة يسمعك الآن..." : "AL OMDA is listening...",
    unavailable: ar ? "المحادثة الصوتية غير متاحة حاليًا." : "Live voice is unavailable right now.",
  };

  const cleanup = () => {
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
    if (mountedRef.current) {
      setActive(false);
      setConnecting(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.close();
      void contextRef.current?.close();
    };
  }, []);

  const start = async () => {
    if (active || connecting || disabled) return;
    setConnecting(true);
    setStatus(labels.connecting);
    try {
      // Request microphone permission before creating a billable temporary Gemini session.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error(ar ? "هذا المتصفح لا يدعم تشغيل الصوت المباشر." : "This browser does not support live audio.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const tokenResponse = await fetch("/api/ai/live-token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || typeof tokenData.token !== "string") {
        const diagnostic = [tokenData.error, tokenData.details].filter((value) => typeof value === "string" && value.trim()).join(" — ");
        throw new Error(diagnostic || labels.unavailable);
      }

      const context: AudioContext = new AudioContextClass();
      contextRef.current = context;
      await context.resume();

      const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(tokenData.token));
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        let lastServerMessage = "";
        let opened = false;
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
          window.clearTimeout(timeout);
          reject(new Error(opened ? (ar ? "فُتح اتصال Gemini لكن حدث خطأ أثناء تهيئة الجلسة." : "Gemini WebSocket opened but failed during session setup.") : labels.unavailable));
        };
        socket.onmessage = async (event) => {
          let message: any;
          try {
            const raw = typeof event.data === "string" ? event.data : await event.data.text();
            lastServerMessage = raw;
            message = JSON.parse(raw);
          } catch { return; }
          if (message.setupComplete) {
            window.clearTimeout(timeout);
            resolve();
          } else if (message.error) {
            window.clearTimeout(timeout);
            reject(new Error(message.error.message || labels.unavailable));
          }
        };
        socket.onclose = (event) => {
          window.clearTimeout(timeout);
          if (!sessionReadyRef.current) {
            const detail = [event.code ? "code " + event.code : "", event.reason || ""].filter(Boolean).join(": ");
            reject(new Error((ar ? "أغلق Gemini الاتصال قبل اكتمال الجلسة." : "Gemini closed the connection before setup completed.") + (detail ? " — " + detail : "")));
          }
        };
      });

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
        const rms = Math.sqrt(energy / Math.max(1, input.length));
        const hasSpeech = rms > 0.012;

        if (hasSpeech) {
          if (!speechActiveRef.current) {
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
            setStatus(ar ? "جاري تجهيز رد العمدة..." : "Preparing AL OMDA's reply...");
          }
        }
      };
      source.connect(processor);
      processor.connect(context.destination);

      sessionReadyRef.current = true;
      setConnecting(false);
      setActive(true);
      setStatus(labels.listening);

      let receivedAudioChunks = 0;
      socket.onmessage = async (event) => {
        let message: any;
        try {
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          message = JSON.parse(raw);
        } catch {
          if (mountedRef.current) setStatus(ar ? "وصلت رسالة غير مفهومة من Gemini." : "Received an unreadable message from Gemini.");
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
          assistantTranscriptRef.current += outputText;
          if (mountedRef.current) setStatus(ar ? "وصل رد العمدة..." : "AL OMDA's reply arrived...");
        }
        const parts = serverContent.modelTurn?.parts;
        if (Array.isArray(parts)) {
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
            player.connect(context.destination);
            const startAt = Math.max(context.currentTime + 0.03, nextPlayTimeRef.current);
            player.start(startAt);
            nextPlayTimeRef.current = startAt + buffer.duration;
            receivedAudioChunks++;
            if (mountedRef.current) setStatus(ar ? "العمدة بيتكلم..." : "AL OMDA is speaking...");
          }
        }
        if (serverContent.turnComplete) {
          const userText = userTranscriptRef.current.trim();
          const assistantText = assistantTranscriptRef.current.trim();
          if (userText) onTranscript("user", userText);
          if (assistantText) {
            onTranscript("assistant", assistantText);
            if (receivedAudioChunks === 0 && "speechSynthesis" in window) {
              const utterance = new SpeechSynthesisUtterance(assistantText);
              utterance.lang = ar ? "ar-EG" : "en-US";
              utterance.rate = 0.96;
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
              if (mountedRef.current) setStatus(ar ? "العمدة بيرد بالصوت المتاح على جهازك..." : "AL OMDA is replying with your device voice...");
            } else if (mountedRef.current) {
              setStatus(ar ? "اتكلم تاني لما تحب..." : "Speak again whenever you are ready...");
            }
          } else if (mountedRef.current) {
            setStatus(ar ? "Gemini استقبل دور الكلام لكنه لم يرسل ردًا. جرّب جملة أقصر." : "Gemini received the turn but sent no reply. Try a shorter sentence.");
          }
          userTranscriptRef.current = "";
          assistantTranscriptRef.current = "";
          receivedAudioChunks = 0;
        }
      };
      socket.onclose = () => {
        if (mountedRef.current) {
          setStatus(ar ? "انقطع الاتصال الصوتي." : "Voice connection ended.");
          cleanup();
        }
      };
    } catch (error) {
      cleanup();
      setStatus(error instanceof Error ? error.message : labels.unavailable);
    }
  };

  const stop = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    cleanup();
    setStatus(ar ? "انتهت المحادثة الصوتية." : "Voice conversation ended.");
  };

  return <div style={{ display: "grid", gap: 6 }}>
    <button type="button" className={active ? "button button-primary button-small" : "button button-quiet button-small"} onClick={active ? stop : start} disabled={disabled || connecting}>
      {connecting ? <span className="animate-spin">◌</span> : active ? <PhoneOff size={14} /> : <Mic size={14} />}
      {connecting ? labels.connecting : active ? labels.stop : labels.start}
    </button>
    {status && <small className="muted" role="status">{status}</small>}
  </div>;
}