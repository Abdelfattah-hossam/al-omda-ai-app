import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Bot, Copy, LoaderCircle, Send, Trash2, Volume2, VolumeX, Plus, Settings2, X, BriefcaseBusiness, Code2, Palette, FileText, Sheet, Presentation, Search, PenLine, History, MessageSquareText, ArrowLeft, ImagePlus } from "lucide-react";
import GeminiLiveVoice from "./GeminiLiveVoice";
import { readAgentEventStream } from "./lib/agent-stream";

type Language = "ar" | "en";
type WordDocumentData = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };
type SpreadsheetData = { title: string; columns: string[]; rows: string[][] };
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string; agentPending?: { sessionId: string; calls: Array<{ id: string; tool: string; arguments: Record<string, unknown> }> }; attachment?: { name: string; url: string }; documentData?: WordDocumentData; spreadsheetData?: SpreadsheetData; appData?: { title: string; html: string }; taskId?: string; taskTitle?: string };
type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type Usage = {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
  providers?: { gemini: boolean; openrouter: boolean };
};

function detectProjectSpecialty(request: string): "business" | "development" | "design" | "marketing" | "research" | "assistant" | null {
  const value = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").trim();
  if (/^(?:كيف|ازاي|ازاى|ما هو|ما هي|اشرح|شرح|طريقة|what is|how to|how do i|explain|teach me)|(?:عايز اعرف|محتاج افهم|I want to know how)/i.test(value)) return null;
  const buildVerb = /(?:اعمل|اعملي|تعمل|تعملي|تعمللي|اعملوا|أنشئ|انشئ|إنشاء|ابني|ابنيلي|بناء|نفذ|نفّذ|تنفيذ|صمم|صمّم|طور|تطوير|برمج|ابدا|اشتغل على|كمل بناء|build|create|develop|make|implement|start|build me|create me)/i.test(value);
  const directRequest = /(?:عايز|عاوز|محتاج|اريد|أريد)\s+(?:(?:اعمل|اعمللي|أنشئ|انشئ|إنشاء|ابني|بناء|نفذ|صمم|طور)\s+)?(?:مشروع(?:\s+جديد)?|تطبيق|ابلكيشن|موقع(?:\s+إلكتروني)?|برنامج|متجر(?:\s+إلكتروني)?|نظام|منصة|لعبة|website|web app|mobile app|application|software|project|store|platform|system)/i.test(value);
  const fromScratch = /(?:من الصفر للنهاية|من البداية للنهاية|من الصفر|from scratch|end.to.end)/i.test(value);
  const hasProject = /(?:مشروع|تطبيق|ابلكيشن|موقع|برنامج|متجر|نظام|منصة|لعبة|شعار|لوجو|هوية|تصميم|واجهة|بوستر|حملة|بحث|دراسة|تحليل|تقرير|عرض تقديمي|أتمتة|تكامل|قاعدة بيانات|بوت|وكيل|محتوى|خطة عمل|خطة تسويق|دراسة جدوى|website|web app|mobile app|application|software|project|store|platform|system|logo|brand identity|design project|campaign|research|study|analysis|report|presentation|automation|integration|database|bot|agent|content strategy|business plan|marketing plan|workflow)/i.test(value);
  if (!((buildVerb && hasProject) || directRequest || (fromScratch && hasProject))) return null;
  if (/(?:بحث|دراسة|مقارنة|تحليل|research|study|compare|analysis)/i.test(value)) return "research";
  if (/(?:تيك.?توك|تسويق|حملة|إعلان|محتوى|فيديو|marketing|campaign|content|social)/i.test(value)) return "marketing";
  if (/(?:شعار|لوجو|هوية|تصميم|واجهة|بوستر|logo|brand|design|ui|ux)/i.test(value)) return "design";
  if (/(?:موقع|ويب|تطبيق|ابلكيشن|برنامج|نظام|منصة|قاعدة بيانات|بوت|وكيل|أتمتة|تكامل|website|web app|mobile app|application|software|api|database|bot|agent|automation|integration|workflow|code|برمج|كود)/i.test(value)) return "development";
  if (/(?:جدول|تنظيم|مواعيد|أولويات|schedule|organize|calendar)/i.test(value)) return "assistant";
  return "business";
}

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
  const [pendingImage, setPendingImage] = useState<{ name: string; mimeType: string; data: string; preview: string } | null>(null);
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
  const [showRoutingInfo, setShowRoutingInfo] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentRuntimeUrl, setAgentRuntimeUrl] = useState("http://127.0.0.1:4318");
  const [agentToken, setAgentToken] = useState("");
  const [agentSessionId, setAgentSessionId] = useState(() => { try { return window.localStorage.getItem("omda-agent-session") || ""; } catch { return ""; } });
  const [agentConnectionStatus, setAgentConnectionStatus] = useState("");
  const [agentSessions, setAgentSessions] = useState<Array<{ id: string; updatedAt: string; lastMessage: string; pending: boolean }>>([]);
  const [memory, setMemory] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showLiveVoice, setShowLiveVoice] = useState(false);
  const [previewingDocument, setPreviewingDocument] = useState<number | null>(null);
  const [generatedSpeech, setGeneratedSpeech] = useState<Record<number, string>>({});
  const [speechLoadingIndex, setSpeechLoadingIndex] = useState<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const historyLoadingRef = useRef(historyLoading);
  historyLoadingRef.current = historyLoading;
  const recognitionRef = useRef<any>(null);
  const voiceHasResultRef = useRef(false);
  const voiceHadErrorRef = useRef(false);
  const voiceStoppedByUserRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const speechUrlsRef = useRef<string[]>([]);
  useEffect(() => () => { speechUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const copy = {
    title: ar ? "شات العمدة الذكي" : "AL OMDA AI Chat",
    subtitle: ar ? "العمدة يختار نموذجًا مجانيًا متخصصًا حسب طلبك ويجرّب بدائل تلقائيًا." : "AL OMDA selects a specialized free model for each request and automatically tries alternatives.",
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
      const restored = Array.isArray(data.conversation.messages) ? data.conversation.messages.filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-100) as ChatMessage[] : [];
      const withFiles = await Promise.all(restored.map(async (item) => {
        if (item.documentData) return { ...item, attachment: await createWordAttachment(item.documentData).catch(() => undefined) };
        if (item.spreadsheetData) return { ...item, attachment: await createExcelAttachment(item.spreadsheetData).catch(() => undefined) };
        if (item.appData) { const blob = new Blob([item.appData.html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); return { ...item, attachment: { name: "AL-OMDA-app.html", url } }; }
        return item;
      }));
      setMessages(withFiles);
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
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(conversationId), { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: items.slice(-100).map(({ role, content, provider, agentPending, documentData, spreadsheetData, appData, taskId, taskTitle }) => ({ role, content, ...(provider ? { provider } : {}), ...(agentPending ? { agentPending } : {}), ...(documentData ? { documentData } : {}), ...(spreadsheetData ? { spreadsheetData } : {}), ...(appData ? { appData } : {}), ...(taskId ? { taskId } : {}), ...(taskTitle ? { taskTitle } : {}) })) }) });
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

  useEffect(() => { void loadUsage(); if (view === "chat") void loadConversations(); void loadMemory(); }, [signedIn, view]);

  // Keep the same signed-in account in sync across phones, computers, and browser tabs.
  useEffect(() => {
    if (!signedIn || view !== "chat" || !activeConversationId) return;
    let stopped = false;
    let syncing = false;
    const sync = async () => {
      // Never poll while a send or conversation restore is in progress. Keep the
      // polling effect stable instead of restarting it for every loading-state change.
      if (stopped || syncing || document.visibilityState !== "visible" || loadingRef.current || historyLoadingRef.current) return;
      syncing = true;
      try {
        const [listResponse, conversationResponse] = await Promise.all([
          fetch("/api/ai/conversations", { credentials: "same-origin" }),
          fetch("/api/ai/conversations/" + encodeURIComponent(activeConversationId), { credentials: "same-origin" }),
        ]);
        if (!listResponse.ok || !conversationResponse.ok) return;
        const [listData, conversationData] = await Promise.all([listResponse.json(), conversationResponse.json()]);
        if (stopped) return;
        if (Array.isArray(listData.conversations) && JSON.stringify(conversationsRef.current) !== JSON.stringify(listData.conversations)) {
          setConversations(listData.conversations);
        }
        // Compare only visible content; metadata-only differences must never reload the transcript.
        const remote = Array.isArray(conversationData.conversation?.messages)
          ? conversationData.conversation.messages
              .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
              .slice(-100)
              .map((item: any) => ({ role: item.role, content: item.content }))
          : [];
        const local = messagesRef.current.map(({ role, content }) => ({ role, content }));
        if (JSON.stringify(remote) !== JSON.stringify(local) && !loadingRef.current && !historyLoadingRef.current) {
          shouldAutoScrollRef.current = false;
          await loadConversation(activeConversationId);
        }
      } catch {
        // A temporary sync failure must not interrupt the current conversation.
      } finally {
        syncing = false;
      }
    };
    void sync();
    const interval = window.setInterval(() => void sync(), 4000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, view, activeConversationId]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    // Scroll only inside the message list, and only while the reader is already at its end.
    // This avoids moving the whole page or pulling someone away from older messages.
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  }, [messages, loading]);
  useEffect(() => () => {
    recognitionRef.current?.stop?.();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);


  const createWordAttachment = async (documentData: { title: string; paragraphs: string[]; columns: string[]; rows: string[][] }) => {
    const primaryModuleUrl = "https://esm.sh/docx@9.5.1";
    const fallbackModuleUrl = "https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm";
    let lib: any;
    try { lib = await import(/* @vite-ignore */ primaryModuleUrl); }
    catch {
      try { lib = await import(/* @vite-ignore */ fallbackModuleUrl); }
      catch {
        // Offline-safe Word fallback: Word opens this HTML-based .doc file directly.
        const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
        const paragraphs = documentData.paragraphs.map((item) => "<p>" + escapeHtml(item).replace(/\n/g, "<br>") + "</p>").join("");
        const table = documentData.columns.length ? "<table><thead><tr>" + documentData.columns.map((item) => "<th>" + escapeHtml(item) + "</th>").join("") + "</tr></thead><tbody>" + documentData.rows.map((row) => "<tr>" + documentData.columns.map((_, index) => "<td>" + escapeHtml(String(row[index] ?? "")) + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : "";
        const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:Arial,sans-serif;direction:" + (ar ? "rtl" : "ltr") + ";line-height:1.8}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{border:1px solid #888;padding:7px;text-align:start}th{background:#e8edf5}</style></head><body><h1>" + escapeHtml(documentData.title) + "</h1>" + paragraphs + table + "</body></html>";
        const file = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const safeName = (documentData.title || "AL-OMDA-document").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-document";
        return { name: safeName + ".doc", url };
      }
    }
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = lib as any;
    const rtl = ar;
    const border = { style: "single", size: 1, color: "B8C2D2" };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
    const makeParagraph = (value: string, bold = false) => new Paragraph({
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: rtl,
      children: [new TextRun({ text: value, bold, font: "Arial", size: 20 })],
      spacing: { after: 120 },
    });
    const children: any[] = [
      new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, children: [new TextRun({ text: documentData.title, bold: true, size: 32, font: "Arial" })], spacing: { after: 260 } }),
      ...documentData.paragraphs.map((paragraph) => makeParagraph(paragraph)),
    ];
    if (documentData.columns.length > 0) {
      const header = new TableRow({ tableHeader: true, children: documentData.columns.map((column) => new TableCell({
        shading: { fill: "E8EDF5" }, verticalAlign: "center", children: [makeParagraph(column, true)],
      })) });
      const bodyRows = documentData.rows.map((row) => new TableRow({
        children: documentData.columns.map((_, index) => new TableCell({
          verticalAlign: "center", children: [makeParagraph(String(row[index] ?? ""))],
        })),
      }));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: documentData.columns.map(() => Math.floor(9000 / documentData.columns.length)),
        borders, rows: [header, ...bodyRows],
      }));
    }
    const file = await Packer.toBlob(new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 800, bottom: 900, left: 800 } } }, children }] }));
    const url = URL.createObjectURL(file);
    const safeName = (documentData.title || "AL-OMDA-document").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-document";
    return { name: safeName + ".docx", url };
  };

  const createExcelAttachment = async (data: SpreadsheetData) => {
    const primaryModuleUrl = "https://esm.sh/xlsx@0.18.5";
    const fallbackModuleUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
    let lib: any;
    try { lib = await import(/* @vite-ignore */ primaryModuleUrl); }
    catch {
      try { lib = await import(/* @vite-ignore */ fallbackModuleUrl); }
      catch {
        // Excel-compatible CSV fallback keeps the deliverable available without a CDN.
        const escapeCsv = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
        const csv = "\ufeff" + [data.columns, ...data.rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
        const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const safeName = (data.title || "AL-OMDA-workbook").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-workbook";
        return { name: safeName + ".csv", url };
      }
    }
    const XLSX = (lib as any).default ?? lib;
    const worksheet = XLSX.utils.aoa_to_sheet([data.columns, ...data.rows]);
    worksheet["!cols"] = data.columns.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(file);
    const safeName = (data.title || "AL-OMDA-workbook").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-workbook";
    return { name: safeName + ".xlsx", url };
  };

  const continueLocalAgent = async (messageIndex: number, approve: boolean) => {
    const target = messages[messageIndex];
    if (!target?.agentPending || !agentToken.trim() || loading) return;
    setLoading(true); setError("");
    try {
      const endpoint = agentRuntimeUrl.replace(/\/+$/, "");
      let streamedText = "";
      const startedAt = Date.now();
      const response = await fetch(endpoint + "/v1/agent/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + agentToken.trim() }, body: JSON.stringify({ action: "continue", sessionId: target.agentPending.sessionId, approvedCallIds: approve ? target.agentPending.calls.map((call) => call.id) : [] }) });
      const data = await readAgentEventStream(response, (event) => {
        if (event.type === "token" && event.text) {
          streamedText += event.text;
          const seconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
          const estimated = Math.round((streamedText.length / 4) / seconds);
          setMessages([...messages, { role: "assistant", content: streamedText + "\n\n" + (ar ? "سرعة مباشرة تقريبية: " : "Live estimate: ") + estimated + " tok/s", provider: "Local Agent" }]);
        }
      }) as any;
      const pending = Array.isArray(data.pending) ? data.pending : [];
      const reply = typeof data.message === "string" ? data.message : (ar ? "استكمل الوكيل التنفيذ." : "The agent continued.");
      const updated = messages.map((item, index) => index === messageIndex ? { ...item, agentPending: undefined, content: item.content + (approve ? (ar ? "\n\nتمت الموافقة على الإجراءات المطلوبة." : "\n\nRequested actions were approved.") : (ar ? "\n\nتم رفض الإجراءات المطلوبة." : "\n\nRequested actions were denied.")) } : item);
      const resultMessage: ChatMessage = { role: "assistant", content: reply + (pending.length ? (ar ? "\n\nهناك إجراءات أخرى تحتاج موافقتك." : "\n\nMore actions need your approval.") : ""), provider: "Local Agent", ...(pending.length ? { agentPending: { sessionId: data.sessionId || target.agentPending.sessionId, calls: pending } } : {}) };
      const completed = [...updated, resultMessage].slice(-100); setMessages(completed); await saveHistory(completed);
      if (data.sessionId) { setAgentSessionId(data.sessionId); try { window.localStorage.setItem("omda-agent-session", data.sessionId); } catch {} }
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "فشل استكمال الوكيل." : "Agent continuation failed.")); }
    finally { setLoading(false); }
  };

  const checkLocalAgentConnection = async () => {
    setAgentConnectionStatus(ar ? "جارٍ اختبار الاتصال..." : "Checking connection...");
    try {
      const response = await fetch(new URL(agentRuntimeUrl.trim()).origin + "/health", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Runtime health check failed.");
      setAgentConnectionStatus(ar ? "متصل — " + (data.execution || "جاهز") : "Connected — " + (data.execution || "ready"));
    } catch (err) {
      setAgentConnectionStatus((ar ? "غير متصل: " : "Not connected: ") + (err instanceof Error ? err.message : "connection failed"));
    }
  };

  const loadAgentSessions = async () => {
    if (!agentToken.trim()) { setError(ar ? "أدخل رمز الاتصال أولًا." : "Enter the access token first."); return; }
    try {
      const response = await fetch(new URL(agentRuntimeUrl.trim()).origin + "/v1/agent/sessions", { headers: { authorization: "Bearer " + agentToken.trim() }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر تحميل الجلسات." : "Could not load sessions."));
      const items = Array.isArray(data.sessions) ? data.sessions : [];
      setAgentSessions(items);
      if (!items.length) setAgentConnectionStatus(ar ? "لا توجد جلسات محفوظة." : "No saved sessions.");
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل الجلسات." : "Could not load sessions.")); }
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const imageForRequest = pendingImage;
    const text = input.trim() || (imageForRequest ? (ar ? "حلّل الصورة المرفقة واشرح ما يظهر فيها." : "Analyze the attached image and explain what it shows.") : "");
    if (!text || loading || historyLoading || sendingRef.current || !signedIn || (!agentMode && usage && usage.remaining <= 0)) return;
    // Lock synchronously before the first await so rapid taps/Enter presses cannot
    // create duplicate conversations or send the same request twice.
    sendingRef.current = true;
    setLoading(true);
    try {
      const conversationId = activeConversationId || await createConversation();
      if (!conversationId) return;
      const next = [...messages, { role: "user" as const, content: text }];
      setPendingImage(null);
      shouldAutoScrollRef.current = true;
      setMessages(next);
      setInput("");
      setError("");
      await saveHistory(next.slice(-100), conversationId);
      if (agentMode) {
        if (imageForRequest) throw new Error(ar ? "وضع Agent المحلي لا يستقبل الصور حاليًا. أوقف وضع Agent لتحليل الصورة." : "Local Agent mode does not accept images yet. Turn it off to analyze the image.");
        if (!agentRuntimeUrl.trim() || !agentToken.trim()) throw new Error(ar ? "أدخل عنوان Runtime المحلي ورمز الاتصال أولًا." : "Enter the local runtime URL and access token first.");
        const endpoint = agentRuntimeUrl.replace(/\/+$/, "");
        const priorContext = next.slice(-10, -1).map((item) => item.role + ": " + item.content).join("\n\n").slice(-12000);
        const goal = [priorContext, "Current user request: " + text].filter(Boolean).join("\n\n");
        const action = agentSessionId ? "resume" : "run";
        let streamedText = "";
        const startedAt = Date.now();
        const response = await fetch(endpoint + "/v1/agent/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + agentToken.trim() }, body: JSON.stringify(agentSessionId ? { action, sessionId: agentSessionId, goal } : { action, goal }) });
        const data = await readAgentEventStream(response, (event) => {
          if (event.type === "token" && event.text) {
            streamedText += event.text;
            const seconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
            const estimated = Math.round((streamedText.length / 4) / seconds);
            setMessages([...next, { role: "assistant", content: streamedText + "\n\n" + (ar ? "سرعة مباشرة تقريبية: " : "Live estimate: ") + estimated + " tok/s", provider: "Local Agent" }]);
          } else if (event.type === "status" && event.status === "delegating") {
            setMessages([...next, { role: "assistant", content: ar ? "الوكيل يقسم المهمة على " + (event.agentCount || 2) + " وكلاء متخصصين..." : "Agent is splitting the task across " + (event.agentCount || 2) + " specialists...", provider: "Local Agent" }]);
          } else if (event.type === "status" && event.status === "specialist_started") {
            setMessages([...next, { role: "assistant", content: (ar ? "بدأ الوكيل المتخصص: " : "Specialist started: ") + (event.role || ""), provider: "Local Agent" }]);
          } else if (event.type === "status" && event.status === "using_tools" && !streamedText) {
            setMessages([...next, { role: "assistant", content: ar ? "الوكيل يختار الأدوات وينفذ الخطوات..." : "Agent is selecting tools and executing steps...", provider: "Local Agent" }]);
          }
        }) as any;
        const pending = Array.isArray(data.pending) ? data.pending : [];
        const reply = typeof data.message === "string" && data.message ? data.message : data.status === "approval_required" ? (ar ? "الوكيل يحتاج موافقتك قبل تنفيذ بعض الإجراءات." : "The agent needs your approval before taking some actions.") : data.status === "limit_reached" ? (ar ? "وصل الوكيل إلى حد خطوات الأمان. أرسل متابعة لاستكمال الجلسة." : "The agent reached its safety turn limit. Send a follow-up to continue.") : (ar ? "انتهى تنفيذ الوكيل." : "The agent run finished.");
        const assistantMessage: ChatMessage = { role: "assistant", content: reply, provider: "Local Agent", ...(pending.length ? { agentPending: { sessionId: data.sessionId, calls: pending } } : {}) };
        if (data.sessionId) { setAgentSessionId(data.sessionId); try { window.localStorage.setItem("omda-agent-session", data.sessionId); } catch {} }
        const completed = [...next, assistantMessage].slice(-100); setMessages(completed); await saveHistory(completed, conversationId);
        return;
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12).map((message, index, list) => ({
          role: message.role,
          content: message.content,
          ...(index === list.length - 1 && imageForRequest ? { image: { mimeType: imageForRequest.mimeType, data: imageForRequest.data } } : {}),
        })) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.usage) setUsage(data.usage);
        const details = Array.isArray(data.details) ? data.details.filter((item: unknown) => typeof item === "string").join(" · ") : "";
        throw new Error([data.error || (ar ? "تعذر إكمال الطلب." : "The request could not be completed."), details].filter(Boolean).join(" — "));
      }
      let assistantMessage: ChatMessage = { role: "assistant", content: data.reply, provider: data.model ? `${data.provider} · ${data.model}` : data.provider };
      if (data.app && typeof data.app.title === "string" && typeof data.app.html === "string") {
        const blob = new Blob([data.app.html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        assistantMessage = { ...assistantMessage, attachment: { name: "AL-OMDA-app.html", url }, appData: data.app };
      } else if (data.spreadsheet && typeof data.spreadsheet.title === "string" && Array.isArray(data.spreadsheet.columns) && Array.isArray(data.spreadsheet.rows)) {
        const attachment = await createExcelAttachment(data.spreadsheet);
        assistantMessage = { ...assistantMessage, attachment, spreadsheetData: data.spreadsheet };
      } else if (data.document && typeof data.document.title === "string" && Array.isArray(data.document.columns) && Array.isArray(data.document.rows)) {
        const attachment = await createWordAttachment(data.document);
        assistantMessage = { ...assistantMessage, attachment, documentData: data.document };
      }
      // Detect a project from the current message AND the recent user context.
      // This keeps follow-up commands such as "ابدأ" or "نفّذ" attached to the project
      // the user has just described, instead of losing them because the last sentence is short.
      const projectRequestContext = next.filter((message) => message.role === "user").slice(-6, -1).map((message) => message.content).join("\n\n").slice(-5000);
      const currentProjectSpecialty = detectProjectSpecialty(text);
      const linkedProjectMessage = [...next].reverse().find((message) => message.role === "assistant" && Boolean(message.taskId));
      const explicitlyNewProject = /(?:مشروع جديد|ابدأ مشروع جديد|انشئ مشروع جديد|new project|start a new project)/i.test(text);
      const continuesExistingProject = /^(?:كمل|كمّل|استكمل|تابع|نفذ|نفّذ|عدّل|عدل|راجع|اختبر|صلح|أصلح|طوّر|طور|ابدأ|ابدا|continue|resume|proceed|implement|fix|test|review|update)\\b?/i.test(text.trim());
      // A previous task is linked only when the current message is clearly a project follow-up.
      // Ordinary questions and greetings must remain ordinary chat replies.
      if (linkedProjectMessage?.taskId && continuesExistingProject && !explicitlyNewProject) {
        assistantMessage = { ...assistantMessage, taskId: linkedProjectMessage.taskId, taskTitle: linkedProjectMessage.taskTitle };
      }
      const projectSpecialty = currentProjectSpecialty
        ? currentProjectSpecialty
        : continuesExistingProject && !linkedProjectMessage?.taskId
          ? detectProjectSpecialty([text, projectRequestContext].filter(Boolean).join("\n\n"))
          : null;
      if (projectSpecialty) {
        try {
          const planResponse = await fetch("/api/ai/project-plan", {
            method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
            body: JSON.stringify({ request: text.slice(0, 5000), context: projectRequestContext, specialty: projectSpecialty, language: ar ? "ar" : "en" }),
          });
          const plan = await planResponse.json().catch(() => ({}));
          if (!planResponse.ok || !Array.isArray(plan.steps) || !plan.title) throw new Error(plan.error || "تعذر تجهيز خطة المشروع.");
          const taskResponse = await fetch("/api/tasks", {
            method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: String(plan.title).slice(0, 160), request: [text, projectRequestContext ? "Relevant earlier project context (only details that apply):\n" + projectRequestContext : ""].filter(Boolean).join("\n\n").slice(0, 10000), specialty: projectSpecialty, status: "review",
              steps: plan.steps.map((step: any) => ({ id: crypto.randomUUID(), text: String(step.text || "").slice(0, 1200), output: String(step.output || "").slice(0, 1200), complete: String(step.complete || "").slice(0, 1200), state: "pending" })),
            }),
          });
          const taskData = await taskResponse.json().catch(() => ({}));
          if (!taskResponse.ok || !taskData.id) throw new Error(taskData.error || "تعذر حفظ المشروع في سجل المهام.");
          assistantMessage = {
            ...assistantMessage,
            content: assistantMessage.content + (ar ? "\n\nتم تسجيل المشروع تلقائيًا في **سجل المهام** بعنوان: " : "\n\nThis project was automatically added to **Task History**: ") + taskData.title,
            taskId: taskData.id,
            taskTitle: taskData.title,
          };
          if (plan.usage) setUsage(plan.usage);
        } catch (taskError) {
          const detail = taskError instanceof Error ? taskError.message : "تعذر تسجيل المشروع.";
          assistantMessage = { ...assistantMessage, content: assistantMessage.content + (ar ? "\n\nملاحظة: اكتمل الرد، لكن لم أتمكن من تسجيل المشروع في سجل المهام: " : "\n\nNote: The reply is ready, but the project could not be added to Task History: ") + detail };
        }
      }
      const completed = [...next, assistantMessage].slice(-100);
      setMessages(completed);
      if (assistantMessage.appData) setPreviewingDocument(completed.length - 1);
      await saveHistory(completed, conversationId);
      if (data.usage) setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));
    } finally {
      sendingRef.current = false;
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

  const generateSpeech = async (text: string, index: number) => {
    setSpeechLoadingIndex(index);
    setError("");
    try {
      const response = await fetch("/api/ai/speech", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.details === "string" ? " — " + data.details : "";
        throw new Error((data.error || (ar ? "تعذر إنشاء الملف الصوتي." : "Could not generate the audio file.")) + detail);
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().startsWith("audio/")) throw new Error(ar ? "ملف الصوت المستلم غير صالح." : "The returned audio file is invalid.");
      const url = URL.createObjectURL(blob);
      const previous = generatedSpeech[index];
      if (previous) URL.revokeObjectURL(previous);
      speechUrlsRef.current.push(url);
      setGeneratedSpeech((current) => ({ ...current, [index]: url }));
      void loadUsage();
    } catch (error) {
      setError(error instanceof Error ? error.message : (ar ? "تعذر إنشاء الصوت." : "Could not generate speech."));
    } finally {
      setSpeechLoadingIndex(null);
    }
  };

  const providerNames = usage?.providers
    ? Object.entries(usage.providers).filter(([, active]) => active).map(([name]) => name === "gemini" ? "Gemini" : "OpenRouter Free Models")
    : [];
  const percent = usage ? Math.max(0, Math.min(100, usage.remaining / usage.limit * 100)) : 0;

  if (view === "usage") return <div className="page-enter ai-usage-page">
    <div className="page-heading ai-chat-heading">
      <div><div className="eyebrow">AL OMDA AI</div><h1 className="page-title">{ar ? "الاستخدام والذاكرة" : "Usage & memory"}</h1><p className="page-subtitle">{ar ? "تابع رصيدك وتحكم في ذاكرة العمدة الخاصة بحسابك." : "Track your allowance and manage your private AL OMDA memory."}</p></div>
      <button type="button" className="button button-quiet button-small" onClick={()=>setLocation("/ai")}><ArrowLeft size={14}/>{ar ? "العودة إلى الشات" : "Back to chat"}</button>
    </div>
    {!signedIn ? <section className="panel panel-pad"><p className="account-copy">{copy.login}</p></section> : <div className="ai-usage-grid">
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{copy.remaining}</h2><strong>{usage ? `${usage.remaining} / ${usage.limit}` : "—"}</strong></div>
        <div style={{height:9,background:"var(--surface-muted,#252a32)",borderRadius:99,overflow:"hidden",margin:"12px 0"}}><div style={{height:"100%",width:`${percent}%`,background:"#c6a76c",borderRadius:99}}/></div>
        <div className="setting-row"><div><strong>{copy.used}</strong><small>{usage?.used ?? "—"}</small></div><div><strong>{copy.limit}</strong><small>{usage?.limit ?? 1000}</small></div></div>
        {usage?.resetAt && <small className="muted">{copy.reset} {new Date(usage.resetAt).toLocaleTimeString(ar ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</small>}
        <div className="setting-row"><div><strong>{copy.providers}</strong><small>{providerNames.length ? providerNames.join(" · ") : "—"}</small></div></div>
        {usage && providerNames.length === 0 && <div className="notice-bar" style={{marginTop:10}}>{copy.noProvider}</div>}
        <small className="muted">{copy.voiceNote}</small>
      </section>
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{ar ? "ذاكرة العمدة الخاصة بك" : "Your private AL OMDA memory"}</h2><span className="muted">{memory.length}/6000</span></div>
        <p className="muted" style={{margin:"8px 0"}}>{ar ? "اكتب تفضيلاتك ومشاريعك وقراراتك المهمة. سيستخدمها العمدة لتخصيص ردوده واستكمال العمل. الذاكرة خاصة بحسابك ويمكنك تعديلها أو حذفها في أي وقت." : "Save your preferences, projects, and important decisions. AL OMDA will use them to personalize replies and continue work. This memory is private to your account and can be edited or deleted anytime."}</p>
        <textarea className="field" rows={7} maxLength={6000} value={memory} onChange={(event)=>setMemory(event.target.value)} placeholder={ar ? "اكتب تفضيلاتك ومشاريعك وقراراتك المهمة..." : "Write your preferences, projects, and important decisions..."} disabled={memoryLoading || memorySaving}/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
          <button type="button" className="button button-primary" onClick={()=>void saveMemory()} disabled={memoryLoading || memorySaving}>{memorySaving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ الذاكرة" : "Save memory")}</button>
          <button type="button" className="button button-quiet button-small" onClick={()=>void clearMemory()} disabled={memoryLoading || memorySaving || !memory.trim()}>{ar ? "حذف الذاكرة" : "Delete memory"}</button>
          {memoryLoading && <small className="muted">{ar ? "جارٍ تحميل الذاكرة..." : "Loading memory..."}</small>}
        </div>
      </section>
    </div>}
    {error && <div className="notice-bar notice-error" role="alert">{error}</div>}
  </div>;
  return <div className="page-enter ai-chat-page">
    <div className="page-heading ai-chat-heading">
      <div><div className="eyebrow">AL OMDA AI</div><h1 className="page-title">{copy.title}</h1><p className="page-subtitle">{copy.subtitle}</p></div>
      <div className="ai-chat-actions">
        <button type="button" className="button button-quiet button-small ai-routing-button" onClick={()=>setShowRoutingInfo((value)=>!value)} aria-expanded={showRoutingInfo}><Bot size={13}/>{ar ? "توجيه تلقائي" : "Auto routing"}</button>
        <button type="button" className="button button-quiet button-small" onClick={()=>setShowConversationList((value)=>!value)} aria-expanded={showConversationList}><History size={14}/>{ar ? "المحادثات" : "Chats"}</button>
        <button type="button" className="button button-quiet button-small" onClick={()=>void createConversation()} disabled={loading || historyLoading}><Plus size={14}/>{ar ? "محادثة جديدة" : "New chat"}</button>
        <button type="button" className="button button-quiet button-small" onClick={()=>setLocation("/ai/usage")}><Settings2 size={14}/>{ar ? "الاستخدام والذاكرة" : "Usage & memory"}</button>
        <button type="button" className="button button-quiet button-small ai-live-voice-button" onClick={()=>setShowLiveVoice((value)=>!value)} aria-expanded={showLiveVoice}><Volume2 size={14}/>{ar ? "المحادثة الصوتية" : "Live voice"}{showLiveVoice ? <X size={13}/> : null}</button>
      </div>
    </div>
    {showRoutingInfo && <div className="notice-bar ai-routing-note"><Bot size={14}/><span>{ar ? "التوجيه التلقائي مفعّل: العمدة يختار نموذجًا مجانيًا متخصصًا حسب نوع طلبك ويجرّب بدائل عند التعطل." : "Automatic routing is on. AL OMDA selects a free specialist model and tries alternatives when needed."}</span></div>}
    {!signedIn ? <section className="panel panel-pad"><p className="account-copy">{copy.login}</p></section> : <>
      {showConversationList && <section className="panel ai-conversations-panel">
        <div className="section-head"><h2 className="section-title">{ar ? "محادثاتك" : "Your conversations"}</h2><button type="button" className="icon-button" onClick={()=>setShowConversationList(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={15}/></button></div>
        {conversations.length === 0 && <p className="muted">{ar ? "لا توجد محادثات محفوظة بعد." : "No saved conversations yet."}</p>}
        {conversations.map((item)=><div className={"ai-conversation-item " + (item.id===activeConversationId ? "active" : "")} key={item.id}>
          <button type="button" className="ai-conversation-open" onClick={()=>void loadConversation(item.id)} disabled={loading || historyLoading}><MessageSquareText size={15}/><span>{item.title}</span></button>
          <button type="button" className="icon-button" onClick={()=>void deleteConversation(item.id)} disabled={loading || historyLoading} aria-label={ar ? "حذف المحادثة" : "Delete conversation"}><Trash2 size={14}/></button>
        </div>)}
      </section>}
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{ar ? "المحادثة" : "Conversation"}</h2><span className="muted">{messages.length} {ar ? "رسالة" : "messages"}</span></div>
        {historyLoading && <small className="muted" style={{display:"block",marginBottom:8}}>{copy.historyLoading}</small>}
        <div ref={chatScrollRef} className="chat-messages" aria-live="polite" onScroll={(event)=>{const el=event.currentTarget;shouldAutoScrollRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<120;}} style={{minHeight:250,maxHeight:"52vh",overflowY:"auto",overscrollBehavior:"contain"}}>
          {messages.length === 0 && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.empty}</p></div>}
          {messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}>
            <strong>{message.role === "user" ? (ar ? "أنت" : "You") : `AL OMDA AI${message.provider ? " · " + message.provider : ""}`}</strong>
            <MessageContent content={message.content} />
            {message.agentPending && <div style={{display:"grid",gap:8,width:"100%",padding:12,border:"1px solid var(--border,#343a44)",borderRadius:10}}><strong>{ar ? "موافقة مطلوبة (" + message.agentPending.calls.length + ")" : "Approval required (" + message.agentPending.calls.length + ")"}</strong>{message.agentPending.calls.map((call)=><div key={call.id} style={{fontSize:12,overflowWrap:"anywhere"}}><b>{call.tool}</b><pre style={{whiteSpace:"pre-wrap",margin:"4px 0",color:"var(--muted,#9aa3af)"}}>{JSON.stringify(call.arguments,null,2)}</pre></div>)}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className="button button-primary button-small" disabled={loading || !agentToken.trim()} onClick={()=>void continueLocalAgent(index,true)}>{ar ? "موافقة وتنفيذ" : "Approve & execute"}</button><button type="button" className="button button-quiet button-small" disabled={loading || !agentToken.trim()} onClick={()=>void continueLocalAgent(index,false)}>{ar ? "رفض الإجراءات" : "Deny actions"}</button></div></div>}
            {message.taskId && <button type="button" className="button button-primary button-small" onClick={()=>setLocation("/history/"+message.taskId)} style={{display:"inline-flex",alignItems:"center",gap:8}}><BriefcaseBusiness size={14}/>{ar ? "فتح المشروع في سجل المهام" : "Open project in Task History"}</button>}
            {message.attachment && (message.documentData || message.spreadsheetData || message.appData) && <div style={{display:"flex",gap:8,flexWrap:"wrap",width:"100%"}}>
              <button type="button" className="button button-primary button-small" onClick={()=>{const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);if(isIOS){window.open(message.attachment!.url,"_blank","noopener,noreferrer");return;}const link=document.createElement("a");link.href=message.attachment!.url;link.download=message.attachment!.name;document.body.appendChild(link);link.click();link.remove();}} style={{display:"inline-flex",alignItems:"center",gap:8}}><FileText size={15}/>{message.appData?(ar?"تحميل / فتح التطبيق":"Download / open app"):message.spreadsheetData?(ar?"تحميل ملف Excel":"Download Excel"):(ar?"تحميل ملف Word":"Download Word")} ({message.attachment.name.split(".").pop()})</button>
              <button type="button" className="button button-quiet button-small" onClick={()=>setPreviewingDocument(previewingDocument===index?null:index)} style={{display:"inline-flex",alignItems:"center",gap:8}}><Search size={15}/>{previewingDocument===index?(ar?"إغلاق المعاينة":"Close preview"):(ar?"معاينة الملف":"Preview file")}</button>
            </div>}
            {message.appData && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#fff"}}><div style={{padding:"9px 12px",color:"#d5b477",background:"#11151b",fontSize:12}}>{message.appData.title}</div><iframe title={message.appData.title} srcDoc={message.appData.html} sandbox="allow-scripts" style={{display:"block",width:"100%",height:"min(65vh, 620px)",minHeight:360,border:0,background:"#fff"}} /></div>}{message.appData && <small style={{display:"block",width:"100%",color:"var(--muted,#9aa3af)",fontSize:12}}>{ar?"على iPhone: اضغط تحميل / فتح التطبيق، ثم من زر المشاركة اختر حفظ في الملفات.":"On iPhone: tap Download / open app, then use Share → Save to Files."}</small>}
            {message.spreadsheetData && previewingDocument===index && <div style={{width:"100%",overflowX:"auto",border:"1px solid var(--border,#343a44)",borderRadius:10,padding:10,background:"var(--surface,#10151b)"}}>
              <strong style={{display:"block",marginBottom:10}}>{message.spreadsheetData.title}</strong>
              <table dir={ar?"rtl":"ltr"} style={{width:"100%",borderCollapse:"collapse",minWidth:560}}><thead><tr>{message.spreadsheetData.columns.map((column,i)=><th key={i} style={{border:"1px solid var(--border,#59616c)",padding:8,background:"rgba(190,160,100,.13)",textAlign:"start"}}>{column}</th>)}</tr></thead>
              <tbody>{message.spreadsheetData.rows.map((row,i)=><tr key={i}>{message.spreadsheetData!.columns.map((_,j)=><td key={j} style={{border:"1px solid var(--border,#59616c)",padding:8,minWidth:80}}>{row[j] ?? ""}</td>)}</tr>)}</tbody></table>
            </div>}
            {message.documentData && previewingDocument===index && <div style={{width:"100%",overflowX:"auto",border:"1px solid var(--border,#343a44)",borderRadius:10,padding:10,background:"var(--surface,#10151b)"}}><strong style={{display:"block",marginBottom:10}}>{message.documentData.title}</strong>{message.documentData.paragraphs.map((paragraph,i)=><p key={i} style={{margin:"8px 0",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{paragraph}</p>)}{message.documentData.columns.length>0 && <table dir={ar?"rtl":"ltr"} style={{width:"100%",borderCollapse:"collapse",minWidth:480}}><thead><tr>{message.documentData.columns.map((column,i)=><th key={i} style={{border:"1px solid var(--border,#59616c)",padding:8,background:"rgba(190,160,100,.13)",textAlign:"start"}}>{column}</th>)}</tr></thead><tbody>{message.documentData.rows.map((row,i)=><tr key={i}>{message.documentData!.columns.map((_,j)=><td key={j} style={{border:"1px solid var(--border,#59616c)",padding:8,minWidth:70,height:34}}>{row[j]||" "}</td>)}</tr>)}</tbody></table>}</div>}
            {message.role === "assistant" && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="button" className="button button-quiet button-small" onClick={()=>speak(message.content)} aria-label={ar ? "استمع للإجابة" : "Read answer aloud"}><Volume2 size={13}/>{ar ? "استمع" : "Listen"}</button>
              {usage?.providers?.openrouter && <button type="button" className="button button-quiet button-small" onClick={()=>void generateSpeech(message.content,index)} disabled={speechLoadingIndex===index || !message.content.trim()}><Volume2 size={13}/>{speechLoadingIndex===index ? (ar ? "جارٍ إنشاء MP3..." : "Generating MP3...") : (ar ? "إنشاء صوت MP3" : "Generate MP3 audio")}</button>}
              <button type="button" className="button button-quiet button-small" onClick={()=>void copyAnswer(message.content,index)}><Copy size={13}/>{copiedIndex===index?copy.copied:copy.copy}</button>
              {generatedSpeech[index] && <audio controls preload="none" src={generatedSpeech[index]} style={{width:"100%",marginTop:6}} />}
            </div>}
          </div>)}
          {loading && <div className="chat-message assistant"><strong>AL OMDA AI</strong><p>{copy.loading}</p></div>}
        </div>
        {error && <div className="notice-bar notice-error" role="alert" style={{marginBottom:12}}>{error}</div>}
        {usage?.remaining === 0 && <div className="notice-bar" style={{marginBottom:12}}>{copy.exhausted}</div>}

        <div className="panel" style={{padding:12,marginBottom:10,borderColor:agentMode?"rgba(198,167,108,.65)":undefined}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><strong>{ar ? "وضع الوكيل المحلي" : "Local Agent mode"}</strong><small className="muted" style={{display:"block",marginTop:3}}>{ar ? "قراءة ملفات المشروع وتعديلها وتشغيل أوامر بعد موافقتك." : "Inspect project files, edit them and run commands with your approval."}</small></div><button type="button" className={"button button-small " + (agentMode?"button-primary":"button-quiet")} onClick={()=>setAgentMode((value)=>!value)}>{agentMode?(ar?"مفعّل":"Enabled"):(ar?"تفعيل Agent":"Enable Agent")}</button></div>{agentMode && <div style={{display:"grid",gap:8,marginTop:10}}><input className="field" value={agentRuntimeUrl} onChange={(event)=>setAgentRuntimeUrl(event.target.value)} placeholder="http://127.0.0.1:4318" aria-label={ar?"عنوان الوكيل المحلي":"Local runtime URL"}/><input className="field" type="password" autoComplete="off" value={agentToken} onChange={(event)=>setAgentToken(event.target.value)} placeholder={ar?"رمز الاتصال المحلي (32 حرفًا على الأقل)":"Local access token (at least 32 characters)"} aria-label={ar?"رمز الاتصال":"Access token"}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><small className="muted">{agentSessionId ? (ar?"جلسة محفوظة: ":"Saved session: ")+agentSessionId.slice(0,12) : (ar?"لا توجد جلسة Agent محفوظة بعد.":"No saved Agent session yet.")}</small><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" className="button button-quiet button-small" onClick={()=>void checkLocalAgentConnection()}>{ar?"اختبار الاتصال":"Test connection"}</button><button type="button" className="button button-quiet button-small" onClick={()=>void loadAgentSessions()}>{ar?"الجلسات المحفوظة":"Saved sessions"}</button><button type="button" className="button button-quiet button-small" onClick={()=>{setAgentSessionId("");try{window.localStorage.removeItem("omda-agent-session");}catch{}}}>{ar?"جلسة جديدة":"New agent session"}</button></div></div>{agentConnectionStatus && <small className="muted">{agentConnectionStatus}</small>}{agentSessions.length>0 && <select className="field" value={agentSessionId} onChange={(event)=>{setAgentSessionId(event.target.value);try{window.localStorage.setItem("omda-agent-session",event.target.value);}catch{}}}><option value="">{ar?"اختر جلسة محفوظة":"Select a saved session"}</option>{agentSessions.map((session)=><option key={session.id} value={session.id}>{session.pending?"● ":""}{session.lastMessage || session.id} · {session.id.slice(0,8)}</option>)}</select>}<small className="muted">{ar?"يعمل الوكيل على الكمبيوتر الذي يشغّل Runtime فقط. من الهاتف لن يصل إلى ملفات الكمبيوتر إلا عبر ربط آمن منفصل. الرمز يبقى في ذاكرة الصفحة ولا يُحفظ بالحساب.":"The agent runs on the computer hosting the runtime. A phone cannot access that computer's files without a separate secure bridge. The token stays in page memory and is not saved to your account."}</small></div>}</div>
        <form onSubmit={sendMessage} className="ai-composer">
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={(event)=>{
            const file=event.currentTarget.files?.[0];
            event.currentTarget.value="";
            if(!file)return;
            if(file.size>4*1024*1024){setError(ar?"حجم الصورة أكبر من 4 ميجابايت. اختر صورة أصغر.":"Image is larger than 4 MB. Choose a smaller image.");return;}
            if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)){setError(ar?"صيغة الصورة غير مدعومة.":"Unsupported image format.");return;}
            const reader=new FileReader();
            reader.onload=()=>{const result=typeof reader.result==="string"?reader.result:"";const comma=result.indexOf(",");if(comma<0){setError(ar?"تعذر قراءة الصورة.":"Could not read the image.");return;}setPendingImage({name:file.name,mimeType:file.type,data:result.slice(comma+1),preview:result});setError("");};
            reader.onerror=()=>setError(ar?"تعذر قراءة الصورة.":"Could not read the image.");
            reader.readAsDataURL(file);
          }}/>
          {pendingImage && <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"1px solid var(--border,#343a44)",borderRadius:10,marginBottom:8}}>
            <img src={pendingImage.preview} alt={pendingImage.name} style={{width:54,height:54,objectFit:"cover",borderRadius:7}}/>
            <span style={{fontSize:12,overflowWrap:"anywhere",flex:1}}>{pendingImage.name}</span>
            <button type="button" className="icon-button" onClick={()=>setPendingImage(null)} aria-label={ar?"إزالة الصورة":"Remove image"}><X size={15}/></button>
          </div>}
          <div className="ai-composer-tools">
            <button type="button" className="ai-plus-button" onClick={()=>imageInputRef.current?.click()} aria-label={ar?"إرفاق صورة":"Attach image"} title={ar?"تحليل صورة باستخدام نموذج مجاني":"Analyze an image with a free model"} disabled={loading || historyLoading || !signedIn || agentMode || usage?.remaining === 0}><ImagePlus size={18}/></button>
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
            <textarea ref={inputRef} className="field ai-composer-input" rows={1} maxLength={8000} value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void sendMessage();}}} placeholder={copy.placeholder} disabled={loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}/> 
            <button type="submit" className="ai-send-button" aria-label={copy.send} disabled={(!input.trim() && !pendingImage) || loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}>{loading ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button>
          </div>
          {showLiveVoice && signedIn && <section className="panel ai-voice-panel ai-voice-panel-under-input">
            <div className="section-head"><strong>{ar ? "المحادثة الصوتية المباشرة" : "Live voice conversation"}</strong><button type="button" className="icon-button" onClick={()=>setShowLiveVoice(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={15}/></button></div>
            <GeminiLiveVoice language={language} disabled={loading || historyLoading || usage?.remaining === 0} onTranscript={handleLiveTranscript} />
            <small className="muted" style={{ display: "block", marginTop: 6 }}>{ar ? "تحدث مع العمدة مباشرة بالصوت، وسيجيبك بصوته دون كتابة." : "Talk to AL OMDA naturally; it listens and replies with voice, without typing."}</small>
          </section>}
          <div className="ai-composer-footer">
            <div>{speaking && <button type="button" className="button button-quiet button-small" onClick={()=>{window.speechSynthesis.cancel();setSpeaking(false);}}><VolumeX size={14}/>{ar ? "إيقاف الصوت" : "Stop voice"}</button>}</div>
            <small className="muted">{usage ? (ar ? `متبقي ${usage.remaining} من ${usage.limit} وحدة` : `${usage.remaining} of ${usage.limit} units left`) : copy.subtitle}</small>
          </div>
        </form>
      </section>
    </>}
  </div>;
}
