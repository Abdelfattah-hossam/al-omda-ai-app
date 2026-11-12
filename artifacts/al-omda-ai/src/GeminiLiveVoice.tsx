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

  const labels = {
    start: ar ? "محادثة صوتية مباشرة" : "Live voice conversation",
    stop: ar ? "إنهاء المحادثة" : "End voice chat",
    connecting: ar ? "جارٍ الاتصال بالعمدة..." : "Connecting to AL OMDA...",
    listening: ar ? "العمدة يسمعك الآن..." : "AL OMDA is listening...",
    unavailable: ar ? "المحادثة الصوتية غير متاحة حاليًا." : "Live voice is unavailable right now.",
  };

  const cleanup = () => {
    sessionReadyRef.current = false;
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
      const tokenResponse = await fetch("/api/ai/live-token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || typeof tokenData.token !== "string") {
        throw new Error(tokenData.error || labels.unavailable);
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error(ar ? "هذا المتصفح لا يدعم تشغيل الصوت المباشر." : "This browser does not support live audio.");
      const context: AudioContext = new AudioContextClass();
      contextRef.current = context;
      await context.resume();

      const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?access_token=" + encodeURIComponent(tokenData.token));
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(ar ? "انتهت مهلة الاتصال بالعمدة." : "Connection to AL OMDA timed out.")), 15000);
        socket.onopen = () => {
          socket.send(JSON.stringify({
            setup: {
              model: "models/gemini-3.8-live",
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{ text: "You are AL OMDA AI, a warm and capable voice assistant. Respond naturally in the user's language. When the user speaks Egyptian Arabic, reply in clear Egyptian Arabic. Keep the conversation conversational and concise. You may be interrupted; stop speaking when the user starts talking." }]
              }
            }
          }));
        };
        socket.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error(labels.unavailable));
        };
        socket.onmessage = (event) => {
          let message: any;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.setupComplete) {
            window.clearTimeout(timeout);
            resolve();
          } else if (message.error) {
            window.clearTimeout(timeout);
            reject(new Error(message.error.message || labels.unavailable));
          }
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (!sessionReadyRef.current) reject(new Error(labels.unavailable));
        };
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current) return;
        const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
        socket.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: "audio/pcm;rate=16000", data: toBase64(pcm) }
          }
        }));
      };
      source.connect(processor);
      processor.connect(context.destination);

      sessionReadyRef.current = true;
      setConnecting(false);
      setActive(true);
      setStatus(labels.listening);

      socket.onmessage = (event) => {
        let message: any;
        try { message = JSON.parse(event.data); } catch { return; }
        const serverContent = message.serverContent;
        if (serverContent?.interrupted) nextPlayTimeRef.current = context.currentTime;
        const inputText = serverContent?.inputTranscription?.text;
        if (typeof inputText === "string" && inputText.trim()) {
          userTranscriptRef.current += inputText;
        }
        const outputText = serverContent?.outputTranscription?.text;
        if (typeof outputText === "string" && outputText.trim()) {
          assistantTranscriptRef.current += outputText;
        }
        const parts = serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const data = part?.inlineData?.data;
            if (typeof data !== "string") continue;
            const binary = atob(data);
            const pcm = new Int16Array(binary.length / 2);
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
          }
        }
        if (serverContent?.turnComplete) {
          const userText = userTranscriptRef.current.trim();
          const assistantText = assistantTranscriptRef.current.trim();
          if (userText) onTranscript("user", userText);
          if (assistantText) onTranscript("assistant", assistantText);
          userTranscriptRef.current = "";
          assistantTranscriptRef.current = "";
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
