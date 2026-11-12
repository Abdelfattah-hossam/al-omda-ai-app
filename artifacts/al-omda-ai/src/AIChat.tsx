import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, Mic, Send, Volume2, VolumeX } from "lucide-react";

type Language = "ar" | "en";
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string };
type Usage = {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
  providers?: { gemini: boolean; groq: boolean; openrouter: boolean };
};

export default function AIChatPage({ language, signedIn }: { language: Language; signedIn: boolean }) {
  const ar = language === "ar";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const copy = {
    title: ar ? "شات العمدة الذكي" : "AL OMDA AI Chat",
    subtitle: ar ? "العمدة يختار المحرك المجاني الأنسب تلقائيًا." : "AL OMDA automatically selects the best available free engine.",
    login: ar ? "سجّل الدخول لاستخدام الشات وحفظ رصيدك اليومي." : "Sign in to use AI chat and track your daily allowance.",
    placeholder: ar ? "اكتب سؤالك أو اطلب كودًا..." : "Ask a question or request code...",
    send: ar ? "إرسال" : "Send",
    remaining: ar ? "المتبقي اليوم" : "Remaining today",
    used: ar ? "المستخدم" : "Used",
    limit: ar ? "الحد اليومي" : "Daily limit",
    providers: ar ? "المحركات المجانية المتصلة" : "Connected free engines",
    noProvider: ar ? "لم يتم ربط محرك مجاني بعد. أضف مفتاح Gemini أو Groq أو OpenRouter المجاني في أسرار Cloudflare." : "No free engine is connected yet. Add a free Gemini, Groq, or OpenRouter key to Cloudflare secrets.",
    voiceUnsupported: ar ? "الإملاء الصوتي غير مدعوم في هذا المتصفح." : "Voice input is not supported in this browser.",
    mic: ar ? "تحدث" : "Speak",
    stop: ar ? "إيقاف التسجيل" : "Stop recording",
    voiceNote: ar ? "الصوت يستخدم إمكانات المتصفح والجهاز، وقد يختلف دعمه حسب المتصفح." : "Voice uses browser and device capabilities; support varies by browser.",
    loading: ar ? "العمدة يفكر..." : "AL OMDA is thinking...",
    exhausted: ar ? "انتهى رصيدك اليومي. سيتجدد تلقائيًا عند بداية يوم UTC التالي." : "Your daily allowance is exhausted. It resets at the next UTC day.",
    empty: ar ? "ابدأ محادثتك مع العمدة." : "Start a conversation with AL OMDA.",
  };

  const loadUsage = async () => {
    if (!signedIn) return;
    try {
      const response = await fetch("/api/ai/usage", { credentials: "same-origin" });
      const data = await response.json();
      if (response.ok) setUsage(data);
      else setError(data.error || copy.login);
    } catch {
      setError(ar ? "تعذر تحميل رصيد الاستخدام." : "Could not load usage.");
    }
  };

  useEffect(() => { void loadUsage(); }, [signedIn]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading || !signedIn || (usage && usage.remaining <= 0)) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.usage) setUsage(data.usage);
        throw new Error(data.error || (ar ? "تعذر إكمال الطلب." : "The request could not be completed."));
      }
      setMessages((current) => [...current, { role: "assistant", content: data.reply, provider: data.provider }]);
      if (data.usage) setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));
    } finally {
      setLoading(false);
      void loadUsage();
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(copy.voiceUnsupported);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = ar ? "ar-SA" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInput((current) => current ? current + " " + transcript : transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setError(ar ? "تعذر التعرف على الصوت. تحقق من إذن الميكروفون." : "Voice recognition failed. Check microphone permission.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ar ? "ar-SA" : "en-US";
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const providerNames = usage?.providers
    ? Object.entries(usage.providers).filter(([, active]) => active).map(([name]) => name === "gemini" ? "Gemini" : name === "groq" ? "Groq" : "OpenRouter Free")
    : [];
  const percent = usage ? Math.max(0, Math.min(100, usage.remaining / usage.limit * 100)) : 0;

  return <div className="page-enter">
    <div className="page-heading">
      <div><div className="eyebrow">AL OMDA AI</div><h1 className="page-title">{copy.title}</h1><p className="page-subtitle">{copy.subtitle}</p></div>
      <span className="status-chip"><Bot size={13}/>{ar ? "توجيه تلقائي" : "Auto routing"}</span>
    </div>
    {!signedIn ? <section className="panel panel-pad"><p className="account-copy">{copy.login}</p></section> : <>
      <section className="panel panel-pad" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 className="section-title">{copy.remaining}</h2><strong>{usage ? `${usage.remaining} / ${usage.limit}` : "—"}</strong></div>
        <div style={{height:9,background:"var(--surface-muted,#252a32)",borderRadius:99,overflow:"hidden",margin:"12px 0"}}>
          <div style={{height:"100%",width:`${percent}%`,background:"#c6a76c",borderRadius:99,transition:"width .2s"}}/>
        </div>
        <div className="setting-row"><div><strong>{copy.used}</strong><small>{usage?.used ?? "—"}</small></div><div><strong>{copy.limit}</strong><small>{usage?.limit ?? 100}</small></div></div>
        <div className="setting-row"><div><strong>{copy.providers}</strong><small>{providerNames.length ? providerNames.join(" · ") : "—"}</small></div></div>
        {usage && providerNames.length === 0 && <div className="notice-bar" style={{marginTop:10}}>{copy.noProvider}</div>}
        <small className="muted">{copy.voiceNote}</small>
      </section>
      <section className="panel panel-pad">
        <div className="chat-messages" aria-live="polite" style={{minHeight:250,maxHeight:"52vh",overflowY:"auto"}}>
          {messages.length === 0 && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.empty}</p></div>}
          {messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}>
            <strong>{message.role === "user" ? (ar ? "أنت" : "You") : `AL OMDA AI${message.provider ? " · " + message.provider : ""}`}</strong>
            <p style={{whiteSpace:"pre-wrap"}}>{message.content}</p>
            {message.role === "assistant" && <button type="button" className="button button-quiet button-small" onClick={()=>speak(message.content)} aria-label={ar ? "استمع للإجابة" : "Read answer aloud"}><Volume2 size={13}/>{ar ? "استمع" : "Listen"}</button>}
          </div>)}
          {loading && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.loading}</p></div>}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="notice-bar notice-error" role="alert" style={{marginBottom:12}}>{error}</div>}
        {usage?.remaining === 0 && <div className="notice-bar" style={{marginBottom:12}}>{copy.exhausted}</div>}
        <form onSubmit={sendMessage} style={{display:"grid",gap:10}}>
          <textarea className="field" rows={3} maxLength={8000} value={input} onChange={(event)=>setInput(event.target.value)} placeholder={copy.placeholder} disabled={loading || !signedIn || usage?.remaining === 0}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"space-between"}}>
            <button type="button" className={`button ${listening ? "button-primary" : "button-quiet"} button-small`} onClick={toggleVoiceInput} disabled={loading || !signedIn}><Mic size={14}/>{listening ? copy.stop : copy.mic}</button>
            <div style={{display:"flex",gap:8}}>
              {speaking && <button type="button" className="button button-quiet button-small" onClick={()=>{window.speechSynthesis.cancel();setSpeaking(false);}}><VolumeX size={14}/>{ar ? "إيقاف الصوت" : "Stop voice"}</button>}
              <button type="submit" className="button button-primary" disabled={!input.trim() || loading || !signedIn || usage?.remaining === 0}>{loading ? <LoaderCircle size={14} className="animate-spin"/> : <Send size={14}/>} {copy.send}</button>
            </div>
          </div>
        </form>
      </section>
    </>}
  </div>;
}
