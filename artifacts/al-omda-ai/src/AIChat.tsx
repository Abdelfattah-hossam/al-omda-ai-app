import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Bot, Copy, LoaderCircle, Send, Trash2, Volume2, VolumeX, Plus, Settings2, X, BriefcaseBusiness, Code2, Palette, FileText, Sheet, Presentation, Search, PenLine } from "lucide-react";
import GeminiLiveVoice from "./GeminiLiveVoice";

type Language = "ar" | "en";
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string };
type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type Usage = {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
  providers?: { gemini: boolean; openrouter: boolean };
};

function MessageContent({ content }: { content: string }) {
  const parts: Array<{ type: "text" | "code"; value: string; language?: string }> = [];
  const pattern = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    parts.push({ type: "code", value: match[2], language: match[1] || "code" });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < content.length) parts.push({ type: "text", value: content.slice(lastIndex) });
  if (parts.length === 0) parts.push({ type: "text", value: content });

  return <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
    {parts.map((part, index) => part.type === "code"
      ? <div key={index} style={{ minWidth: 0, border: "1px solid var(--border,#343a44)", borderRadius: 10, overflow: "hidden", background: "#11151b" }}>
          <div style={{ padding: "6px 10px", color: "#c6a76c", fontSize: 11, borderBottom: "1px solid #343a44" }}>{part.language}</div>
          <pre dir="ltr" style={{ margin: 0, padding: 12, overflowX: "auto", color: "#e8edf4", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre" }}><code>{part.value.replace(/\n$/, "")}</code></pre>
        </div>
      : <p key={index} style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{part.value}</p>)}
  </div>;
}

export default function AIChatPage({ language, signedIn, view = "chat" }: { language: Language; signedIn: boolean; view?: "chat" | "usage" }) {
  const ar = language === "ar";
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [showConversationList, setShowConversationList] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [memory, setMemory] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showLiveVoice, setShowLiveVoice] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceHasResultRef = useRef(false);
  const voiceHadErrorRef = useRef(false);
  const voiceStoppedByUserRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const copy = {
    title: ar ? "شات العمدة الذكي" : "AL OMDA AI Chat",
    subtitle: ar ? "العمدة يختار المحرك المجاني الأنسب تلقائيًا." : "AL OMDA automatically selects the best available free engine.",
    login: ar ? "سجّل الدخول لاستخدام الشات وحفظ رصيدك اليومي." : "Sign in to use AI chat and track your daily allowance.",
    placeholder: ar ? "اكتب سؤالك أو اطلب كودًا..." : "Ask a question or request code...",
    send: ar ? "إرسال" : "Send",
    remaining: ar ? "المتبقي اليوم" : "Remaining today",
    used: ar ? "المستخدم" : "Used",
    limit: ar ? "الحد اليومي" : "Daily limit",
    providers: ar ? "المحركات المجانية المهيأة" : "Configured free engines",
    noProvider: ar ? "لم يتم ربط محرك مجاني بعد. أضف مفتاح Gemini أو OpenRouter المجاني في أسرار Cloudflare." : "No free engine is connected yet. Add a free Gemini or OpenRouter key to Cloudflare secrets.",
    voiceUnsupported: ar ? "التعرف الصوتي المباشر غير متاح هنا. استخدم إملاء لوحة مفاتيح iPhone." : "Direct speech recognition is unavailable here. Use iPhone keyboard dictation.",
    keyboardDictation: ar ? "استخدم إملاء لوحة المفاتيح" : "Use keyboard dictation",
    keyboardDictationHelp: ar ? "اضغط الزر لفتح لوحة المفاتيح، ثم اضغط علامة الميكروفون في لوحة مفاتيح iPhone وتحدث بالعربية. سيُكتب كلامك داخل الرسالة دون خدمة مدفوعة." : "Tap to open the keyboard, then tap the microphone on the iPhone keyboard and speak. Your words will be inserted into the message without a paid service.",
    mic: ar ? "تحدث" : "Speak",
    stop: ar ? "إيقاف التسجيل" : "Stop recording",
    voiceNote: ar ? "الصوت يستخدم إمكانات المتصفح والجهاز، وقد يختلف دعمه حسب المتصفح." : "Voice uses browser and device capabilities; support varies by browser.",
    loading: ar ? "العمدة يفكر..." : "AL OMDA is thinking...",
    exhausted: ar ? "انتهى رصيدك اليومي. سيتجدد تلقائيًا عند بداية يوم UTC التالي." : "Your daily allowance is exhausted. It resets at the next UTC day.",
    empty: ar ? "ابدأ محادثتك مع العمدة." : "Start a conversation with AL OMDA.",
    clear: ar ? "محادثة جديدة" : "New chat",
    historyLoading: ar ? "جارٍ تحميل المحادثة المحفوظة..." : "Loading saved conversation...",
    copy: ar ? "نسخ الرد" : "Copy answer",
    copied: ar ? "تم النسخ" : "Copied",
    reset: ar ? "يتجدد الرصيد عند" : "Allowance resets at",
  };

  const loadConversation = async (id: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.conversation) throw new Error(data.error || (ar ? "تعذر تحميل المحادثة." : "Could not load conversation."));
      setActiveConversationId(id);
      setMessages(Array.isArray(data.conversation.messages) ? data.conversation.messages.filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-100) : []);
      setShowConversationList(false);
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل المحادثة." : "Could not load conversation.")); }
    finally { setHistoryLoading(false); }
  };

  const createConversation = async () => {
    if (!signedIn) return "";
    try {
      const response = await fetch("/api/ai/conversations", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: ar ? "محادثة جديدة" : "New chat" }) });
      const data = await response.json();
      if (!response.ok || !data.conversation?.id) throw new Error(data.error || (ar ? "تعذر إنشاء محادثة جديدة." : "Could not create a new conversation."));
      const item = data.conversation as Conversation;
      setConversations((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setActiveConversationId(item.id); setMessages([]); setInput(""); setError(""); setShowConversationList(false);
      return item.id;
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر إنشاء محادثة جديدة." : "Could not create a new conversation.")); return ""; }
  };

  const loadConversations = async () => {
    if (!signedIn) return;
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/ai/conversations", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر تحميل المحادثات." : "Could not load conversations."));
      const items = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
      setConversations(items);
      if (items.length) await loadConversation(items[0].id); else await createConversation();
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل المحادثات." : "Could not load conversations.")); }
    finally { setHistoryLoading(false); }
  };

  const saveHistory = async (items: ChatMessage[], conversationId = activeConversationId) => {
    if (!conversationId) return false;
    try {
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(conversationId), { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: items.slice(-100) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حفظ المحادثة." : "Could not save conversation."));
      if (data.conversation) setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, ...data.conversation } : item).sort((x,y) => Date.parse(y.updated_at)-Date.parse(x.updated_at)));
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر حفظ المحادثة." : "Could not save conversation.")); return false; }
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm(ar ? "هل تريد حذف هذه المحادثة نهائيًا؟" : "Delete this conversation permanently?")) return;
    try {
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حذف المحادثة." : "Could not delete conversation."));
      const rest = conversations.filter((item) => item.id !== id); setConversations(rest);
      if (activeConversationId === id) { if (rest.length) await loadConversation(rest[0].id); else await createConversation(); }
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر حذف المحادثة." : "Could not delete conversation.")); }
  };
  const loadMemory = async () => {
    if (!signedIn) return;
    setMemoryLoading(true);
    try {
      const response = await fetch("/api/ai/memory", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر تحميل ذاكرة العمدة." : "Could not load AI memory."));
      setMemory(typeof data.memory === "string" ? data.memory : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل الذاكرة." : "Could not load memory."));
    } finally {
      setMemoryLoading(false);
    }
  };

  const saveMemory = async () => {
    if (memorySaving || memoryLoading || !signedIn) return;
    setMemorySaving(true);
    setError("");
    try {
      const response = await fetch("/api/ai/memory", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memory }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حفظ الذاكرة." : "Could not save memory."));
      setError(ar ? "تم حفظ ذاكرة العمدة الخاصة بحسابك." : "Your private AL OMDA memory was saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر حفظ الذاكرة." : "Could not save memory."));
    } finally {
      setMemorySaving(false);
    }
  };

  const clearMemory = async () => {
    if (memorySaving || memoryLoading || !signedIn || !memory.trim()) return;
    if (!window.confirm(ar ? "هل تريد حذف ذاكرة العمدة الخاصة بحسابك؟" : "Delete your private AL OMDA memory?")) return;
    setMemorySaving(true);
    setError("");
    try {
      const response = await fetch("/api/ai/memory", { method: "DELETE", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حذف الذاكرة." : "Could not delete memory."));
      setMemory("");
      setError(ar ? "تم حذف الذاكرة الخاصة بحسابك." : "Your private memory was deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر حذف الذاكرة." : "Could not delete memory."));
    } finally {
      setMemorySaving(false);
    }
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

  useEffect(() => { void loadUsage(); void loadConversations(); void loadMemory(); }, [signedIn]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);
  useEffect(() => () => {
    recognitionRef.current?.stop?.();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading || historyLoading || !signedIn || (usage && usage.remaining <= 0)) return;
    const conversationId = activeConversationId || await createConversation();
    if (!conversationId) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");
    await saveHistory(next.slice(-100), conversationId);
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
        const details = Array.isArray(data.details) ? data.details.filter((item: unknown) => typeof item === "string").join(" · ") : "";
        throw new Error([data.error || (ar ? "تعذر إكمال الطلب." : "The request could not be completed."), details].filter(Boolean).join(" — "));
      }
      const completed = [...next, { role: "assistant" as const, content: data.reply, provider: data.provider }].slice(-100);
      setMessages(completed);
      await saveHistory(completed, conversationId);
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
      voiceStoppedByUserRef.current = true;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFallback(true);
      setError(copy.voiceUnsupported);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = ar ? "ar-EG" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    voiceHasResultRef.current = false;
    voiceHadErrorRef.current = false;
    voiceStoppedByUserRef.current = false;
    recognition.onresult = (event: any) => {
      const transcripts: string[] = [];
      for (let index = event.resultIndex ?? 0; index < (event.results?.length ?? 0); index += 1) {
        const transcript = event.results[index]?.[0]?.transcript;
        if (typeof transcript === "string" && transcript.trim()) transcripts.push(transcript.trim());
      }
      const transcript = transcripts.join(" ").trim();
      if (transcript) {
        voiceHasResultRef.current = true;
        setInput((current) => current ? current + " " + transcript : transcript);
      }
    };
    recognition.onerror = (event: any) => {
      voiceHadErrorRef.current = true;
      setListening(false);
      setVoiceFallback(true);
      const code = typeof event?.error === "string" ? event.error : "unknown";
      const messages: Record<string, { ar: string; en: string }> = {
        "not-allowed": { ar: "إذن الميكروفون مرفوض. اسمح للمتصفح باستخدام الميكروفون من إعدادات الموقع.", en: "Microphone permission is denied. Allow microphone access in your browser's site settings." },
        "service-not-allowed": { ar: "خدمة التعرف على الصوت غير مسموح بها في هذا المتصفح.", en: "Speech recognition is not allowed by this browser." },
        "audio-capture": { ar: "لم يتم العثور على ميكروفون متاح. تحقق من توصيله وإذن استخدامه.", en: "No microphone is available. Check the device and microphone permission." },
        "no-speech": { ar: "لم نسمع صوتًا. اضغط الميكروفون وتحدث بوضوح ثم حاول مرة أخرى.", en: "No speech was detected. Tap the microphone and try speaking again." },
        "network": { ar: "تعذر الاتصال بخدمة التعرف على الصوت. تحقق من الإنترنت وحاول مرة أخرى.", en: "Speech recognition service could not be reached. Check your internet connection and try again." },
        "language-not-supported": { ar: "لغة التعرف على الصوت غير مدعومة على هذا الجهاز.", en: "Speech recognition language is not supported on this device." },
        "aborted": { ar: "تم إيقاف التسجيل.", en: "Recording was stopped." },
      };
      if (code === "aborted" && voiceStoppedByUserRef.current) return;
      const detail = messages[code];
      setError(detail ? (ar ? detail.ar : detail.en) : (ar ? "تعذر التعرف على الصوت (" + code + "). تحقق من إذن الميكروفون ودعم المتصفح." : "Speech recognition failed (" + code + "). Check microphone permission and browser support."));
    };
    recognition.onend = () => {
      setListening(false);
      if (!voiceHasResultRef.current && !voiceHadErrorRef.current) {
        setVoiceFallback(true);
        setError(ar
          ? "Safari أنهى التسجيل لكنه لم يُرجع نصًا. قد لا تدعم خدمة التعرف على الصوت العربية في هذا المتصفح حاليًا. جرّب تحديث الصفحة والتحدث بوضوح، وإذا تكررت المشكلة سنضيف طريقة صوت بديلة."
          : "Safari ended recording without returning a transcript. Speech recognition may not be available for this language in this browser. Refresh and try again; if it persists, we can add an alternative voice method.");
      }
    };
    recognitionRef.current = recognition;
    setError("");
    setVoiceFallback(false);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setVoiceFallback(true);
      setError(ar ? "تعذر بدء التعرف على الصوت في Safari." : "Safari could not start speech recognition.");
    }
  };

  const handleLiveTranscript = (role: "user" | "assistant", text: string) => {
    setMessages((current) => {
      const next = [...current, { role, content: text } as ChatMessage].slice(-100);
      void saveHistory(next);
      return next;
    });
  };

  const copyAnswer = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => current === index ? null : current), 1800);
    } catch {
      setError(ar ? "تعذر النسخ؛ حدّد النص وانسخه يدويًا." : "Could not copy. Select the text and copy it manually.");
    }
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const spoken = text
      .replace(/```[\s\S]*?```/g, ar ? " كود برمجي. " : " Code block. ")
      .replace(/\bAPI\b/gi, ar ? "إيه بي آي" : "A P I")
      .replace(/\bAI\b/gi, ar ? "إيه آي" : "A I")
      .replace(/\bChatGPT\b/gi, ar ? "شات جي بي تي" : "Chat G P T")
      .replace(/\bOpenRouter\b/gi, ar ? "أوبن راوتر" : "Open Router")
      .replace(/\bGemini\b/gi, ar ? "جيمناي" : "Gemini")
      .replace(/\bCloudflare\b/gi, ar ? "كلاود فلير" : "Cloudflare")
      .replace(/\s+/g, " ")
      .trim();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = ar ? "ar-EG" : "en-US";
    utterance.rate = 0.94;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const providerNames = usage?.providers
    ? Object.entries(usage.providers).filter(([, active]) => active).map(([name]) => name === "gemini" ? "Gemini" : "OpenRouter Free")
    : [];
  const percent = usage ? Math.max(0, Math.min(100, usage.remaining / usage.limit * 100)) : 0;

  return <div className="page-enter">
    <div className="page-heading ai-chat-heading">
      <div><div className="eyebrow">AL OMDA AI</div><h1 className="page-title">{copy.title}</h1><p className="page-subtitle">{copy.subtitle}</p></div>
      <div className="ai-chat-actions">
        <span className="status-chip"><Bot size={13}/>{ar ? "توجيه تلقائي" : "Auto routing"}</span>
        <button type="button" className="button button-quiet button-small" onClick={()=>void clearChat()} disabled={loading || clearing || historyLoading || messages.length===0}><Trash2 size={13}/>{copy.clear}</button>
        <button type="button" className="button button-quiet button-small" onClick={()=>setShowSettings((v)=>!v)} aria-expanded={showSettings}>{showSettings ? <X size={14}/> : <Settings2 size={14}/>}{ar ? "الاستخدام والذاكرة" : "Usage & memory"}</button>
      </div>
    </div>
    {!signedIn ? <section className="panel panel-pad"><p className="account-copy">{copy.login}</p></section> : <>
      {showSettings && <div className="ai-settings-drawer">      <section className="panel panel-pad" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 className="section-title">{copy.remaining}</h2><strong>{usage ? `${usage.remaining} / ${usage.limit}` : "—"}</strong></div>
        <div style={{height:9,background:"var(--surface-muted,#252a32)",borderRadius:99,overflow:"hidden",margin:"12px 0"}}>
          <div style={{height:"100%",width:`${percent}%`,background:"#c6a76c",borderRadius:99,transition:"width .2s"}}/>
        </div>
        <div className="setting-row"><div><strong>{copy.used}</strong><small>{usage?.used ?? "—"}</small></div><div><strong>{copy.limit}</strong><small>{usage?.limit ?? 100}</small></div></div>
        {usage?.resetAt && <small className="muted">{copy.reset} {new Date(usage.resetAt).toLocaleTimeString(ar ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</small>}
        <div className="setting-row"><div><strong>{copy.providers}</strong><small>{providerNames.length ? providerNames.join(" · ") : "—"}</small></div></div>
        {usage && providerNames.length === 0 && <div className="notice-bar" style={{marginTop:10}}>{copy.noProvider}</div>}
        <small className="muted">{copy.voiceNote}</small>
      </section>
      <section className="panel panel-pad" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 className="section-title">{ar ? "ذاكرة العمدة الخاصة بك" : "Your private AL OMDA memory"}</h2><span className="muted">{memory.length}/6000</span></div>
        <p className="muted" style={{ margin: "8px 0" }}>{ar ? "اكتب تفضيلاتك ومشاريعك وقراراتك المهمة. سيستخدمها العمدة لتخصيص ردوده واستكمال العمل. الذاكرة خاصة بحسابك ويمكنك تعديلها أو حذفها في أي وقت." : "Save your preferences, projects, and important decisions. AL OMDA will use them to personalize replies and continue work. This memory is private to your account and can be edited or deleted anytime."}</p>
        <textarea className="field" rows={4} maxLength={6000} value={memory} onChange={(event)=>setMemory(event.target.value)} placeholder={ar ? "مثال: أفضل الشرح خطوة بخطوة. أعمل على مشروع العمدة AI، ولا أريد خدمات مدفوعة..." : "Example: I prefer step-by-step guidance. I am building AL OMDA AI and want to avoid paid services..."} disabled={memoryLoading || memorySaving}/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
          <button type="button" className="button button-primary" onClick={()=>void saveMemory()} disabled={memoryLoading || memorySaving}>{memorySaving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ الذاكرة" : "Save memory")}</button>
          <button type="button" className="button button-quiet button-small" onClick={()=>void clearMemory()} disabled={memoryLoading || memorySaving || !memory.trim()}>{ar ? "حذف الذاكرة" : "Delete memory"}</button>
          {memoryLoading && <small className="muted">{ar ? "جارٍ تحميل الذاكرة..." : "Loading memory..."}</small>}
        </div>
      </section>
      </div>}
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{ar ? "المحادثة" : "Conversation"}</h2><span className="muted">{messages.length} {ar ? "رسالة" : "messages"}</span></div>
        {historyLoading && <small className="muted" style={{display:"block",marginBottom:8}}>{copy.historyLoading}</small>}
        <div className="chat-messages" aria-live="polite" style={{minHeight:250,maxHeight:"52vh",overflowY:"auto"}}>
          {messages.length === 0 && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.empty}</p></div>}
          {messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}>
            <strong>{message.role === "user" ? (ar ? "أنت" : "You") : `AL OMDA AI${message.provider ? " · " + message.provider : ""}`}</strong>
            <MessageContent content={message.content} />
            {message.role === "assistant" && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="button" className="button button-quiet button-small" onClick={()=>speak(message.content)} aria-label={ar ? "استمع للإجابة" : "Read answer aloud"}><Volume2 size={13}/>{ar ? "استمع" : "Listen"}</button>
              <button type="button" className="button button-quiet button-small" onClick={()=>void copyAnswer(message.content,index)}><Copy size={13}/>{copiedIndex===index?copy.copied:copy.copy}</button>
            </div>}
          </div>)}
          {loading && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.loading}</p></div>}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="notice-bar notice-error" role="alert" style={{marginBottom:12}}>{error}</div>}
        {usage?.remaining === 0 && <div className="notice-bar" style={{marginBottom:12}}>{copy.exhausted}</div>}
        <div className="ai-voice-actions">
          <button type="button" className="button button-quiet button-small ai-live-voice-button" onClick={()=>setShowLiveVoice((value)=>!value)} aria-expanded={showLiveVoice}>
            <Volume2 size={14}/>{ar ? "المحادثة الصوتية" : "Live voice"}{showLiveVoice ? <X size={13}/> : null}
          </button>
        </div>
        {showLiveVoice && <div className="ai-voice-panel">
          <GeminiLiveVoice language={language} disabled={loading || historyLoading || !signedIn || usage?.remaining === 0} onTranscript={handleLiveTranscript} />
          <small className="muted" style={{ display: "block", marginTop: 6 }}>{ar ? "تحدث مع العمدة مباشرة بالصوت، وسيجيبك بصوته دون كتابة." : "Talk to AL OMDA naturally; it listens and replies with voice, without typing."}</small>
        </div>}
        <form onSubmit={sendMessage} className="ai-composer">
          <div className="ai-composer-tools">
            <div className="ai-plus-wrap">
              <button type="button" className="ai-plus-button" aria-label={ar ? "خيارات العمل" : "Work options"} aria-expanded={showPlusMenu} onClick={()=>setShowPlusMenu((v)=>!v)}><Plus size={20}/></button>
              {showPlusMenu && <div className="ai-plus-menu" role="menu">
                {[
                  {icon:BriefcaseBusiness,label:ar?"مشروع جديد":"New project",prompt:ar?"أريد إنشاء مشروع جديد من البداية: ":"I want to create a new project from scratch: "},
                  {icon:Code2,label:ar?"برمجة وتطوير":"Coding & development",prompt:ar?"أريد تنفيذ مهمة برمجية: ":"I need help implementing a coding task: "},
                  {icon:Palette,label:ar?"تصميم":"Design",prompt:ar?"أريد تصميم: ":"I want to design: "},
                  {icon:FileText,label:ar?"مستند Word":"Word document",prompt:ar?"أنشئ مستند Word عن: ":"Create a Word document about: "},
                  {icon:Sheet,label:"Excel",prompt:ar?"أنشئ ملف Excel لـ: ":"Create an Excel workbook for: "},
                  {icon:Presentation,label:"PowerPoint",prompt:ar?"أنشئ عرض PowerPoint عن: ":"Create a PowerPoint presentation about: "},
                  {icon:Search,label:ar?"بحث ودراسة":"Research",prompt:ar?"أجرِ بحثًا ودراسة عن: ":"Research and analyze: "},
                  {icon:PenLine,label:ar?"كتابة محتوى":"Content writing",prompt:ar?"اكتب محتوى عن: ":"Write content about: "}
                ].map((item,index)=><button type="button" className="ai-plus-option" key={index} onClick={()=>{setInput(item.prompt);setShowPlusMenu(false);inputRef.current?.focus();}}><item.icon size={16}/><span>{item.label}</span></button>)}
              </div>}
            </div>
            <textarea ref={inputRef} className="field ai-composer-input" rows={1} maxLength={8000} value={input} onChange={(event)=>setInput(event.target.value)} placeholder={copy.placeholder} disabled={loading || historyLoading || !signedIn || usage?.remaining === 0}/>
            <button type="submit" className="ai-send-button" aria-label={copy.send} disabled={!input.trim() || loading || historyLoading || !signedIn || usage?.remaining === 0}>{loading ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button>
          </div>
          <div className="ai-composer-footer">
            <div>{speaking && <button type="button" className="button button-quiet button-small" onClick={()=>{window.speechSynthesis.cancel();setSpeaking(false);}}><VolumeX size={14}/>{ar ? "إيقاف الصوت" : "Stop voice"}</button>}</div>
            <small className="muted">{usage ? (ar ? `متبقي ${usage.remaining} من ${usage.limit} وحدة` : `${usage.remaining} of ${usage.limit} units left`) : copy.subtitle}</small>
          </div>
        </form>
      </section>
    </>}
  </div>;
}
