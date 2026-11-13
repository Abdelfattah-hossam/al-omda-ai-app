import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Bot, Copy, LoaderCircle, Send, Trash2, Volume2, VolumeX, Mic, Plus, Settings2, X, BriefcaseBusiness, Code2, Palette, FileText, Sheet, Presentation, Search, PenLine, History, MessageSquareText, ArrowLeft, ImagePlus, MoreHorizontal, Share2, Pin, Pencil, Headphones, Sparkles, Play } from "lucide-react";
import GeminiLiveVoice from "./GeminiLiveVoice";
import { readAgentEventStream } from "./lib/agent-stream";
import { detectProjectSpecialty } from "./lib/project-intent";

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
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [pinnedPreferencesLoaded, setPinnedPreferencesLoaded] = useState(false);
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
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showCodeCanvas, setShowCodeCanvas] = useState(false);
  const [canvasCode, setCanvasCode] = useState('<!doctype html>\n<html lang="ar" dir="rtl">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>\n<body style="font-family:system-ui;background:#111827;color:#f8fafc;padding:32px;text-align:center"><h1>معاينة كود العمدة</h1><p>اكتب HTML أو CSS أو JavaScript ثم اضغط تشغيل ومعاينة.</p></body></html>');
  const [canvasPreviewCode, setCanvasPreviewCode] = useState('');
  const [currentMode, setCurrentMode] = useState<null | "word" | "excel" | "ppt" | "office">(null);
  const chatTopbarRef = useRef<HTMLElement | null>(null);
  const plusWrapRef = useRef<HTMLDivElement | null>(null);
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
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const chatMenu = chatTopbarRef.current?.querySelector(".ai-chat-top-menu");
      const chatMenuTrigger = chatTopbarRef.current?.querySelector(".ai-chat-menu-trigger");
      if (!chatMenu?.contains(target) && !chatMenuTrigger?.contains(target)) setShowChatMenu(false);
      const modelMenu = chatTopbarRef.current?.querySelector(".ai-chat-model-menu");
      const modelTrigger = chatTopbarRef.current?.querySelector(".ai-chat-model-button");
      if (!modelMenu?.contains(target) && !modelTrigger?.contains(target)) setShowModelMenu(false);
      if (!plusWrapRef.current?.contains(target)) setShowPlusMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowChatMenu(false);
      setShowModelMenu(false);
      setShowPlusMenu(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const maxHeight = window.matchMedia("(max-width: 650px)").matches ? 128 : 180;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

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

  const renameConversation = async (conversation: Conversation) => {
    const requested = window.prompt(ar ? "اكتب اسم المحادثة الجديد:" : "Enter a new conversation title:", conversation.title);
    const title = requested?.trim().slice(0, 100);
    if (!title || title === conversation.title) return;
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try { response = await fetch("/api/ai/conversations/" + encodeURIComponent(conversation.id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }), signal: controller.signal }); }
      finally { window.clearTimeout(timeoutId); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر تغيير اسم المحادثة." : "Could not rename conversation."));
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, title } : item));
    } catch (err) { setError(err instanceof Error && err.name === "AbortError" ? (ar ? "استغرق تغيير اسم المحادثة وقتًا أطول من اللازم." : "Renaming the conversation timed out.") : err instanceof Error ? err.message : (ar ? "تعذر تغيير اسم المحادثة." : "Could not rename conversation.")); }
  };
  const togglePinnedConversation = (id: string) => setPinnedConversationIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [id, ...current]);
  useEffect(() => { try { const value = JSON.parse(window.localStorage.getItem("omda-pinned-conversations") || "[]"); if (Array.isArray(value)) setPinnedConversationIds(value.filter((id): id is string => typeof id === "string")); } catch { /* Use an empty pinned list when storage is unavailable. */ } finally { setPinnedPreferencesLoaded(true); } }, []);
  useEffect(() => { if (!pinnedPreferencesLoaded) return; try { window.localStorage.setItem("omda-pinned-conversations", JSON.stringify(pinnedConversationIds)); } catch { /* Local preference only. */ } }, [pinnedConversationIds, pinnedPreferencesLoaded]);

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
    if (loadingRef.current || historyLoadingRef.current) return;
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

  useLayoutEffect(() => {
    const container = chatScrollRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    // Only pin a genuinely scrollable transcript. On mobile the transcript grows
    // with the page, so scrolling this element would fight the browser's page scroll.
    if (container.scrollHeight <= container.clientHeight + 1) return;
    // Apply the position before paint; scrollTo on every streamed token caused
    // repeated asynchronous scroll operations and visible jitter on some devices.
    container.scrollTop = container.scrollHeight;
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
      const projectRequestContext = next.filter((message) => message.role === "user").slice(-2, -1).map((message) => message.content).join("\n\n").slice(-5000);
      const currentProjectSpecialty = detectProjectSpecialty(text);
      const previousMessage = next[next.length - 2];
      const linkedProjectMessage = previousMessage?.role === "assistant" && previousMessage.taskId ? previousMessage : undefined;
      const explicitlyNewProject = /(?:مشروع جديد|ابدأ مشروع جديد|انشئ مشروع جديد|new project|start a new project)/i.test(text);
      const continuesExistingProject = /^(?:كمل|كمّل|استكمل|تابع|نفذ|نفّذ|عدّل|عدل|راجع|اختبر|صلح|أصلح|طوّر|طور|ابدأ|ابدا|continue|resume|proceed|implement|fix|test|review|update)(?:\s|$)/i.test(text.trim());
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
          if (taskData.usage) setUsage(taskData.usage);
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
  const openSettings = () => { setShowSettingsModal(true); void loadMemory(); void loadUsage(); };
  const activateMode = (mode: "word" | "excel" | "ppt" | "office") => {
    setCurrentMode(mode);
    setShowPlusMenu(false);
    const prompts = {
      word: ar ? "أنشئ مستند Word احترافيًا وجاهزًا للتحميل عن: " : "Create a professional downloadable Word document about: ",
      excel: ar ? "أنشئ ملف Excel منظمًا وجاهزًا للتحميل عن: " : "Create a structured downloadable Excel workbook about: ",
      ppt: ar ? "جهّز عرض PowerPoint منظمًا بعناوين الشرائح ومحتواها وملاحظات المتحدث عن: " : "Prepare a PowerPoint presentation with slide titles, slide content and speaker notes about: ",
      office: ar ? "استخدم أدوات الأوفيس المناسبة لإنجاز: " : "Use the appropriate Office tools to complete: "
    };
    setInput((value) => value.trim() ? value + "\n" + prompts[mode] : prompts[mode]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const clearMode = () => setCurrentMode(null);
  const openCodeCanvas = () => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    const match = lastAssistant?.content.match(/\x60\x60\x60(?:html|HTML)?\s*\n([\s\S]*?)\x60\x60\x60/);
    if (match?.[1]?.trim()) { setCanvasCode(match[1].trim()); setCanvasPreviewCode(match[1].trim()); }
    setShowCodeCanvas(true); setShowPlusMenu(false);
  };
  const runCanvasCode = () => setCanvasPreviewCode(canvasCode);

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
    {chatSidebarOpen && <button type="button" className="ai-chat-sidebar-scrim" aria-label={ar ? "إغلاق القائمة" : "Close sidebar"} onClick={()=>setChatSidebarOpen(false)} />}
    <aside className={"ai-chat-sidebar" + (chatSidebarOpen ? " is-open" : "")} dir={ar ? "rtl" : "ltr"}>
      <div className="ai-chat-sidebar-head">
        <button type="button" className="ai-chat-new-button" onClick={()=>{setChatSidebarOpen(false);void createConversation();}} disabled={!signedIn || loading || historyLoading}><Plus size={16}/><span>{ar ? "محادثة جديدة" : "New chat"}</span><PenLine size={14}/></button>
        <button type="button" className="ai-chat-sidebar-close" onClick={()=>setChatSidebarOpen(false)} aria-label={ar ? "إغلاق القائمة" : "Close sidebar"}><X size={18}/></button>
      </div>
      <div className="ai-chat-tools-caption">{ar ? "أدوات العمدة" : "AL OMDA TOOLS"}</div>
      <div className="ai-chat-tool-list">
        <button type="button" onClick={()=>{activateMode("office");setChatSidebarOpen(false);}}><BriefcaseBusiness size={16}/>{ar ? "حزمة برامج الأوفيس (Office)" : "Office suite"}</button>
        <button type="button" onClick={()=>{setChatSidebarOpen(false);openCodeCanvas();}}><Code2 size={16}/>{ar ? "محرر البرمجة (Code Canvas)" : "Code Canvas"}</button>
        <button type="button" onClick={()=>{setChatSidebarOpen(false);openSettings();}}><Bot size={16}/>{ar ? "ذاكرة العمدة والحد اليومي" : "Memory & daily usage"}</button>
      </div>
      <div className="ai-chat-history-caption"><span>{ar ? "المحادثات السابقة" : "Recent conversations"}</span><button type="button" onClick={()=>setShowConversationList(v=>!v)}>{showConversationList ? (ar ? "إخفاء" : "Hide") : (ar ? "عرض الكل" : "View all")}</button></div>
      <div className="ai-chat-sidebar-history">
        {conversations.length === 0 && <p>{ar ? "لا توجد محادثات محفوظة بعد" : "No saved conversations yet"}</p>}
        {conversations.slice(0,showConversationList ? 40 : 12).map((item)=><div className={"ai-chat-sidebar-history-item" + (item.id===activeConversationId ? " active" : "")} key={item.id}>
          <button type="button" onClick={()=>{setChatSidebarOpen(false);void loadConversation(item.id);}} disabled={loading || historyLoading}><MessageSquareText size={14}/><span>{item.title}</span></button>
          <button type="button" className="ai-chat-sidebar-history-delete" onClick={()=>void deleteConversation(item.id)} disabled={loading || historyLoading} aria-label={ar ? "حذف المحادثة" : "Delete conversation"}><Trash2 size={13}/></button>
        </div>)}
      </div>
      <button type="button" className="ai-chat-usage-card" onClick={()=>{setChatSidebarOpen(false);openSettings();}}>
        <span><span>{ar ? "المتبقي اليوم" : "Remaining today"}</span><strong>{usage ? `${usage.remaining} / ${usage.limit}` : "—"}</strong></span>
        <span className="ai-chat-usage-track"><i style={{width:usage ? `${Math.max(0,Math.min(100,usage.remaining/Math.max(1,usage.limit)*100))}%` : "0%"}}/></span>
      </button>
      <div className="ai-chat-sidebar-account"><span className="ai-chat-account-avatar">ع</span><span><strong>{ar ? "حساب العمدة" : "AL OMDA account"}</strong><small>{signedIn ? (ar ? "متصل" : "Signed in") : (ar ? "غير مسجل الدخول" : "Not signed in")}</small></span><button type="button" onClick={()=>{setChatSidebarOpen(false);setLocation("/profile");}} aria-label={ar ? "الملف الشخصي" : "Profile"}><Settings2 size={16}/></button></div>
    </aside>
    <div className="ai-chat-main">
    <header ref={chatTopbarRef} className="ai-chat-topbar" dir={ar ? "rtl" : "ltr"}>
      <button type="button" className="ai-chat-back" onClick={()=>setChatSidebarOpen(true)} aria-label={ar ? "فتح القائمة الجانبية" : "Open sidebar"}><i className="ai-chat-bars" aria-hidden="true">☰</i></button>
      <div className="ai-chat-model-wrap">
        <button type="button" className="ai-chat-model-button" aria-expanded={showModelMenu} onClick={()=>{setShowChatMenu(false);setShowModelMenu(v=>!v);}}><span>{ar ? "العمدة · التوجيه التلقائي" : "AL OMDA · Auto routing"}</span><i>⌄</i></button>
        {showModelMenu && <div className="ai-chat-model-menu">
          <div className="ai-chat-menu-caption">{ar ? "المحركات المجانية المهيأة" : "Configured free engines"}</div>
          <div className="ai-chat-provider-row"><Sparkles size={15}/><span><strong>Gemini</strong><small>{usage?.providers?.gemini ? (ar ? "متصل · متاح للتوجيه" : "Connected") : (ar ? "غير مهيأ" : "Not configured")}</small></span><i className={usage?.providers?.gemini ? "is-ready" : ""}/></div>
          <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>OpenRouter Free</strong><small>{usage?.providers?.openrouter ? (ar ? "متصل · متاح للتوجيه" : "Connected") : (ar ? "غير مهيأ" : "Not configured")}</small></span><i className={usage?.providers?.openrouter ? "is-ready" : ""}/></div>
          <p>{ar ? "العمدة يختار النموذج الأنسب تلقائيًا ويجرّب البدائل عند التعطل." : "AL OMDA chooses the best available model and tries alternatives."}</p>
        </div>}
      </div>
      {agentMode && <span className="ai-chat-agent-badge"><Code2 size={12}/>{ar ? "وكيل محلي" : "Local Agent"}</span>}
      <button type="button" className="ai-chat-header-icon" onClick={openCodeCanvas} title={ar ? "محرر الأكواد" : "Code Canvas"}><Code2 size={16}/></button>
      <button type="button" className="ai-chat-header-icon" onClick={openSettings} title={ar ? "الإعدادات والحد اليومي" : "Settings and daily usage"}><Settings2 size={16}/></button>
      <button type="button" className="ai-chat-menu-trigger" aria-label={ar ? "قائمة الشات" : "Chat menu"} aria-expanded={showChatMenu} onClick={()=>{setShowPlusMenu(false);setShowChatMenu(v=>!v)}}><MoreHorizontal size={21}/></button>
      {showChatMenu && <div className="ai-chat-top-menu" role="menu">
        <button type="button" onClick={()=>{setShowRoutingInfo(v=>!v);setShowChatMenu(false)}}><Bot size={16}/>{ar ? "التوجيه التلقائي" : "Auto routing"}</button>
        <button type="button" onClick={()=>{setShowConversationList(v=>!v);setShowChatMenu(false)}}><History size={16}/>{ar ? "المحادثات السابقة" : "Conversation history"}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);void createConversation()}} disabled={loading || historyLoading}><Plus size={16}/>{ar ? "محادثة جديدة" : "New chat"}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);openSettings()}}><Settings2 size={16}/>{ar ? "الاستخدام والذاكرة" : "Usage & memory"}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);setShowLiveVoice(v=>!v)}} aria-expanded={showLiveVoice}><Volume2 size={16}/>{ar ? "المحادثة الصوتية" : "Live voice"}</button>
        <div className="ai-chat-menu-divider"/>
        <button type="button" onClick={()=>{const value=messages.map(m=>(m.role==="user"?(ar?"أنت":"You"):"AL OMDA")+": "+m.content).join("\n\n");if(navigator.share){void navigator.share({title:ar?"محادثة مع العمدة":"AL OMDA conversation",text:value}).then(()=>setShowChatMenu(false)).catch((shareError)=>{if(shareError instanceof Error && shareError.name!=="AbortError")setError(shareError.message || (ar?"تعذرت مشاركة المحادثة.":"Could not share conversation."));setShowChatMenu(false);});}else if(navigator.clipboard){void navigator.clipboard.writeText(value).then(()=>setShowChatMenu(false)).catch(()=>{setError(ar?"تعذر نسخ المحادثة.":"Could not copy conversation.");setShowChatMenu(false);});}else{setError(ar?"المشاركة غير مدعومة في هذا المتصفح.":"Sharing is not supported.");setShowChatMenu(false);}}}><Share2 size={16}/>{ar ? "مشاركة المحادثة" : "Share conversation"}</button>
        <button type="button" onClick={()=>{const value=messages.map(m=>(m.role==="user"?(ar?"أنت":"You"):"AL OMDA")+": "+m.content).join("\n\n");if(navigator.clipboard)void navigator.clipboard.writeText(value).then(()=>setShowChatMenu(false)).catch(()=>{setError(ar?"تعذر نسخ المحادثة.":"Could not copy conversation.");setShowChatMenu(false);});else setError(ar?"النسخ غير مدعوم.":"Clipboard unavailable.");}}><Copy size={16}/>{ar ? "نسخ المحادثة" : "Copy conversation"}</button>
        <button type="button" onClick={()=>{togglePinnedConversation(activeConversationId);setShowChatMenu(false);}} disabled={!activeConversationId}><Pin size={16}/>{pinnedConversationIds.includes(activeConversationId)?(ar?"إلغاء تثبيت المحادثة":"Unpin conversation"):(ar?"تثبيت المحادثة":"Pin conversation")}</button>
        <button type="button" onClick={()=>{const item=conversations.find(entry=>entry.id===activeConversationId);if(item)void renameConversation(item);setShowChatMenu(false);}} disabled={!activeConversationId}><Pencil size={16}/>{ar ? "إعادة تسمية المحادثة" : "Rename conversation"}</button>
        <button type="button" className="danger" onClick={()=>{if(loadingRef.current || historyLoadingRef.current || !activeConversationId)return;setShowChatMenu(false);void deleteConversation(activeConversationId);}} disabled={loading || historyLoading || !activeConversationId}><Trash2 size={16}/>{ar ? "حذف المحادثة" : "Delete conversation"}</button>
      </div>}
    </header>
    {showRoutingInfo && <div className="notice-bar ai-routing-note"><Bot size={14}/><span>{ar ? "التوجيه التلقائي مفعّل: العمدة يختار نموذجًا مجانيًا متخصصًا حسب نوع طلبك ويجرّب بدائل عند التعطل." : "Automatic routing is on. AL OMDA selects a free specialist model and tries alternatives when needed."}</span></div>}
    {currentMode && <div className="ai-chat-mode-banner"><span>{currentMode === "word" ? <FileText size={14}/> : currentMode === "excel" ? <Sheet size={14}/> : currentMode === "ppt" ? <Presentation size={14}/> : <BriefcaseBusiness size={14}/>} {currentMode === "word" ? (ar ? "وضع Word نشط" : "Word mode active") : currentMode === "excel" ? (ar ? "وضع Excel نشط" : "Excel mode active") : currentMode === "ppt" ? (ar ? "إعداد محتوى العرض التقديمي" : "Presentation content mode") : (ar ? "حزمة الأوفيس جاهزة" : "Office suite ready")}</span><button type="button" onClick={clearMode} aria-label={ar ? "إلغاء الوضع" : "Clear mode"}><X size={14}/></button></div>}
    {!signedIn ? <section className="panel panel-pad"><p className="account-copy">{copy.login}</p></section> : <>
      {showConversationList && <section className="panel ai-conversations-panel">
        <div className="section-head"><h2 className="section-title">{ar ? "محادثاتك" : "Your conversations"}</h2><button type="button" className="icon-button" onClick={()=>setShowConversationList(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={15}/></button></div>
        {conversations.length === 0 && <p className="muted">{ar ? "لا توجد محادثات محفوظة بعد." : "No saved conversations yet."}</p>}
        {[...conversations].sort((a,b)=>Number(pinnedConversationIds.includes(b.id))-Number(pinnedConversationIds.includes(a.id))).map((item)=><div className={"ai-conversation-item " + (item.id===activeConversationId ? "active" : "")} key={item.id}>
          <button type="button" className="ai-conversation-open" onClick={()=>void loadConversation(item.id)} disabled={loading || historyLoading}><MessageSquareText size={15}/><span>{item.title}</span></button>
          <button type="button" className="icon-button" onClick={()=>togglePinnedConversation(item.id)} aria-label={pinnedConversationIds.includes(item.id)?(ar?"إلغاء التثبيت":"Unpin"):(ar?"تثبيت":"Pin")}><Pin size={14}/></button><button type="button" className="icon-button" onClick={()=>void renameConversation(item)} disabled={loading || historyLoading} aria-label={ar ? "إعادة تسمية المحادثة" : "Rename conversation"}><Pencil size={14}/></button><button type="button" className="icon-button" onClick={()=>void deleteConversation(item.id)} disabled={loading || historyLoading} aria-label={ar ? "حذف المحادثة" : "Delete conversation"}><Trash2 size={14}/></button>
        </div>)}
      </section>}
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{ar ? "المحادثة" : "Conversation"}</h2><span className="muted">{messages.length} {ar ? "رسالة" : "messages"}</span></div>
        {historyLoading && <small className="muted" style={{display:"block",marginBottom:8}}>{copy.historyLoading}</small>}
        <div ref={chatScrollRef} className="chat-messages" aria-live="polite" onScroll={(event)=>{const el=event.currentTarget;shouldAutoScrollRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<120;}} style={{minHeight:250,maxHeight:"52vh",overflowY:"auto",overscrollBehavior:"contain"}}>
          {messages.length === 0 && <div className="ai-chat-welcome" id="welcome-screen">
            <div className="ai-chat-welcome-mark">ع</div>
            <h1>{ar ? "أهلاً بك مع العمدة" : "Welcome to AL OMDA"}</h1>
            <p>{ar ? "مساعدك الذكي المتكامل للبرمجة، الأوفيس، وإدارة المشاريع" : "Your AI workspace for coding, Office documents, and projects."}</p>
            <div className="ai-chat-quick-grid">
              <button type="button" onClick={() => activateMode("word")}><FileText size={17}/><span><strong>{ar ? "مستند Word" : "Word document"}</strong><small>{ar ? "تصدير مستند جاهز للتحميل" : "Create a downloadable document"}</small></span></button>
              <button type="button" onClick={() => activateMode("excel")}><Sheet size={17}/><span><strong>{ar ? "جدول Excel" : "Excel workbook"}</strong><small>{ar ? "تنظيم البيانات والجداول" : "Organize data and tables"}</small></span></button>
              <button type="button" onClick={() => { setInput(ar ? "اكتب كود HTML و CSS مع معاينة مباشرة: " : "Write HTML and CSS with a live preview: "); openCodeCanvas(); }}><Code2 size={17}/><span><strong>{ar ? "برمجة ومعاينة" : "Code & preview"}</strong><small>{ar ? "فتح محرر الأكواد والمعاينة" : "Open code editor and preview"}</small></span></button>
              <button type="button" onClick={openSettings}><Bot size={17}/><span><strong>{ar ? "ذاكرة العمدة" : "AL OMDA memory"}</strong><small>{ar ? "إدارة الذاكرة والحد اليومي" : "Manage memory and daily usage"}</small></span></button>
            </div>
          </div>}
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

        <div className="panel ai-agent-runtime-panel" data-agent-active={agentMode ? "true" : "false"} style={{padding:12,marginBottom:10,borderColor:agentMode?"rgba(198,167,108,.65)":undefined}}><div className="ai-agent-runtime-summary"><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><strong>{ar ? "وضع الوكيل المحلي" : "Local Agent mode"}</strong><small className="muted" style={{display:"block",marginTop:3}}>{ar ? "قراءة ملفات المشروع وتعديلها وتشغيل أوامر بعد موافقتك." : "Inspect project files, edit them and run commands with your approval."}</small></div><button type="button" className={"button button-small " + (agentMode?"button-primary":"button-quiet")} onClick={()=>{if(!signedIn){setError(copy.login);return;}setAgentMode((value)=>!value);}} disabled={!signedIn} title={!signedIn?(ar?"سجّل الدخول أولاً":"Sign in first"):undefined}>{agentMode?(ar?"مفعّل":"Enabled"):(ar?"تفعيل Agent":"Enable Agent")}</button></div></div>{agentMode && <div style={{display:"grid",gap:8,marginTop:10}}><input className="field" value={agentRuntimeUrl} onChange={(event)=>setAgentRuntimeUrl(event.target.value)} placeholder="http://127.0.0.1:4318" aria-label={ar?"عنوان الوكيل المحلي":"Local runtime URL"}/><input className="field" type="password" autoComplete="off" value={agentToken} onChange={(event)=>setAgentToken(event.target.value)} placeholder={ar?"رمز الاتصال المحلي (32 حرفًا على الأقل)":"Local access token (at least 32 characters)"} aria-label={ar?"رمز الاتصال":"Access token"}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><small className="muted">{agentSessionId ? (ar?"جلسة محفوظة: ":"Saved session: ")+agentSessionId.slice(0,12) : (ar?"لا توجد جلسة Agent محفوظة بعد.":"No saved Agent session yet.")}</small><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" className="button button-quiet button-small" onClick={()=>void checkLocalAgentConnection()}>{ar?"اختبار الاتصال":"Test connection"}</button><button type="button" className="button button-quiet button-small" onClick={()=>void loadAgentSessions()}>{ar?"الجلسات المحفوظة":"Saved sessions"}</button><button type="button" className="button button-quiet button-small" onClick={()=>{setAgentSessionId("");try{window.localStorage.removeItem("omda-agent-session");}catch{}}}>{ar?"جلسة جديدة":"New agent session"}</button></div></div>{agentConnectionStatus && <small className="muted">{agentConnectionStatus}</small>}{agentSessions.length>0 && <select className="field" value={agentSessionId} onChange={(event)=>{setAgentSessionId(event.target.value);try{window.localStorage.setItem("omda-agent-session",event.target.value);}catch{}}}><option value="">{ar?"اختر جلسة محفوظة":"Select a saved session"}</option>{agentSessions.map((session)=><option key={session.id} value={session.id}>{session.pending?"● ":""}{session.lastMessage || session.id} · {session.id.slice(0,8)}</option>)}</select>}<small className="muted">{ar?"يعمل الوكيل على الكمبيوتر الذي يشغّل Runtime فقط. من الهاتف لن يصل إلى ملفات الكمبيوتر إلا عبر ربط آمن منفصل. الرمز يبقى في ذاكرة الصفحة ولا يُحفظ بالحساب.":"The agent runs on the computer hosting the runtime. A phone cannot access that computer's files without a separate secure bridge. The token stays in page memory and is not saved to your account."}</small></div>}</div>
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
            <div ref={plusWrapRef} className="ai-plus-wrap">
              <button type="button" className="ai-plus-button" aria-label={ar ? "إضافة أو اختيار أداة" : "Add or choose a tool"} aria-expanded={showPlusMenu} onClick={()=>{setShowChatMenu(false);setShowPlusMenu((v)=>!v)}}><Plus size={20}/></button>
              {showPlusMenu && <div className="ai-plus-menu" role="menu">
                <button type="button" className="ai-plus-option" onClick={()=>{if(agentMode || loading || historyLoading)return;setShowPlusMenu(false);imageInputRef.current?.click();}} disabled={agentMode || loading || historyLoading}><ImagePlus size={16}/><span>{ar?"إرفاق صورة":"Add photo"}</span></button>
                <div className="ai-chat-menu-caption">{ar ? "برامج الأوفيس الكاملة" : "Office tools"}</div>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("word")}><FileText size={16}/><span>{ar ? "مستند Word (مع زر تحميل)" : "Word document"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("excel")}><Sheet size={16}/><span>{ar ? "جدول Excel (مع زر تحميل)" : "Excel workbook"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("ppt")}><Presentation size={16}/><span>{ar ? "عرض PowerPoint (محتوى الشرائح)" : "PowerPoint slide content"}</span></button>
                <div className="ai-chat-menu-divider"/>
                <button type="button" className="ai-plus-option" onClick={()=>{setShowPlusMenu(false);openCodeCanvas();}}><Code2 size={16}/><span>{ar ? "محرر ومعاين الأكواد (Canvas)" : "Code editor & preview"}</span></button>
              </div>}
            </div>
            <textarea ref={inputRef} className="field ai-composer-input" rows={1} maxLength={8000} value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void sendMessage();}}} placeholder={copy.placeholder} disabled={loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}/> 
            <button type="button" className={"ai-chat-mic-button" + (listening ? " is-listening" : "")} aria-label={listening ? copy.stop : copy.mic} title={listening ? copy.stop : copy.mic} onClick={toggleVoiceInput} disabled={!signedIn || loading || historyLoading}><Mic size={17}/></button>
            {input.trim() || pendingImage ? <button type="submit" className="ai-send-button" aria-label={copy.send} disabled={loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}>{loading ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button> : <button type="button" className="ai-voice-button" aria-label={ar ? "محادثة صوتية مباشرة" : "Live voice conversation"} aria-expanded={showLiveVoice} onClick={()=>setShowLiveVoice(true)} disabled={!signedIn || loading || historyLoading || usage?.remaining === 0}><Headphones size={18}/></button>}
          </div>

          <div className="ai-composer-footer">
            <div>{speaking && <button type="button" className="button button-quiet button-small" onClick={()=>{window.speechSynthesis.cancel();setSpeaking(false);}}><VolumeX size={14}/>{ar ? "إيقاف الصوت" : "Stop voice"}</button>}</div>
            <small className="muted">{usage ? (ar ? `متبقي ${usage.remaining} من ${usage.limit} وحدة` : `${usage.remaining} of ${usage.limit} units left`) : copy.subtitle}</small>
          </div>
        </form>
      </section>
    </>}
      {showSettingsModal && <div className="ai-chat-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowSettingsModal(false);}}>
        <section className="ai-chat-settings-modal" role="dialog" aria-modal="true" aria-label={ar ? "إعدادات العمدة" : "AL OMDA settings"}>
          <header><strong><Settings2 size={16}/>{ar ? "إعدادات العمدة" : "AL OMDA settings"}</strong><button type="button" onClick={()=>setShowSettingsModal(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></header>
          <div className="ai-chat-settings-body">
            <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{ar ? "استهلاك الرصيد اليومي" : "Daily allowance"}</strong><span>{usage ? usage.remaining + " / " + usage.limit : "—"}</span></div>
              <div className="ai-chat-settings-stats"><div><small>{ar ? "المتبقي اليوم" : "Remaining"}</small><strong>{usage?.remaining ?? "—"}</strong></div><div><small>{ar ? "المستخدم" : "Used"}</small><strong>{usage?.used ?? "—"}</strong></div><div><small>{ar ? "الحد اليومي" : "Daily limit"}</small><strong>{usage?.limit ?? "—"}</strong></div></div>
              <div className="ai-chat-settings-progress"><i style={{width:percent + "%"}}/></div>
              {usage?.resetAt && <small className="muted">{copy.reset} {new Date(usage.resetAt).toLocaleTimeString(ar ? "ar-EG" : "en-US",{hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"})}</small>}
            </section>
            <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{copy.providers}</strong><span>Gemini · OpenRouter</span></div>
              <div className="ai-chat-provider-row"><Sparkles size={15}/><span><strong>Gemini</strong><small>{usage?.providers?.gemini ? (ar ? "متصل" : "Connected") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>OpenRouter Free Models</strong><small>{usage?.providers?.openrouter ? (ar ? "متصل" : "Connected") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <small className="muted">{copy.voiceNote}</small>
            </section>
            <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{ar ? "ذاكرة العمدة الخاصة بك" : "Your AL OMDA memory"}</strong><span>{memory.length}/6000</span></div>
              <p>{ar ? "اكتب تفضيلاتك ومشاريعك وقراراتك المهمة. الذاكرة محفوظة في حسابك." : "Save preferences, projects, and important decisions to your account memory."}</p>
              <textarea className="field ai-chat-memory-field" rows={4} maxLength={6000} value={memory} onChange={(event)=>setMemory(event.target.value)} disabled={memoryLoading || memorySaving} placeholder={ar ? "اكتب هنا ما تريد أن يتذكره العمدة..." : "What should AL OMDA remember?"}/>
              <div className="ai-chat-settings-actions"><small>{memoryLoading ? (ar ? "جارٍ التحميل..." : "Loading...") : memorySaving ? (ar ? "جارٍ الحفظ..." : "Saving...") : ""}</small><button type="button" className="button button-quiet button-small" onClick={()=>void clearMemory()} disabled={memoryLoading || memorySaving || !memory.trim()}>{ar ? "حذف الذاكرة" : "Delete memory"}</button><button type="button" className="button button-primary button-small" onClick={()=>void saveMemory()} disabled={memoryLoading || memorySaving}>{ar ? "حفظ الذاكرة" : "Save memory"}</button></div>
            </section>
            <section className="ai-chat-settings-section ai-chat-agent-setting"><div><strong>{ar ? "وضع الوكيل المحلي" : "Local Agent mode"}</strong><p>{ar ? "قراءة ملفات المشروع وتعديلها وتشغيل أوامر بعد موافقتك. يحتاج Runtime يعمل على جهازك." : "Inspect project files and run commands with your approval. Requires a local runtime."}</p></div><button type="button" role="switch" aria-checked={agentMode} className={"ai-chat-switch" + (agentMode ? " on" : "")} onClick={()=>{if(!signedIn){setError(copy.login);return;}setAgentMode(v=>!v);}} disabled={!signedIn}><i/></button></section>
          </div>
          <footer><button type="button" className="button button-primary" onClick={()=>{void saveMemory();setShowSettingsModal(false);}}>{ar ? "إغلاق وحفظ الذاكرة" : "Close & save memory"}</button></footer>
        </section>
      </div>}
      {showLiveVoice && <div className="ai-chat-modal-backdrop ai-chat-live-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowLiveVoice(false);}}>
        <section className="ai-chat-live-modal" role="dialog" aria-modal="true" aria-label={ar ? "المحادثة الصوتية المباشرة" : "Live voice conversation"}>
          <header><span><i/> {ar ? "التحدث الصوتي مع العمدة" : "Talk with AL OMDA"}</span><button type="button" onClick={()=>setShowLiveVoice(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></header>
          <div className="ai-chat-live-orb"><span><Mic size={30}/></span></div><div className="ai-chat-live-copy"><strong>{ar ? "العمدة يستمع إليك..." : "AL OMDA is listening..."}</strong><p>{ar ? "تحدث مع العمدة مباشرة، وسيجيبك بصوته." : "Speak naturally and AL OMDA will reply by voice."}</p></div>
          <GeminiLiveVoice language={language} disabled={loading || historyLoading || usage?.remaining === 0} onTranscript={handleLiveTranscript}/>
          <button type="button" className="ai-chat-live-end" onClick={()=>setShowLiveVoice(false)}><X size={15}/>{ar ? "إنهاء المحادثة الصوتية" : "End voice conversation"}</button>
        </section>
      </div>}
      {showCodeCanvas && <div className="ai-chat-modal-backdrop ai-chat-canvas-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowCodeCanvas(false);}}>
        <section className="ai-chat-canvas-modal" role="dialog" aria-modal="true" aria-label={ar ? "محرر الأكواد" : "Code Canvas"}>
          <header><strong><Code2 size={16}/>Code Canvas - {ar ? "محرر ومعاين الأكواد" : "Code editor & preview"}</strong><div><button type="button" className="button button-primary button-small" onClick={runCanvasCode}><Play size={13}/>{ar ? "تشغيل ومعاينة" : "Run preview"}</button><button type="button" onClick={()=>setShowCodeCanvas(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></div></header>
          <div className="ai-chat-canvas-workspace"><textarea dir="ltr" spellCheck={false} value={canvasCode} onChange={(event)=>setCanvasCode(event.target.value)} aria-label={ar ? "محرر الكود" : "Code editor"}/><div className="ai-chat-canvas-preview"><div>{ar ? "المعاينة" : "Preview"}</div>{canvasPreviewCode ? <iframe title="Code Canvas preview" srcDoc={canvasPreviewCode} sandbox="allow-scripts"/> : <p>{ar ? "اكتب الكود ثم اضغط تشغيل ومعاينة." : "Write code and select Run preview."}</p>}</div></div>
        </section>
      </div>}
    </div>
  </div>;
}
