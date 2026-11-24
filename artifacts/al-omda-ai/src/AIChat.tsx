import {HOSTED_PROVIDER_KEY} from './HostedConnections';
import { useEffect, useLayoutEffect, useRef, useState, memo, lazy, Suspense, type FormEvent, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isValidZipArchive, validateOoxmlPackage } from "./lib/ooxml-validation";
import { ZahinOrb } from "./components/ZahinOrb";
import { getWordArtifactExpectedText } from "./lib/office-artifact-text";
import { useLocation } from "wouter";
import { LockKeyhole, Bot, Copy, LoaderCircle, Send, Trash2, Volume2, VolumeX, Mic, Plus, Settings2, X, BriefcaseBusiness, Code2, Palette, FileText, Sheet, Presentation, Search, PenLine, History, MessageSquareText, ArrowLeft, ImagePlus, MoreHorizontal, Share2, Pin, Pencil, Headphones, Sparkles, Play, Square } from "lucide-react";
const MediaStudio=lazy(()=>import("./MediaStudio"));
const GeminiLiveVoice=lazy(()=>import("./GeminiLiveVoice"));
import { readAgentEventStream } from "./lib/agent-stream";
import { detectProjectSpecialty } from "./lib/project-intent";
import { buildBoundedChatContext, combineReplyAndPlan, getChatMessageSyncSignature, hasConversationUpdatedAtChanged, hasConversationListChanged } from "./lib/chat-context";
import { createDocxBlob, createXlsxBlob } from "./lib/office-ooxml";
import { buildFormulaWorksheetCell } from "./lib/office-formula-cell";
import { ensureWorkbookRecalculation } from "./lib/office-workbook-recalculation";
import { resolveArtifactUploadMime } from "./lib/asset-upload";
import { downloadFileFromUrl } from "./lib/download-file";
import { previewOfficeDocument } from "./lib/office-preview";
import { parseModelProviderHealth, providerStatusLabel } from "./lib/model-provider-health";
import { getLocalAgentOrigin } from "./lib/local-agent-url";

type Language = "ar" | "en";
type WordDocumentData = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };
type SpreadsheetData = { title: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string,string>; sheets?: Array<{ name: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string,string> }> };
type PresentationData = { title: string; slides: Array<{ title: string; bullets: string[]; notes?: string }> };
type SourceData = { title: string; name: string; language: string; code: string };
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string; agentPending?: { sessionId: string; calls: Array<{ id: string; tool: string; arguments: Record<string, unknown> }> }; attachment?: { name: string; url: string }; documentData?: WordDocumentData; spreadsheetData?: SpreadsheetData; presentationData?: PresentationData; sourceData?: SourceData; appData?: { title: string; html: string }; taskId?: string; taskTitle?: string; toolExecutionStatus?: string; toolFailures?: Array<{ callId?: string; tool: string; message: string }> };

function createRequestedSourceArtifact(request: string, reply: string): SourceData | null {
  if (!/(?:ملف|تحميل|احفظ|حفظ|نزّل|تنزيل|download|save|export|source\s*file|file\s+for)/i.test(request)) return null;
  const fence = String.fromCharCode(96).repeat(3);
  const match = new RegExp(fence + "([a-zA-Z0-9_+#.-]*)\\s*\\n([\\s\\S]*?)" + fence).exec(reply);
  if (!match || !match[2].trim()) return null;
  const language = (match[1] || "text").toLowerCase();
  const extensions: Record<string, string> = { js: "js", javascript: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", py: "py", python: "py", html: "html", css: "css", json: "json", sql: "sql", dxf: "dxf", sh: "sh", bash: "sh", java: "java", c: "c", cpp: "cpp", cs: "cs", go: "go", rs: "rs", php: "php", rb: "rb", ruby: "rb", md: "md", markdown: "md", xml: "xml", yaml: "yaml", yml: "yml", text: "txt", txt: "txt" };
  const extension = extensions[language] || "txt";
  return { title: "Source code", name: "al-omda-source." + extension, language, code: match[2].trim() };
}


function withPreviewCsp(html: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const meta = '<meta http-equiv="Content-Security-Policy" content="' + policy + '">';
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html;
}

// Interactive HTML previews (Code Canvas, generated apps) cannot run inside a
// srcdoc iframe anymore: srcdoc documents inherit this page's CSP, whose
// script-src has no 'unsafe-inline', so every inline script and event handler
// in the preview was blocked. They render through /canvas-preview.html instead,
// a dedicated sandboxed page with its own offline CSP that allows inline scripts.
function SandboxedPreview({ html, title, style, className }: { html: string; title: string; style?: CSSProperties; className?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const postHtml = () => { frameRef.current?.contentWindow?.postMessage({ type: "munjizly-preview", html }, "*"); };
  return <iframe key={html} ref={frameRef} title={title} src="/api/canvas-preview" sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={postHtml} style={style} className={className} />;
}


function dxfToSvg(source: string): string {
  const lines = source.replace(/\r/g, "").split("\n");
  const entities: Array<{type:string;data:Array<[number,string]>}> = [];
  let inEntities=false;
  let current: {type:string;data:Array<[number,string]>}|null=null;
  for(let i=0;i+1<lines.length;i+=2){
    const group=Number(lines[i].trim()), value=lines[i+1].trim();
    if(!Number.isInteger(group)) continue;
    if(group===0 && value.toUpperCase()==="SECTION" && Number(lines[i+2]?.trim())===2 && lines[i+3]?.trim().toUpperCase()==="ENTITIES"){inEntities=true;i+=2;continue;}
    if(group===0 && value.toUpperCase()==="ENDSEC"){if(current)entities.push(current);current=null;inEntities=false;continue;}
    if(!inEntities)continue;
    if(group===0){
      if(current)entities.push(current);
      current={type:value.toUpperCase(),data:[]};
      if(entities.length>=2000)break;
    }else if(current)current.data.push([group,value]);
  }
  if(current && entities.length<2000)entities.push(current);
  const get=(data:Array<[number,string]>,group:number,fallback=0)=>{const item=data.find(x=>x[0]===group);const n=item?Number(item[1]):fallback;return Number.isFinite(n)?n:fallback;};
  const shapes:string[]=[];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const include=(x:number,y:number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);};
  const xy=(e:{type:string;data:Array<[number,string]>},gx:number,gy:number)=>[get(e.data,gx),get(e.data,gy)] as [number,number];
  for(const e of entities){
    if(e.type==="LINE"){
      const a=xy(e,10,20),b=xy(e,11,21);include(...a);include(...b);
      shapes.push('<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'"/>');
    }else if(e.type==="CIRCLE"){
      const center=xy(e,10,20),radius=Math.max(0,get(e.data,40));include(center[0]-radius,center[1]-radius);include(center[0]+radius,center[1]+radius);
      shapes.push('<circle cx="'+center[0]+'" cy="'+center[1]+'" r="'+radius+'"/>');
    }else if(e.type==="POINT"){
      const point=xy(e,10,20);include(...point);shapes.push('<circle cx="'+point[0]+'" cy="'+point[1]+'" r="1.5"/>');
    }else if(e.type==="ARC"){
      const center=xy(e,10,20),radius=Math.max(0,get(e.data,40)),start=get(e.data,50),end=get(e.data,51);
      if(radius>0){
        const toPoint=(angle:number):[number,number]=>[center[0]+radius*Math.cos(angle*Math.PI/180),center[1]+radius*Math.sin(angle*Math.PI/180)];
        let sweep=(end-start+360)%360;if(sweep===0)sweep=360;
        const a=toPoint(start),b=toPoint(end),largeArc=sweep>180?1:0;
        include(center[0]-radius,center[1]-radius);include(center[0]+radius,center[1]+radius);
        shapes.push('<path d="M '+a[0]+' '+a[1]+' A '+radius+' '+radius+' 0 '+largeArc+' 1 '+b[0]+' '+b[1]+'"/>');
      }
    }else if(e.type==="TEXT"||e.type==="MTEXT"){
      const point=xy(e,10,20),height=Math.max(0.5,get(e.data,40,2.5)),rotation=get(e.data,50);
      const raw=e.data.filter(pair=>e.type==="TEXT"?pair[0]===1||pair[0]===3:pair[0]===1||pair[0]===3).map(pair=>pair[1]).join("");
      const label=raw.replace(/\\P/g," ").replace(/\\~/g," ").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
      if(label){include(point[0],point[1]);shapes.push('<text x="'+point[0]+'" y="'+point[1]+'" transform="translate('+point[0]+' '+point[1]+') scale(1 -1) rotate('+(-rotation)+') translate('+(-point[0])+' '+(-point[1])+')" font-family="sans-serif" font-size="'+height+'" fill="#20252b" stroke="none">'+label+'</text>');}
    }else if(e.type==="LWPOLYLINE"){
      const vertices:Array<[number,number]>=[];let x:number|null=null;
      for(const [group,value] of e.data){
        if(group===10){x=Number(value);}
        else if(group===20&&x!==null){const y=Number(value);if(Number.isFinite(x)&&Number.isFinite(y)){vertices.push([x,y]);include(x,y);}x=null;}
      }
      if(vertices.length>1){
        const coords=vertices.map(point=>point[0]+","+point[1]).join(" ");
        shapes.push((get(e.data,70)&1)===1?'<polygon points="'+coords+'"/>':'<polyline points="'+coords+'"/>');
      }
    }
  }
  if(!shapes.length||!Number.isFinite(minX)||!Number.isFinite(maxX))return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><text x="20" y="40" font-family="sans-serif" font-size="16">No supported entities to preview</text></svg>';
  if(maxX-minX<1){minX-=5;maxX+=5;} if(maxY-minY<1){minY-=5;maxY+=5;}
  const width=maxX-minX,height=maxY-minY,pad=Math.max(width,height)*0.06||5;
  const viewBox=[minX-pad,minY-pad,width+2*pad,height+2*pad].join(" ");
  const stroke=Math.max(width,height)*0.004||0.5;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+viewBox+'" preserveAspectRatio="xMidYMid meet"><g transform="translate(0 '+(minY+maxY)+') scale(1 -1)" fill="none" stroke="#1769aa" stroke-width="'+stroke+'" stroke-linecap="round" stroke-linejoin="round">'+shapes.join("")+'</g></svg>';
}
function createSourceBlob(sourceData: SourceData): Blob {
  const mimeTypes: Record<string,string> = {
    html: "text/html;charset=utf-8", svg: "image/svg+xml;charset=utf-8", dxf: "application/dxf;charset=utf-8",
    json: "application/json;charset=utf-8", css: "text/css;charset=utf-8",
    js: "text/javascript;charset=utf-8", ts: "text/plain;charset=utf-8",
    py: "text/x-python;charset=utf-8", sql: "application/sql;charset=utf-8",
    xml: "application/xml;charset=utf-8", md: "text/markdown;charset=utf-8",
  };
  const extension = sourceData.name.split(".").pop()?.toLowerCase() || "";
  return new Blob([sourceData.code], { type: mimeTypes[extension] || "text/plain;charset=utf-8" });
}

function getWordCopyText(data: WordDocumentData): string {
  const parts = [data.title, ...data.paragraphs];
  if (data.columns.length) {
    parts.push([data.columns.join("\t"), ...data.rows.map((row) => row.join("\t"))].join("\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}
function getSpreadsheetCopyText(data: SpreadsheetData): string {
  const sheets = data.sheets?.length ? data.sheets : [{ name: "Sheet1", columns: data.columns, rows: data.rows, formulas: data.formulas }];
  const output: string[] = [];
  for (const sheet of sheets) {
    const lines = [sheet.name, sheet.columns.join("\t")];
    sheet.rows.forEach((row, rowIndex) => {
      const values = sheet.columns.map((_, columnIndex) => {
        const address = excelColumnName(columnIndex) + (rowIndex + 2);
        return sheet.formulas?.[address] ? "=" + sheet.formulas[address] : String(row[columnIndex] ?? "");
      });
      lines.push(values.join("\t"));
    });
    output.push(lines.join("\n"));
  }
  return output.join("\n\n");
}
function getPresentationCopyText(data: PresentationData): string {
  const slides = data.slides.map((slide, index) => {
    const lines = ["[Slide " + (index + 1) + "] " + slide.title];
    for (const bullet of slide.bullets) lines.push("• " + bullet);
    if (slide.notes) lines.push("Speaker notes: " + slide.notes);
    return lines.join("\n");
  });
  return [data.title, ...slides].join("\n\n");
}

function excelColumnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
type Conversation = { id: string; title: string; created_at: string; updated_at: string; messages?: ChatMessage[] };
type ConversationResponse = { conversation: Conversation; error?: string };
type Usage = {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
  providers?: { gemini: boolean; openrouter: boolean; groq?: boolean; cloudflare?: boolean };
};
type MemoryGraphNode = { id: string; node_type: string; label: string; source?: string; confidence?: number };
type MemoryGraphEdge = { id: string; source_node_id: string; target_node_id: string; relation: string };

const MessageContent=memo(function MessageContent({ content }: { content: string }) {
  return <div className="ai-chat-markdown">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children }) => {
          if (!/language-/.test(className || "")) return <code className="ai-chat-inline-code">{children}</code>;
          const languageName = (className || "").replace(/^.*language-/, "") || "code";
          return <div className="ai-chat-code-block" style={{ minWidth: 0, border: "1px solid var(--border,#343a44)", borderRadius: 10, overflow: "hidden", background: "#11151b" }}>
            <div className="ai-chat-code-language" style={{ padding: "6px 10px", color: "#926cc6", fontSize: 11, borderBottom: "1px solid #343a44" }}>{languageName}</div>
            <pre className="ai-chat-code-content" dir="ltr" style={{ margin: 0, padding: 12, overflowX: "auto", color: "#e8edf4", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre" }}><code>{String(children).replace(/\n$/, "")}</code></pre>
          </div>;
        },
      }}
    >{content}</ReactMarkdown>
  </div>;
});

export default function AIChatPage({ language, signedIn, openSettingsInitially, displayName, onToggleLanguage, onPageHelp }: { language: Language; signedIn: boolean; openSettingsInitially?: boolean; displayName?: string; onToggleLanguage?:()=>void; onPageHelp?:()=>void }) {
  const ar = language === "ar";
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{ name: string; mimeType: string; data: string; preview: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
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
  const [agentRunSessionId, setAgentRunSessionId] = useState("");
  const [agentCancelling, setAgentCancelling] = useState(false);
  const [agentConnectionStatus, setAgentConnectionStatus] = useState("");
  const [agentSessions, setAgentSessions] = useState<Array<{ id: string; updatedAt: string; lastMessage: string; pending: boolean }>>([]);
  const [memory, setMemory] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryGraphNodes, setMemoryGraphNodes] = useState<MemoryGraphNode[]>([]);
  const [memoryGraphEdges, setMemoryGraphEdges] = useState<MemoryGraphEdge[]>([]);
  const [memoryGraphLoadError, setMemoryGraphLoadError] = useState("");
  const [memoryGraphLoading, setMemoryGraphLoading] = useState(false);
  const [memoryGraphActionError, setMemoryGraphActionError] = useState("");
  const [memoryGraphEdgeSource, setMemoryGraphEdgeSource] = useState("");
  const [memoryGraphEdgeTarget, setMemoryGraphEdgeTarget] = useState("");
  const [memoryGraphEdgeRelation, setMemoryGraphEdgeRelation] = useState("related_to");
  const [memoryGraphEdgeSaving, setMemoryGraphEdgeSaving] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showLiveVoice, setShowLiveVoice] = useState(false);
  const liveAudioUnlockRef=useRef<AudioContext|null>(null);
  const openLiveVoice=()=>{
    // Unlock playback inside the actual opening tap, before the lazy import.
    const AudioContextClass=window.AudioContext||(window as any).webkitAudioContext;
    if(AudioContextClass&&!liveAudioUnlockRef.current){try{
      if('audioSession' in navigator)(navigator as any).audioSession.type='play-and-record';
      const context:AudioContext=new AudioContextClass();liveAudioUnlockRef.current=context;
      void context.resume().catch(()=>undefined);
    }catch{/* Voice component reports unsupported audio or permissions. */}}
    setShowLiveVoice(true);
  };
  useEffect(()=>{if(!showLiveVoice){void liveAudioUnlockRef.current?.close().catch(()=>undefined);liveAudioUnlockRef.current=null;}return()=>{};},[showLiveVoice]);
  useEffect(()=>()=>{void liveAudioUnlockRef.current?.close().catch(()=>undefined);},[]);

  const [mediaStudioOpen,setMediaStudioOpen] = useState(false);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(Boolean(openSettingsInitially));
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showCodeCanvas, setShowCodeCanvas] = useState(false);
  const [canvasCode, setCanvasCode] = useState(`<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#111;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px 16px">
<h2>معاينة كود Munjizly</h2><p>الكود يعمل مباشرة داخل التطبيق.</p>
<button onclick="document.getElementById('canvas-status').textContent='تم التشغيل بنجاح!'" style="padding:10px 20px;background:#10b981;border:0;color:white;border-radius:8px;cursor:pointer">اختبار الزر</button>
<p id="canvas-status" role="status" aria-live="polite"></p>
</body></html>`);
  const [canvasPreviewCode, setCanvasPreviewCode] = useState('');
  const [currentMode, setCurrentMode] = useState<null | "word" | "excel" | "ppt" | "office">(null);
  const chatTopbarRef = useRef<HTMLElement | null>(null);
  const plusWrapRef = useRef<HTMLDivElement | null>(null);
  const [previewingDocument, setPreviewingDocument] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const historyLoadingRef = useRef(historyLoading);
  historyLoadingRef.current = historyLoading;
  const recognitionRef = useRef<any>(null);
  const voiceStartTimerRef=useRef(0);
  const [voiceStarting,setVoiceStarting]=useState(false);
  const voiceHasResultRef = useRef(false);
  const voiceHadErrorRef = useRef(false);
  const voiceStoppedByUserRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const sendingRef = useRef(false);
  const agentConnectionCheckRef = useRef(0);
  const lastSyncedConversationUpdatedAtRef = useRef("");
  const agentStreamControllerRef = useRef<AbortController | null>(null);
  const agentRunConfigRef = useRef<{ sessionId: string; endpoint: string; token: string } | null>(null);
  const componentMountedRef = useRef(true);
  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      const config = agentRunConfigRef.current;
      if (config) void fetch(config.endpoint + "/v1/agent/cancel", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + config.token }, body: JSON.stringify({ sessionId: config.sessionId }), keepalive: true }).catch(() => undefined);
      agentStreamControllerRef.current?.abort();
    };
  }, []);
  useEffect(() => { agentConnectionCheckRef.current += 1; setAgentConnectionStatus(""); return () => { agentConnectionCheckRef.current += 1; }; }, [agentRuntimeUrl, agentToken]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    title: ar ? "شات Munjizly الذكي" : "Munjizly Chat",
    subtitle: ar ? "Munjizly يختار نموذجًا مجانيًا متخصصًا حسب طلبك ويجرّب بدائل تلقائيًا." : "Munjizly selects a specialized free model for each request and automatically tries alternatives.",
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
    loading: ar ? "Munjizly يفكر..." : "Munjizly is thinking...",
    exhausted: ar ? "انتهى رصيدك اليومي. سيتجدد تلقائيًا عند بداية يوم UTC التالي." : "Your daily allowance is exhausted. It resets at the next UTC day.",
    empty: ar ? "ابدأ محادثتك مع Munjizly." : "Start a conversation with Munjizly.",
    clear: ar ? "محادثة جديدة" : "New chat",
    historyLoading: ar ? "جارٍ تحميل المحادثة المحفوظة..." : "Loading saved conversation...",
    copy: ar ? "نسخ الرد" : "Copy answer",
    copied: ar ? "تم النسخ" : "Copied",
    reset: ar ? "يتجدد الرصيد عند" : "Allowance resets at",
  };

  const loadConversation = async (id: string, preloadedData?: ConversationResponse) => {
    setHistoryLoading(true);
    try {
      let data = preloadedData;
      if (!data) {
        const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { credentials: "same-origin", cache: "no-store" });
        data = await response.json() as ConversationResponse;
        if (!response.ok) throw new Error(data.error || (ar ? "تعذر تحميل المحادثة." : "Could not load conversation."));
      }
      if (!data?.conversation) throw new Error(data?.error || (ar ? "تعذر تحميل المحادثة." : "Could not load conversation."));
      setActiveConversationId(id);
      lastSyncedConversationUpdatedAtRef.current = typeof data.conversation.updated_at === "string" ? data.conversation.updated_at : "";
      const restored = Array.isArray(data.conversation.messages) ? data.conversation.messages.filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-100) as ChatMessage[] : [];
      const existingBySignature = new Map<string, ChatMessage[]>();
      if (id === activeConversationId) {
        for (const item of messagesRef.current) {
          const signature = getChatMessageSyncSignature([item]);
          const matches = existingBySignature.get(signature) || [];
          matches.push(item);
          existingBySignature.set(signature, matches);
        }
      }
      const withFiles = await Promise.all(restored.map(async (item) => {
        const matches = existingBySignature.get(getChatMessageSyncSignature([item]));
        const existing = matches?.shift();
        if (existing?.attachment) return { ...item, attachment: existing.attachment };
        if (item.documentData) return { ...item, attachment: await createWordAttachment(item.documentData).catch(() => undefined) };
        if (item.spreadsheetData) return { ...item, attachment: await createExcelAttachment(item.spreadsheetData).catch(() => undefined) };
        if (item.presentationData) return { ...item, attachment: await createPowerPointAttachment(item.presentationData).catch(() => undefined) };
        if (item.sourceData) { const blob = createSourceBlob(item.sourceData); const url = URL.createObjectURL(blob); return { ...item, attachment: { name: item.sourceData.name, url } }; }
        if (item.appData) { const blob = new Blob([item.appData.html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); return { ...item, attachment: { name: "AL-OMDA-app.html", url } }; }
        return item;
      }));
      const retainedBlobUrls = new Set(withFiles.map((item) => item.attachment?.url).filter((url): url is string => typeof url === "string" && url.startsWith("blob:")));
      for (const previous of messagesRef.current) {
        const url = previous.attachment?.url;
        if (typeof url === "string" && url.startsWith("blob:") && !retainedBlobUrls.has(url)) URL.revokeObjectURL(url);
      }
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
      setActiveConversationId(item.id); lastSyncedConversationUpdatedAtRef.current = typeof item.updated_at === "string" ? item.updated_at : ""; setMessages([]); setInput(""); setError(""); setShowConversationList(false);
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
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(conversationId), { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: items.slice(-100).map(({ role, content, provider, agentPending, documentData, spreadsheetData, presentationData, sourceData, appData, taskId, taskTitle, toolExecutionStatus, toolFailures }) => ({ role, content, ...(provider ? { provider } : {}), ...(agentPending ? { agentPending } : {}), ...(documentData ? { documentData } : {}), ...(spreadsheetData ? { spreadsheetData } : {}), ...(presentationData ? { presentationData } : {}), ...(sourceData ? { sourceData } : {}), ...(appData ? { appData } : {}), ...(taskId ? { taskId } : {}), ...(taskTitle ? { taskTitle } : {}), ...(toolExecutionStatus ? { toolExecutionStatus } : {}), ...(toolFailures ? { toolFailures } : {}) })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حفظ المحادثة." : "Could not save conversation."));
      if (data.conversation) {
        if (conversationId === activeConversationId && typeof data.conversation.updated_at === "string") lastSyncedConversationUpdatedAtRef.current = data.conversation.updated_at;
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, ...data.conversation } : item).sort((x,y) => Date.parse(y.updated_at)-Date.parse(x.updated_at)));
      }
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
  const loadMemoryGraph = async () => {
    if (!signedIn || memoryGraphEdgeSaving || memorySaving) return false;
    setMemoryGraphLoading(true);
    setMemoryGraphLoadError("");
    try {
      const graphResponse = await fetch("/api/ai/memory/graph", { credentials: "same-origin", cache: "no-store" });
      const graphData = await graphResponse.json().catch(() => null);
      if (!graphResponse.ok || !graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
        throw new Error(typeof graphData?.error === "string" ? graphData.error : (ar ? "تعذر تحميل سجل الحقائق. أعد المحاولة." : "Could not load confirmed memory. Please retry."));
      }
      setMemoryGraphNodes(graphData.nodes);
      setMemoryGraphEdges(graphData.edges);
      return true;
    } catch (err) {
      setMemoryGraphLoadError(err instanceof Error ? err.message : (ar ? "تعذر تحميل سجل الحقائق. أعد المحاولة." : "Could not load confirmed memory. Please retry."));
      return false;
    } finally {
      setMemoryGraphLoading(false);
    }
  };

  const loadMemory = async () => {
    if (!signedIn) return;
    setMemoryLoading(true);
    setMemoryGraphActionError("");
    try {
      const [response] = await Promise.all([
        fetch("/api/ai/memory", { credentials: "same-origin", cache: "no-store" }),
        loadMemoryGraph(),
      ]);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error || (ar ? "تعذر تحميل ذاكرة Munjizly." : "Could not load AI memory."));
      setMemory(typeof data.memory === "string" ? data.memory : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل الذاكرة." : "Could not load memory."));
    } finally {
      setMemoryLoading(false);
    }
  };

  const addMemoryGraphEdge = async () => {
    if (!signedIn || memoryGraphEdgeSaving || memoryGraphLoading || memorySaving || !memoryGraphEdgeSource || !memoryGraphEdgeTarget || memoryGraphEdgeSource === memoryGraphEdgeTarget) return;
    setMemoryGraphEdgeSaving(true);
    setMemoryGraphActionError("");
    try {
      const response = await fetch("/api/ai/memory/graph/edges", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edges: [{ sourceNodeId: memoryGraphEdgeSource, targetNodeId: memoryGraphEdgeTarget, relation: memoryGraphEdgeRelation }] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر حفظ العلاقة." : "Could not save the relationship."));
      const savedEdges = Array.isArray(data.edges) ? data.edges as MemoryGraphEdge[] : [];
      setMemoryGraphEdges((current) => {
        const byId = new Map(current.map((edge) => [edge.id, edge]));
        savedEdges.forEach((edge) => byId.set(edge.id, edge));
        return Array.from(byId.values());
      });
      setMemoryGraphEdgeSource("");
      setMemoryGraphEdgeTarget("");
    } catch (err) {
      setMemoryGraphActionError(err instanceof Error ? err.message : (ar ? "تعذر حفظ العلاقة." : "Could not save the relationship."));
    } finally {
      setMemoryGraphEdgeSaving(false);
    }
  };

  const saveMemory = async (): Promise<boolean> => {
    if (memorySaving || memoryLoading || !signedIn) return false;
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
      setError(ar ? "تم حفظ ذاكرة Munjizly الخاصة بحسابك." : "Your private Munjizly memory was saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر حفظ الذاكرة." : "Could not save memory."));
      return false;
    } finally {
      setMemorySaving(false);
    }
  };

  const clearMemory = async () => {
    if (memorySaving || memoryLoading || memoryGraphEdgeSaving || !signedIn || (!memory.trim() && memoryGraphNodes.length === 0 && !memoryGraphLoadError)) return;
    if (!window.confirm(ar ? "هل تريد حذف ذاكرة Munjizly والنقاط المؤكدة الخاصة بحسابك؟" : "Delete your private memory and confirmed memory graph?")) return;
    setMemorySaving(true);
    setError("");
    try {
      const [textResult, graphResult] = await Promise.allSettled([
        fetch("/api/ai/memory", { method: "DELETE", credentials: "same-origin" }),
        fetch("/api/ai/memory/graph", { method: "DELETE", credentials: "same-origin" }),
      ]);
      let textError = "";
      let graphError = "";
      if (textResult.status === "fulfilled") {
        const data = await textResult.value.json().catch(() => ({}));
        if (textResult.value.ok) setMemory("");
        else textError = data.error || (ar ? "تعذر حذف الذاكرة النصية." : "Could not delete text memory.");
      } else {
        textError = ar ? "تعذر الاتصال لحذف الذاكرة النصية." : "Could not reach the text-memory service.";
      }
      if (graphResult.status === "fulfilled") {
        const graphData = await graphResult.value.json().catch(() => ({}));
        if (graphResult.value.ok) {
          setMemoryGraphNodes([]);
          setMemoryGraphEdges([]);
          setMemoryGraphLoadError("");
          setMemoryGraphActionError("");
          setMemoryGraphEdgeSource("");
          setMemoryGraphEdgeTarget("");
        } else {
          graphError = graphData.error || (ar ? "تعذر حذف سجل الحقائق." : "Could not delete the confirmed memory graph.");
          setMemoryGraphLoadError(graphError);
        }
      } else {
        graphError = ar ? "تعذر الاتصال لحذف سجل الحقائق." : "Could not reach the confirmed memory graph service.";
        setMemoryGraphLoadError(graphError);
      }
      if (textError || graphError) throw new Error([textError, graphError].filter(Boolean).join(" "));
      setError(ar ? "تم حذف الذاكرة النصية وسجل الحقائق الخاصة بحسابك." : "Your private text memory and confirmed memory graph were deleted.");
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

  // Keep the same signed-in account in sync across phones, computers, and browser tabs.
  useEffect(() => {
    if (!signedIn || !activeConversationId) return;
    let stopped = false;
    let syncing = false;
    const sync = async () => {
      if (stopped || syncing || document.visibilityState !== "visible" || loadingRef.current || historyLoadingRef.current) return;
      syncing = true;
      try {
        const listResponse = await fetch("/api/ai/conversations", { credentials: "same-origin", cache: "no-store" });
        if (!listResponse.ok) return;
        const listData = await listResponse.json();
        if (stopped || sendingRef.current || loadingRef.current || historyLoadingRef.current) return;
        const remoteConversations = Array.isArray(listData.conversations) ? listData.conversations as Conversation[] : [];
        if (hasConversationListChanged(conversationsRef.current, remoteConversations)) setConversations(remoteConversations);
        const activeSummary = remoteConversations.find((item) => item?.id === activeConversationId);
        if (!activeSummary) {
          lastSyncedConversationUpdatedAtRef.current = "";
          if (remoteConversations.length) await loadConversation(remoteConversations[0].id);
          else await createConversation();
          return;
        }
        const listedUpdatedAt = typeof activeSummary.updated_at === "string" ? activeSummary.updated_at : "";
        if (!hasConversationUpdatedAtChanged(listedUpdatedAt, lastSyncedConversationUpdatedAtRef.current)) return;
        const conversationResponse = await fetch("/api/ai/conversations/" + encodeURIComponent(activeConversationId), { credentials: "same-origin", cache: "no-store" });
        if (!conversationResponse.ok) return;
        const conversationData = await conversationResponse.json();
        if (stopped || sendingRef.current || loadingRef.current || historyLoadingRef.current || !conversationData.conversation) return;
        const remote: ChatMessage[] = Array.isArray(conversationData.conversation.messages)
          ? conversationData.conversation.messages.filter((item: unknown): item is ChatMessage => item !== null && typeof item === "object" && ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") && typeof (item as ChatMessage).content === "string").slice(-100)
          : [];
        const local = messagesRef.current;
        const remoteUpdatedAt = typeof conversationData.conversation.updated_at === "string" ? conversationData.conversation.updated_at : listedUpdatedAt;
        lastSyncedConversationUpdatedAtRef.current = remoteUpdatedAt;
        if (getChatMessageSyncSignature(remote) !== getChatMessageSyncSignature(local)) {
          shouldAutoScrollRef.current = false;
          await loadConversation(activeConversationId, conversationData as ConversationResponse);
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
  }, [signedIn, activeConversationId]);

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
    window.clearTimeout(voiceStartTimerRef.current);
    recognitionRef.current?.stop?.();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);


  const downloadWordAsPdf = async (documentData: { title: string; paragraphs: string[]; columns: string[]; rows: string[][] }, attachmentName: string) => {
    // The iPhone file viewer shrinks Word tables to their text, so offer a PDF copy that looks the same everywhere.
    try {
      const { createDocumentPdfBlob } = await import("./lib/table-pdf");
      const title = (documentData.title || "").trim();
      const blocks: import("./lib/table-pdf").PdfBlock[] = [];
      if (title) blocks.push({ type: "title", text: title });
      for (const paragraph of documentData.paragraphs) if (paragraph.trim() && paragraph.trim() !== title) blocks.push({ type: "paragraph", text: paragraph });
      if (documentData.columns.length > 0) blocks.push({ type: "table", rows: [documentData.columns, ...documentData.rows.map((row) => documentData.columns.map((_, index) => String(row[index] ?? "")))] });
      const pdf = await createDocumentPdfBlob(blocks, ar);
      const url = URL.createObjectURL(pdf);
      await downloadFileFromUrl(url, attachmentName.replace(/\.docx$/i, "") + ".pdf");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setError(error instanceof Error ? error.message : (ar ? "تعذر إنشاء ملف PDF." : "Could not create the PDF."));
    }
  };

  const createWordAttachment = async (documentData: { title: string; paragraphs: string[]; columns: string[]; rows: string[][] }) => {
    const primaryModuleUrl = "https://esm.sh/docx@9.5.1";
    const fallbackModuleUrl = "https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm";
    let lib: any;
    try { lib = await import(/* @vite-ignore */ primaryModuleUrl); }
    catch {
      try { lib = await import(/* @vite-ignore */ fallbackModuleUrl); }
      catch {
        const blob = createDocxBlob(documentData, ar);
        const url = URL.createObjectURL(blob);
        const safeName = (documentData.title || "AL-OMDA-document").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-document";
        return { name: safeName + ".docx", url };
      }
    }
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, Header, Footer, PageNumber } = lib as any;
    const rtl = ar;
    const border = { style: "single", size: 1, color: "B8C2D2" };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
    const makeParagraph = (value: string, bold = false, color?: string) => {
      const heading = value.match(/^(#{1,3})\s+(.+)$/);
      const bullet = value.match(/^[-*]\s+(.+)$/);
      const text = heading?.[2] || bullet?.[1] || value;
      const headingLevel = heading ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading[1].length - 1] : undefined;
      return new Paragraph({
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: rtl,
        ...(headingLevel ? { heading: headingLevel } : {}),
        ...(bullet ? { bullet: { level: 0 } } : {}),
        children: [new TextRun({ text, bold: bold || Boolean(heading), font: "Arial", size: heading ? [30, 26, 23][heading[1].length - 1] : 20, ...(color ? { color } : {}) })],
        spacing: { before: heading ? 160 : 0, after: heading ? 100 : 120 },
      });
    };
    const children: any[] = [
      new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, children: [new TextRun({ text: documentData.title, bold: true, size: 32, font: "Arial" })], spacing: { after: 260 } }),
      ...documentData.paragraphs.map((paragraph) => makeParagraph(paragraph)),
    ];
    if (documentData.columns.length > 0) {
      // Design B (approved by the owner): warm gold header, tinted bold first column, hairline inner borders.
      // Usable width: A4 11906 twips minus the 800 left/right margins. Explicit dxa widths (a pct width of 100 is only 2% in OOXML).
      const tableWidth = 10306;
      const weights = documentData.columns.map((_, index) => index === 0 ? 0.8 : 1);
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      const columnWidths = weights.map((weight) => Math.floor((tableWidth * weight) / weightSum));
      const frame = { style: "single", size: 12, color: "B38B2F" };
      const inner = { style: "single", size: 4, color: "E7DDBF" };
      const headRule = { style: "single", size: 18, color: "1A1712" };
      const cellMargins = { top: 130, bottom: 130, left: 180, right: 180 };
      const header = new TableRow({ tableHeader: true, height: { value: 520, rule: "atLeast" }, children: documentData.columns.map((column, index) => new TableCell({
        width: { size: columnWidths[index], type: WidthType.DXA },
        shading: { type: "clear", color: "auto", fill: "C9A24B" }, verticalAlign: "center", margins: cellMargins,
        borders: { bottom: headRule },
        children: [makeParagraph(column, true, "1A1712")],
      })) });
      const bodyRows = documentData.rows.map((row) => new TableRow({
        height: { value: 480, rule: "atLeast" },
        children: documentData.columns.map((_, index) => new TableCell({
          width: { size: columnWidths[index], type: WidthType.DXA },
          verticalAlign: "center", margins: cellMargins,
          ...(index === 0 ? { shading: { type: "clear", color: "auto", fill: "F6EDD2" } } : {}),
          children: [index === 0 ? makeParagraph(String(row[index] ?? ""), true, "5C4513") : makeParagraph(String(row[index] ?? ""))],
        })),
      }));
      children.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        layout: "fixed",
        visuallyRightToLeft: rtl,
        columnWidths,
        borders: { top: frame, bottom: frame, left: frame, right: frame, insideHorizontal: inner, insideVertical: inner },
        rows: [header, ...bodyRows],
      }));
    }
    const header = new Header({ children: [new Paragraph({
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: rtl,
      children: [new TextRun({ text: documentData.title, color: "64748B", size: 16, font: "Arial" })],
    })] });
    const footer = new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: ar ? "صفحة " : "Page ", size: 16, color: "64748B", font: "Arial" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B", font: "Arial" }),
        new TextRun({ text: ar ? " من " : " of ", size: 16, color: "64748B", font: "Arial" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "64748B", font: "Arial" }),
      ],
    })] });
    const file = await Packer.toBlob(new Document({ sections: [{
      properties: { page: { margin: { top: 1100, right: 800, bottom: 1100, left: 800 } } },
      headers: { default: header },
      footers: { default: footer },
      children,
    }] }));
    if (!(file instanceof Blob) || !(await validateOoxmlPackage(file, { requiredEntries: ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml"], expectedText: getWordArtifactExpectedText(documentData) }))) throw new Error(ar ? "ملف Word الناتج لا يحتوي على بنية DOCX المطلوبة ولم يتم إرفاقه." : "The generated Word file is missing required DOCX package entries and was not attached.");
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
        const blob = createXlsxBlob(data);
        const url = URL.createObjectURL(blob);
        const safeName = (data.title || "AL-OMDA-workbook").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-workbook";
        return { name: safeName + ".xlsx", url };
      }
    }
    const XLSX = (lib as any).default ?? lib;
    const sheets = data.sheets?.length ? data.sheets : [{ name: "Sheet1", columns: data.columns, rows: data.rows, formulas: data.formulas }];
    const workbook = XLSX.utils.book_new();
    const expectedFormulas: Array<{ sheet: string; cell: string }> = [];
    for (const sheet of sheets) {
      const worksheet = XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows]);
      worksheet["!cols"] = sheet.columns.map((column, index) => ({ wch: Math.min(42, Math.max(14, String(column).length + 4, ...sheet.rows.slice(0, 40).map((row) => String(row[index] ?? "").length + 2))) }));
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.rows.length, c: sheet.columns.length - 1 } }) };
      for (const [address, rawFormula] of Object.entries(sheet.formulas || {})) {
        const formula = String(rawFormula).trim().replace(/^=/, "");
        if (!formula || /\b(?:WEBSERVICE|HYPERLINK|DDE|CALL|EXEC|REGISTER|RTD|INDIRECT)\s*\(/i.test(formula) || /[\[\]]/.test(formula)) {
          throw new Error(ar ? "تم رفض صيغة Excel غير آمنة." : "An unsafe Excel formula was rejected.");
        }
        const cell = XLSX.utils.decode_cell(address);
        if (cell.r < 1 || cell.r > sheet.rows.length || cell.c >= sheet.columns.length) throw new Error(ar ? "صيغة Excel تشير إلى خلية خارج نطاق الجدول." : "An Excel formula points outside the worksheet data range.");
        const canonicalAddress = XLSX.utils.encode_cell(cell);
        // buildFormulaWorksheetCell keeps the model's cached value (or a placeholder) next
        // to the formula: XLSX.write drops a formula-only cell entirely, which then fails
        // the round-trip validation below and the whole workbook is rejected.
        worksheet[canonicalAddress] = buildFormulaWorksheetCell(worksheet[canonicalAddress], formula);
        expectedFormulas.push({ sheet: sheet.name, cell: canonicalAddress });
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    }
    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.CalcPr = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };
    const rawBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const bytes = expectedFormulas.length ? ensureWorkbookRecalculation(rawBytes, (lib as any).CFB ?? XLSX.CFB) : rawBytes;
    const roundTrip = XLSX.read(bytes, { type: "array", cellFormula: true });
    if (roundTrip.SheetNames?.length !== sheets.length) throw new Error(ar ? "فشل التحقق من عدد أوراق Excel." : "Excel worksheet count validation failed.");
    for (const sheet of sheets) {
      const outputSheet = roundTrip.Sheets[sheet.name];
      if (!outputSheet || XLSX.utils.sheet_to_json(outputSheet, { header: 1 }).length !== sheet.rows.length + 1) {
        throw new Error(ar ? "فشل التحقق من محتوى ورقة Excel." : "Excel worksheet content validation failed.");
      }
      const expectedRows = [sheet.columns, ...sheet.rows];
      for (let rowIndex = 0; rowIndex < expectedRows.length; rowIndex++) {
        for (let columnIndex = 0; columnIndex < sheet.columns.length; columnIndex++) {
          const expectedValue = expectedRows[rowIndex][columnIndex];
          if (expectedValue === "" || expectedValue === null || expectedValue === undefined) continue;
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const actualCell = outputSheet[address];
          if (!actualCell || typeof actualCell.v !== typeof expectedValue || !Object.is(actualCell.v, expectedValue)) {
            throw new Error(ar ? "فشل التحقق من قيمة أو نوع خلية في ورقة Excel." : "An Excel cell value or data type failed round-trip validation.");
          }
        }
      }
    }
    for (const formula of expectedFormulas) {
      if (!roundTrip.Sheets[formula.sheet]?.[formula.cell]?.f) throw new Error(ar ? "لم يتم حفظ إحدى صيغ Excel." : "An Excel formula was not preserved in the workbook.");
    }
    const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (!(await isValidZipArchive(file))) throw new Error(ar ? "ملف Excel الناتج غير صالح." : "The generated Excel file is invalid.");
    const url = URL.createObjectURL(file);
    const safeName = (data.title || "AL-OMDA-workbook").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-workbook";
    return { name: safeName + ".xlsx", url };
  };

  const createPowerPointAttachment = async (data: PresentationData) => {
    const primaryModuleUrl = "https://esm.sh/pptxgenjs@3.12.0";
    const fallbackModuleUrl = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.es.js";
    let imported: any;
    try { imported = await import(/* @vite-ignore */ primaryModuleUrl); }
    catch {
      try { imported = await import(/* @vite-ignore */ fallbackModuleUrl); }
      catch { throw new Error(ar ? "تعذر تحميل مكتبة إنشاء PowerPoint المجانية. تحقق من الاتصال ثم أعد المحاولة." : "Could not load the free PowerPoint generator. Check your connection and retry."); }
    }
    const PptxGenJS = imported.default ?? imported;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Munjizly";
    pptx.subject = data.title;
    pptx.title = data.title;
    pptx.company = "Munjizly";
    pptx.lang = ar ? "ar-SA" : "en-US";
    pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: pptx.lang };
    for (const item of data.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: "101722" };
      slide.addText(item.title, { x: 0.55, y: 0.45, w: 12.2, h: 0.85, fontFace: "Arial", fontSize: 26, bold: true, color: "D8B978", align: ar ? "right" : "left", rtlMode: ar, margin: 0.08, fit: "shrink", breakLine: false });
      const bulletTextLength = item.bullets.reduce((total, bullet) => total + bullet.length, 0);
      const bulletFontSize = bulletTextLength <= 650 ? 19 : bulletTextLength <= 1100 ? 17 : bulletTextLength <= 1700 ? 15 : 13;
      if (item.bullets.length) slide.addText(item.bullets.map((text) => ({ text, options: { bullet: { indent: 18 }, hanging: 4, breakLine: true } })), { x: 0.75, y: 1.65, w: 11.8, h: 5.15, fontFace: "Arial", fontSize: bulletFontSize, color: "F1F5F9", paraSpaceAfterPt: 16, valign: "mid", align: ar ? "right" : "left", rtlMode: ar, margin: 0.12, fit: "shrink", breakLine: false });
      if (item.notes) slide.addNotes(item.notes);
      slide.addText("Munjizly", { x: 0.55, y: 7.08, w: 12.2, h: 0.2, fontFace: "Arial", fontSize: 9, color: "8290A3", align: "center", margin: 0 });
    }
    const blob = await pptx.write({ outputType: "blob" }) as Blob;
    // PptxGenJS writes a notes part for every slide, including empty notes.
    const expectedNotesCount = data.slides.length;
    if (!(blob instanceof Blob) || blob.size < 1000 || !(await validateOoxmlPackage(blob, { requiredEntries: ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"], expectedSlideCount: data.slides.length, expectedNotesCount, expectedText: data.slides.flatMap((slide) => [slide.title, ...slide.bullets, ...(slide.notes ? [slide.notes] : [])]) }))) throw new Error(ar ? "ملف PowerPoint الناتج لا يحتوي على بنية PPTX المطلوبة أو أن عدد الشرائح/الملاحظات غير مطابق." : "The generated PowerPoint file is missing required PPTX package entries or its slide/note counts do not match.");
    const url = URL.createObjectURL(blob);
    const safeName = (data.title || "AL-OMDA-presentation").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-presentation";
    return { name: safeName + ".pptx", url };
  };

  const shareAttachment = async (attachment: { name: string; url: string }, title: string) => {
    try {
      if (typeof navigator.share !== "function") throw new Error(ar ? "المشاركة المباشرة للملفات غير مدعومة في هذا المتصفح." : "Direct file sharing is not supported by this browser.");
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(ar ? "تعذر تجهيز الملف للمشاركة." : "Could not prepare the file for sharing.");
      const blob = await response.blob();
      const file = new File([blob], attachment.name, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error(ar ? "مشاركة هذا النوع من الملفات غير مدعومة على جهازك." : "This device cannot share this file type.");
      await navigator.share({ files: [file], title });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : (ar ? "تعذرت مشاركة الملف." : "Could not share the file."));
    }
  };

  const copyArtifactText = async (value: string, index: number, failureMessage: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error(failureMessage);
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => current === index ? null : current), 1800);
    } catch {
      setError(failureMessage);
    }
  };

  const cancelLocalAgent = async () => {
    const config = agentRunConfigRef.current;
    if (!config || config.sessionId !== agentRunSessionId || agentCancelling) return;
    setAgentCancelling(true);
    try {
      const response = await fetch(config.endpoint + "/v1/agent/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + config.token },
        body: JSON.stringify({ sessionId: config.sessionId }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر إلغاء المهمة." : "Could not cancel the Agent run."));
      setAgentConnectionStatus(data.status === "cancelling"
        ? (ar ? "جارٍ إيقاف الوكيل وحفظ نقطة الاستكمال..." : "Stopping the Agent and saving its checkpoint...")
        : data.status === "cancelled"
          ? (ar ? "تم إلغاء الإجراءات المعلّقة ولم يتم تنفيذها." : "Pending actions were cancelled and were not executed.")
          : (ar ? "المهمة انتهت بالفعل ولا توجد إجراءات معلّقة." : "The run already finished; no pending actions remain."));
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر إلغاء المهمة." : "Could not cancel the Agent run."));
    } finally {
      setAgentCancelling(false);
    }
  };

  const continueLocalAgent = async (messageIndex: number, approve: boolean) => {
    const target = messages[messageIndex];
    if (!target?.agentPending || !agentToken.trim() || loading) return;
    const endpoint = getLocalAgentOrigin(agentRuntimeUrl, ar ? "استخدم عنوان Runtime محليًا مثل localhost أو 127.0.0.1." : "Use a localhost runtime URL such as 127.0.0.1.");
    const token = agentToken.trim();
    const sessionId = target.agentPending.sessionId;
    const controller = new AbortController();
    agentStreamControllerRef.current = controller;
    agentRunConfigRef.current = { sessionId, endpoint, token };
    setAgentRunSessionId(sessionId);
    setLoading(true); setError("");
    try {
      let streamedText = "";
      const startedAt = Date.now();
      const response = await fetch(endpoint + "/v1/agent/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ action: "continue", sessionId, approvedCallIds: approve ? target.agentPending.calls.map((call) => call.id) : [] }), signal: controller.signal });
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
      const resultMessage: ChatMessage = { role: "assistant", content: reply + (pending.length ? (ar ? "\n\nهناك إجراءات أخرى تحتاج موافقتك." : "\n\nMore actions need your approval.") : ""), provider: "Local Agent", ...(data.toolExecutionStatus ? { toolExecutionStatus: data.toolExecutionStatus } : {}), ...(Array.isArray(data.toolFailures) && data.toolFailures.length ? { toolFailures: data.toolFailures } : {}), ...(pending.length ? { agentPending: { sessionId: data.sessionId || sessionId, calls: pending } } : {}) };
      const completed = [...updated, resultMessage].slice(-100); setMessages(completed); await saveHistory(completed);
      if (data.sessionId) { setAgentSessionId(data.sessionId); try { window.localStorage.setItem("omda-agent-session", data.sessionId); } catch {} }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : (ar ? "فشل استكمال الوكيل." : "Agent continuation failed."));
    } finally {
      if (agentStreamControllerRef.current === controller) agentStreamControllerRef.current = null;
      if (agentRunConfigRef.current?.sessionId === sessionId) agentRunConfigRef.current = null;
      setLoading(false);
      setAgentRunSessionId("");
    }
  };

  const checkLocalAgentConnection = async () => {
    const requestId = ++agentConnectionCheckRef.current;
    const runtimeUrl = agentRuntimeUrl;
    const token = agentToken.trim();
    const isCurrent = () => requestId === agentConnectionCheckRef.current;
    setAgentConnectionStatus(ar ? "جارٍ اختبار الاتصال..." : "Checking connection...");
    try {
      const origin = getLocalAgentOrigin(runtimeUrl, ar ? "استخدم عنوان Runtime محليًا مثل localhost أو 127.0.0.1." : "Use a localhost runtime URL such as 127.0.0.1.");
      const response = await fetch(origin + "/health", { cache: "no-store" });
      if (!isCurrent()) return;
      const data = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok || !data.ok) throw new Error(data.error || "Runtime health check failed.");
      const runtimeLabel = ar ? "متصل — " + (data.execution || "جاهز") : "Connected — " + (data.execution || "ready");
      if (!token) {
        setAgentConnectionStatus(runtimeLabel + (ar ? " · أدخل رمز الاتصال لفحص النماذج المحلية." : " · Enter the access token to check configured models."));
        return;
      }
      try {
        const modelResponse = await fetch(origin + "/v1/models/health", {
          headers: { authorization: "Bearer " + token },
          cache: "no-store",
        });
        if (!isCurrent()) return;
        const modelData = await modelResponse.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (modelResponse.status === 401 || modelResponse.status === 403) {
          setAgentConnectionStatus(runtimeLabel + (ar ? " · رمز اتصال Runtime مرفوض أو منتهي الصلاحية." : " · Runtime access token was rejected or has expired."));
          return;
        }
        if (!modelResponse.ok || !Array.isArray(modelData.providers)) {
          setAgentConnectionStatus(runtimeLabel + (ar ? " · Runtime متصل لكن تشخيص النماذج غير متاح." : " · Runtime is connected, but model diagnostics are unavailable."));
          return;
        }
        const providers = parseModelProviderHealth(modelData.providers);
        const summaries = providers.map((provider) => provider.name + ": " + providerStatusLabel(provider, ar) + " (" + provider.latencyMs + "ms)");
        setAgentConnectionStatus(runtimeLabel + (summaries.length ? " · " + summaries.join(" · ") : (ar ? " · لا توجد نماذج مهيأة." : " · No model providers configured.")));
      } catch {
        if (!isCurrent()) return;
        setAgentConnectionStatus(runtimeLabel + (ar ? " · Runtime متصل لكن تعذر فحص النماذج." : " · Runtime is connected, but model diagnostics could not be checked."));
      }
    } catch (err) {
      if (!isCurrent()) return;
      setAgentConnectionStatus((ar ? "تعذر الفحص: " : "Check failed: ") + (err instanceof Error ? err.message : "connection failed"));
    }
  };

  const loadAgentSessions = async () => {
    if (!agentToken.trim()) { setError(ar ? "أدخل رمز الاتصال أولًا." : "Enter the access token first."); return; }
    try {
      const response = await fetch(getLocalAgentOrigin(agentRuntimeUrl, ar ? "استخدم عنوان Runtime محليًا مثل localhost أو 127.0.0.1." : "Use a localhost runtime URL such as 127.0.0.1") + "/v1/agent/sessions", { headers: { authorization: "Bearer " + agentToken.trim() }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر تحميل الجلسات." : "Could not load sessions."));
      const items = Array.isArray(data.sessions) ? data.sessions : [];
      setAgentSessions(items);
      if (!items.length) setAgentConnectionStatus(ar ? "لا توجد جلسات محفوظة." : "No saved sessions.");
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? "تعذر تحميل الجلسات." : "Could not load sessions.")); }
  };

  const modePrompts = {
    word: ar ? "أنشئ مستند Word احترافيًا وجاهزًا للتحميل عن: " : "Create a professional downloadable Word document about: ",
    excel: ar ? "أنشئ ملف Excel منظمًا وجاهزًا للتحميل عن: " : "Create a structured downloadable Excel workbook about: ",
    ppt: ar ? "جهّز عرض PowerPoint منظمًا بعناوين الشرائح ومحتواها وملاحظات المتحدث عن: " : "Prepare a PowerPoint presentation with slide titles, slide content and speaker notes about: ",
    office: ar ? "استخدم أدوات الأوفيس المناسبة لإنجاز: " : "Use the appropriate Office tools to complete: "
  };
  const sendMessage = async (event?: FormEvent, draftOverride?: string) => {
    event?.preventDefault();
    const imageForRequest = pendingImage;
    const fileForRequest = pendingFile;
    // Keep the exact raw composer value so a successful send clears it even
    // when the user entered leading/trailing whitespace. Never clear newer typing.
    const submittedDraft = draftOverride ?? input;
    const text = submittedDraft.trim() || (imageForRequest ? (ar ? "حلّل الصورة المرفقة واشرح ما يظهر فيها." : "Analyze the attached image and explain what it shows.") : fileForRequest ? (ar ? "اقرأ الملف المرفق وافهم محتواه وساعدني في طلبي." : "Read the attached file and help me with it.") : "");
    const visibleText = fileForRequest ? text + "\n\n📎 " + fileForRequest.name : text;
    const attachmentPrompt = fileForRequest ? text.slice(0, 6000) : text;
    const attachmentText = fileForRequest ? fileForRequest.text.slice(0, Math.max(0, 7800 - attachmentPrompt.length - 100)) : "";
    const requestText = fileForRequest ? attachmentPrompt + "\n\n[Attached file: " + fileForRequest.name + "]\n" + attachmentText : text;
    const bareModePrompt = !imageForRequest && !fileForRequest && Object.values(modePrompts).some((prefix) => text === prefix.trim());
    if (bareModePrompt) {
      setError(ar ? "كمّل الجملة بطلبك الأول، وبعدين ابعت." : "Add your request after the prompt, then send.");
      inputRef.current?.focus();
      return;
    }
    if (!text || loading || historyLoading || sendingRef.current || !signedIn || (!agentMode && usage && usage.remaining <= 0)) return;
    // Lock synchronously before the first await so rapid taps/Enter presses cannot
    // create duplicate conversations or send the same request twice.
    sendingRef.current = true;
    setLoading(true);
    let agentController: AbortController | null = null;
    let agentRunSessionIdForRequest = "";
    try {
      const conversationId = activeConversationId || await createConversation();
      if (!componentMountedRef.current) return;
      if (!conversationId) return;
      // If the previous attempt failed after its user turn was persisted,
      // retry that same draft without appending a duplicate user bubble.
      const lastMessage = messages[messages.length - 1];
      const next = lastMessage?.role === "user" && lastMessage.content === visibleText
        ? [...messages]
        : [...messages, { role: "user" as const, content: visibleText }];
      // Keep the draft and attachment in the composer until the request and
      // conversation save both succeed. A network/provider failure must not eat user input.
      shouldAutoScrollRef.current = true;
      setMessages(next);
      setError("");
      // Clear the composer as soon as the message is in the chat. The bubble is
      // the durable copy; keeping the draft until the model replies felt broken.
      setInput((current) => current === submittedDraft ? "" : current);
      await saveHistory(next.slice(-100), conversationId);
      if (!componentMountedRef.current) return;
      const officeArtifactIntent = currentMode !== null || /(?:word|docx?|excel|xlsx|spreadsheet|workbook|power\s*point|powerpoint|pptx|وورد|مستند\s*وورد|ملف\s*وورد|إكسل|اكسيل|اكسل|شيت|ملف\s*اكسل|بوربوينت|عرض\s*تقديمي)/i.test(text);
      if (agentMode && !officeArtifactIntent) {
        if (imageForRequest) throw new Error(ar ? "وضع Agent المحلي لا يستقبل الصور حاليًا. أوقف وضع Agent لتحليل الصورة." : "Local Agent mode does not accept images yet. Turn it off to analyze the image.");
        if (!agentRuntimeUrl.trim() || !agentToken.trim()) throw new Error(ar ? "أدخل عنوان Runtime المحلي ورمز الاتصال أولًا." : "Enter the local runtime URL and access token first.");
        const endpoint = getLocalAgentOrigin(agentRuntimeUrl, ar ? "استخدم عنوان Runtime محليًا مثل localhost أو 127.0.0.1." : "Use a localhost runtime URL such as 127.0.0.1.");
        const priorContext = next.slice(-10, -1).map((item) => item.role + ": " + item.content).join("\n\n").slice(-12000);
        const goal = [priorContext, "Current user request: " + requestText].filter(Boolean).join("\n\n");
        const action = agentSessionId ? "resume" : "run";
        const requestSessionId = agentSessionId || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2));
        agentRunSessionIdForRequest = requestSessionId;
        setAgentRunSessionId(requestSessionId);
        const runtimeToken = agentToken.trim();
        agentRunConfigRef.current = { sessionId: requestSessionId, endpoint, token: runtimeToken };
        agentController = new AbortController();
        agentStreamControllerRef.current = agentController;
        let streamedText = "";
        const startedAt = Date.now();
        const response = await fetch(endpoint + "/v1/agent/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + runtimeToken }, body: JSON.stringify({ action, sessionId: requestSessionId, goal }), signal: agentController.signal });
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
        if (!componentMountedRef.current) return;
        const pending = Array.isArray(data.pending) ? data.pending : [];
        const reply = typeof data.message === "string" && data.message ? data.message : data.status === "approval_required" ? (ar ? "الوكيل يحتاج موافقتك قبل تنفيذ بعض الإجراءات." : "The agent needs your approval before taking some actions.") : data.status === "limit_reached" ? (ar ? "وصل الوكيل إلى حد خطوات الأمان. أرسل متابعة لاستكمال الجلسة." : "The agent reached its safety turn limit. Send a follow-up to continue.") : data.status === "cancelled" ? (ar ? "تم إيقاف الوكيل وحفظ آخر نقطة وصل إليها. يمكنك استكمال الجلسة لاحقًا." : "The Agent was stopped and its last checkpoint was saved. You can resume this session later.") : (ar ? "انتهى تنفيذ الوكيل." : "The agent run finished.");
        const assistantMessage: ChatMessage = { role: "assistant", content: reply, provider: "Local Agent", ...(data.toolExecutionStatus ? { toolExecutionStatus: data.toolExecutionStatus } : {}), ...(Array.isArray(data.toolFailures) && data.toolFailures.length ? { toolFailures: data.toolFailures } : {}), ...(pending.length ? { agentPending: { sessionId: data.sessionId, calls: pending } } : {}) };
        if (data.sessionId) { setAgentSessionId(data.sessionId); try { window.localStorage.setItem("omda-agent-session", data.sessionId); } catch {} }
        const completed = [...next, assistantMessage].slice(-100); setMessages(completed); await saveHistory(completed, conversationId);
        setInput((current) => current === submittedDraft ? "" : current);
        if (fileForRequest) setPendingFile((current) => current?.name === fileForRequest.name && current?.text === fileForRequest.text ? null : current);
        return;
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: (()=>{try{return localStorage.getItem(HOSTED_PROVIDER_KEY)||"auto"}catch{return "auto"}})(), messages: buildBoundedChatContext(next, { maxMessages: fileForRequest ? 8 : 12, maxMessageChars: 8000, maxTotalChars: 30000 }).map((message, index, list) => ({
          role: message.role,
          content: index === list.length - 1 ? requestText : fileForRequest ? message.content.slice(-2500) : message.content,
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
      } else if (data.codeFile && typeof data.codeFile.name === "string" && typeof data.codeFile.code === "string" && typeof data.codeFile.language === "string") {
        const sourceData = data.codeFile as SourceData;
        const blob = createSourceBlob(sourceData);
        const url = URL.createObjectURL(blob);
        assistantMessage = { ...assistantMessage, attachment: { name: sourceData.name, url }, sourceData };
      } else if (data.presentation && typeof data.presentation.title === "string" && Array.isArray(data.presentation.slides)) {
        const attachment = await createPowerPointAttachment(data.presentation);
        assistantMessage = { ...assistantMessage, attachment, presentationData: data.presentation };
      } else {
        const sourceData = createRequestedSourceArtifact(text, data.reply);
        if (sourceData) {
          const blob = createSourceBlob(sourceData);
          const url = URL.createObjectURL(blob);
          assistantMessage = { ...assistantMessage, attachment: { name: sourceData.name, url }, sourceData };
        }
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
      // When the reply already carries a finished file, the work is delivered, not
      // proposed: register the honest artifact record below instead of a gated plan
      // whose pending steps would contradict the delivered file.
      const hasGeneratedFile = Boolean(assistantMessage.attachment);
      if (projectSpecialty && !hasGeneratedFile) {
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
          const planSummary = plan.steps.map((step: { text?: unknown; output?: unknown; complete?: unknown }, index: number) => [
            (index + 1) + ". " + String(step.text || "").slice(0, 240),
            (ar ? "   المخرج: " : "   Deliverable: ") + String(step.output || "").slice(0, 160),
            (ar ? "   معيار الإنجاز: " : "   Acceptance: ") + String(step.complete || "").slice(0, 160),
          ].join("\n")).join("\n\n");
          const planContent =
            (ar
              ? "\n\n**خطة التنفيذ المقترحة — " + taskData.title + " (بانتظار موافقتك):**\n"
              : "\n\n**Proposed execution plan — " + taskData.title + " (awaiting your approval):**\n") +
            planSummary +
            (ar ? "\n\nتم تسجيل المشروع تلقائيًا في **سجل المهام**." : "\n\nThis project was automatically added to **Task History**.");
          const combinedContent = combineReplyAndPlan(assistantMessage.content, planContent, 7800);
          assistantMessage = {
            ...assistantMessage,
            content: combinedContent,
            taskId: taskData.id,
            taskTitle: taskData.title,
          };
          if (taskData.usage) setUsage(taskData.usage);
        } catch (taskError) {
          const detail = taskError instanceof Error ? taskError.message : "تعذر تسجيل المشروع.";
          assistantMessage = { ...assistantMessage, content: assistantMessage.content + (ar ? "\n\nملاحظة: اكتمل الرد، لكن لم أتمكن من تسجيل المشروع في سجل المهام: " : "\n\nNote: The reply is ready, but the project could not be added to Task History: ") + detail };
        }
      }
      if (hasGeneratedFile && assistantMessage.attachment) {
        let taskLogCreated = Boolean(assistantMessage.taskId);
        try {
          const attachment = assistantMessage.attachment;
          const blobResponse = await fetch(attachment.url);
          if (!blobResponse.ok) throw new Error(ar ? "تعذر قراءة الملف الناتج لحفظه." : "Could not read the generated file for workspace storage.");
          const artifactBlob = await blobResponse.blob();
          const mimeType = resolveArtifactUploadMime(attachment.name, artifactBlob.type);
          if (!mimeType) throw new Error(ar ? "نوع الملف الناتج غير معروف." : "The generated file type could not be determined.");

          let artifactTaskId = assistantMessage.taskId;
          if (!artifactTaskId) {
            const taskResponse = await fetch("/api/tasks/artifact", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: attachment.name.replace(/\.[^.]+$/, "").slice(0, 160),
                request: text.slice(0, 10000),
                specialty: currentProjectSpecialty ?? "assistant",
                filename: attachment.name,
                mimeType,
                size: artifactBlob.size,
                language: ar ? "ar" : "en",
              }),
            });
            const taskData = await taskResponse.json().catch(() => ({}));
            if (!taskResponse.ok || typeof taskData.id !== "string") {
              throw new Error(typeof taskData.error === "string" ? taskData.error : (ar ? "تعذر إنشاء سجل دائم للملف." : "Could not create a permanent task log for this file."));
            }
            artifactTaskId = taskData.id;
            taskLogCreated = true;
            assistantMessage = { ...assistantMessage, taskId: taskData.id, taskTitle: taskData.title };
          }

          if (!artifactTaskId) throw new Error(ar ? "تعذر تحديد سجل المهمة لحفظ الملف." : "Could not resolve the task record for this file.");
          const assetParams = new URLSearchParams({ filename: attachment.name, projectId: artifactTaskId });
          const assetResponse = await fetch("/api/storage/assets?" + assetParams.toString(), {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": mimeType },
            body: artifactBlob,
          });
          const assetData = await assetResponse.json().catch(() => ({}));
          if (!assetResponse.ok) {
            throw new Error(typeof assetData.error === "string" ? assetData.error : (ar ? "تعذر حفظ نسخة في أصول المشروع." : "Could not save a copy to project Assets."));
          }
          assistantMessage = {
            ...assistantMessage,
            content: assistantMessage.content + (ar
              ? "\n\nتم تسجيل الملف تلقائيًا في **سجل المهام** وحفظ نسخة في **أصول المشروع**."
              : "\n\nThe file was automatically added to **Task History** and saved in **Project Assets**."),
          };
        } catch (artifactError) {
          const detail = artifactError instanceof Error ? artifactError.message : (ar ? "تعذر حفظ الملف." : "Could not save the file.");
          const note = taskLogCreated
            ? (ar ? "تم تسجيل الملف في سجل المهام، لكن تعذر حفظ نسخة في أصول المشروع: " : "The file is logged in Task History, but saving a copy to Project Assets failed: ")
            : (ar ? "تعذر تسجيل الملف في سجل المهام أو حفظه في أصول المشروع: " : "The file could not be logged in Task History or saved to Project Assets: ");
          assistantMessage = { ...assistantMessage, content: assistantMessage.content + "\n\n" + note + detail };
        }
      }

      const completed = [...next, assistantMessage].slice(-100);
      setMessages(completed);
      if (assistantMessage.appData) setPreviewingDocument(completed.length - 1);
      await saveHistory(completed, conversationId);
      if (officeArtifactIntent) setCurrentMode(null);
      setInput((current) => current === submittedDraft ? "" : current);
      if (imageForRequest) setPendingImage((current) => current?.data === imageForRequest.data ? null : current);
      if (fileForRequest) setPendingFile((current) => current?.name === fileForRequest.name && current?.text === fileForRequest.text ? null : current);
      if (data.usage) setUsage(data.usage);
    } catch (err) {
      if (!agentController?.signal.aborted) setError(err instanceof Error ? err.message : (ar ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));
    } finally {
      if (agentController && agentStreamControllerRef.current === agentController) agentStreamControllerRef.current = null;
      if (agentRunConfigRef.current?.sessionId === agentRunSessionIdForRequest) agentRunConfigRef.current = null;
      if (agentRunSessionIdForRequest) setAgentRunSessionId("");
      sendingRef.current = false;
      setLoading(false);
      void loadUsage();
    }
  };

  const toggleVoiceInput = () => {
    if (listening || voiceStarting) {
      voiceStoppedByUserRef.current = true;
      window.clearTimeout(voiceStartTimerRef.current);
      setVoiceStarting(false);
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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voiceHasResultRef.current = false;
    voiceHadErrorRef.current = false;
    voiceStoppedByUserRef.current = false;
    recognition.onstart=()=>{window.clearTimeout(voiceStartTimerRef.current);setVoiceStarting(false);setListening(true);};
    recognition.onresult = (event: any) => {
      const transcripts: string[] = [];
      for (let index = event.resultIndex ?? 0; index < (event.results?.length ?? 0); index += 1) {
        if(!event.results[index]?.isFinal)continue;
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
      window.clearTimeout(voiceStartTimerRef.current);
      setVoiceStarting(false);
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
        "aborted": { ar: "Safari أوقف خدمة الإملاء قبل إكمالها. تأكد من تفعيل الإملاء وإذن الميكروفون، وأغلق أي محادثة صوتية أو مكالمة أخرى. يمكنك استخدام ميكروفون لوحة المفاتيح بدلًا منها.", en: "Safari aborted dictation. Check Dictation and microphone permission, and end other voice chats or calls. You can use the keyboard microphone instead." },
      };
      if (code === "aborted" && voiceStoppedByUserRef.current) return;
      const detail = messages[code];
      setError(detail ? (ar ? detail.ar : detail.en) : (ar ? "تعذر التعرف على الصوت (" + code + "). تحقق من إذن الميكروفون ودعم المتصفح." : "Speech recognition failed (" + code + "). Check microphone permission and browser support."));
    };
    recognition.onend = () => {
      window.clearTimeout(voiceStartTimerRef.current);
      setVoiceStarting(false);
      setListening(false);
      if (!voiceHasResultRef.current && !voiceHadErrorRef.current && !voiceStoppedByUserRef.current) {
        setVoiceFallback(true);
        setError(ar
          ? "Safari لم يُرجع نصًا. فعّل الإملاء من إعدادات iPhone > عام > لوحة المفاتيح، وتحقق من إذن الميكروفون. يمكنك الضغط داخل خانة الكتابة ثم ميكروفون لوحة المفاتيح."
          : "Safari returned no text. Enable Dictation in iPhone Settings > General > Keyboard and check microphone permission. You can also tap the text field, then the keyboard microphone.");
      }
    };
    recognitionRef.current = recognition;
    setError("");
    setVoiceFallback(false);
    setVoiceStarting(true);
    try {
      // Native recognition starts directly in the tap; no recording MIME assumption.
      recognition.start();
      voiceStartTimerRef.current=window.setTimeout(()=>{
        voiceHadErrorRef.current=true;setVoiceStarting(false);setListening(false);setVoiceFallback(true);
        recognition.abort?.();
        setError(ar?'Safari لم يبدأ خدمة الإملاء. اسمح بالميكروفون وفعّل الإملاء من إعدادات iPhone > عام > لوحة المفاتيح. أو استخدم ميكروفون لوحة المفاتيح داخل خانة الكتابة.':'Safari did not start dictation. Allow microphone access and enable Dictation in iPhone Settings > General > Keyboard, or use the keyboard microphone in the text field.');
      },6000);
    } catch {
      window.clearTimeout(voiceStartTimerRef.current);setVoiceStarting(false);
      setListening(false);
      setVoiceFallback(true);
      setError(ar ? "تعذر بدء التعرف على الصوت في Safari." : "Safari could not start speech recognition.");
    }
  };

  const handleLiveTranscript = (role: "user" | "assistant", text: string) => {
    // Arabic UI: a user transcript with no Arabic letters in any script (Latin, Japanese, Chinese, Cyrillic...) is a speech-recognition misfire, so keep it out of the chat.
    if (ar && role === "user" && !/[\u0600-\u06FF]/.test(text)) return;
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

  const speak = (text: string, index?: number) => {
    if (!("speechSynthesis" in window)) {
      setError(ar ? "تشغيل الصوت غير مدعوم في هذا المتصفح." : "Speech playback is not supported in this browser.");
      return;
    }
    if (window.speechSynthesis.speaking && speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setSpeakingIndex(null);
    const spoken = text
      .replace(new RegExp(String.fromCharCode(96).repeat(3) + "[\\s\\S]*?" + String.fromCharCode(96).repeat(3), "g"), ar ? " كود برمجي. " : " Code block. ")
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
    utterance.onstart = () => { setSpeaking(true); setSpeakingIndex(index ?? null); };
    utterance.onend = () => { setSpeaking(false); setSpeakingIndex(null); };
    utterance.onerror = () => { setSpeaking(false); setSpeakingIndex(null); };
    window.speechSynthesis.speak(utterance);
  };

  const percent = usage ? Math.max(0, Math.min(100, usage.remaining / usage.limit * 100)) : 0;
  const openSettings = () => { setShowSettingsModal(true); void loadMemory(); void loadUsage(); };
  const settingsOpenedInitiallyRef = useRef(false);
  useEffect(() => {
    if (!openSettingsInitially || settingsOpenedInitiallyRef.current) return;
    settingsOpenedInitiallyRef.current = true;
    void loadMemory();
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activateMode = (mode: "word" | "excel" | "ppt" | "office") => {
    setCurrentMode(mode);
    setShowPlusMenu(false);
    setInput((value) => value.trim() ? modePrompts[mode] + value : modePrompts[mode]);
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

  return <div className={"page-enter ai-chat-page" + (desktopSidebarCollapsed ? " is-sidebar-collapsed" : "")}>
    {mediaStudioOpen&&<Suspense fallback={<div role="status">{ar?"جارٍ تحميل الاستوديو…":"Loading studio…"}</div>}><MediaStudio ar={ar} onClose={()=>setMediaStudioOpen(false)}/></Suspense>}
    {chatSidebarOpen && <button type="button" className="ai-chat-sidebar-scrim" aria-label={ar ? "إغلاق القائمة" : "Close sidebar"} onClick={()=>setChatSidebarOpen(false)} />}
    <aside className={"ai-chat-sidebar" + (chatSidebarOpen ? " is-open" : "")} dir={ar ? "rtl" : "ltr"}>
      <div className="ai-chat-sidebar-head">
        <button type="button" className="ai-chat-new-button" onClick={()=>{setChatSidebarOpen(false);void createConversation();}} disabled={!signedIn || loading || historyLoading}><Plus size={16}/><span>{ar ? "محادثة جديدة" : "New chat"}</span><PenLine size={14}/></button>
        <button type="button" className="ai-chat-sidebar-close" onClick={()=>setChatSidebarOpen(false)} aria-label={ar ? "إغلاق القائمة" : "Close sidebar"}><X size={18}/></button>
      </div>
      <div className="ai-chat-tools-caption">{ar ? "أدوات Munjizly" : "Munjizly TOOLS"}</div>
      <div className="ai-chat-tool-list">
        <button type="button" onClick={()=>{setChatSidebarOpen(false);setMediaStudioOpen(true);}} disabled={!signedIn}><ImagePlus size={16}/>{ar?"استوديو الصور والفيديو":"Image & video studio"}</button>
        <button type="button" onClick={()=>{activateMode("office");setChatSidebarOpen(false);}}><BriefcaseBusiness size={16}/>{ar ? "حزمة برامج الأوفيس (Office)" : "Office suite"}</button>
        <button type="button" onClick={()=>{setChatSidebarOpen(false);openCodeCanvas();}}><Code2 size={16}/>{ar ? "محرر البرمجة (Code Canvas)" : "Code Canvas"}</button>
        <button type="button" onClick={()=>{setChatSidebarOpen(false);openSettings();}}><Bot size={16}/>{ar ? "ذاكرة Munjizly والحد اليومي" : "Memory & daily usage"}</button>
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
      <div className="ai-chat-sidebar-account"><span className="ai-chat-account-avatar" aria-hidden="true">{Array.from(displayName?.trim() || (ar ? "ع" : "A"))[0]}</span><span><strong>{displayName?.trim() || (ar ? "حساب Munjizly" : "Munjizly account")}</strong><small>{signedIn ? (ar ? "متصل" : "Signed in") : (ar ? "غير مسجل الدخول" : "Not signed in")}</small></span><button type="button" onClick={()=>{setChatSidebarOpen(false);setLocation("/profile?focus=profile-account-card");}} aria-label={ar ? "الملف الشخصي" : "Profile"}><Settings2 size={16}/></button></div>
    </aside>
    <div className="ai-chat-main" dir={ar ? "rtl" : "ltr"}>
    <header ref={chatTopbarRef} className="ai-chat-topbar" dir={ar ? "rtl" : "ltr"}>
      <button type="button" className="ai-chat-back" onClick={()=>{if(window.matchMedia('(min-width:768px)').matches)setDesktopSidebarCollapsed(value=>!value);else setChatSidebarOpen(true);}} aria-label={ar ? "إظهار أو إخفاء القائمة الجانبية" : "Toggle sidebar"}><i className="ai-chat-bars" aria-hidden="true">☰</i></button>
      <div className="ai-chat-brand" aria-label="مُنجِزلي | Munjizly"><span className="ai-chat-brand-mark"><ZahinOrb state={loading ? "thinking" : "idle"} /></span><span className="ai-chat-brand-copy"><strong>مُنجِزلي | Munjizly</strong><small><i className={signedIn ? "is-ready" : ""}/>{signedIn ? (ar ? "متصل" : "Online") : (ar ? "غير متصل" : "Offline")}</small></span></div>
      {!signedIn && <button type="button" id="ai-chat-login-cta" className="ai-chat-login-cta" onClick={()=>setLocation("/profile?focus=profile-account-card")}><LockKeyhole size={14}/>{ar ? "دخول / حساب جديد" : "Sign in / Sign up"}</button>}
      <button type="button" className="ai-chat-exit" onClick={()=>setLocation("/")} aria-label={ar ? "الخروج من الشات والعودة للرئيسية" : "Exit chat and return home"} title={ar ? "الخروج من الشات" : "Exit chat"}><ArrowLeft size={17}/><span>{ar ? "خروج" : "Exit"}</span></button>
      <div className="ai-chat-model-wrap">
        <button type="button" className="ai-chat-model-button" aria-expanded={showModelMenu} onClick={()=>{setShowChatMenu(false);setShowModelMenu(v=>!v);}}><span>{ar ? "Munjizly · التوجيه التلقائي" : "Munjizly · Auto routing"}</span><i>⌄</i></button>
        {showModelMenu && <div className="ai-chat-model-menu">
          <div className="ai-chat-menu-caption">{ar ? "المحركات المجانية المهيأة" : "Configured free engines"}</div>
          <div className="ai-chat-provider-row"><Sparkles size={15}/><span><strong>Gemini</strong><small>{usage?.providers?.gemini ? (ar ? "مهيأ · متاح للتوجيه" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span><i className={usage?.providers?.gemini ? "is-ready" : ""}/></div>
          <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>OpenRouter Free</strong><small>{usage?.providers?.openrouter ? (ar ? "مهيأ · متاح للتوجيه" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span><i className={usage?.providers?.openrouter ? "is-ready" : ""}/></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>Groq</strong><small>{usage?.providers?.groq ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>Cloudflare Workers AI</strong><small>{usage?.providers?.cloudflare ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
          <p>{ar ? "Munjizly يختار النموذج الأنسب تلقائيًا ويجرّب البدائل عند التعطل." : "Munjizly chooses the best available model and tries alternatives."}</p>
        </div>}
      </div>
      <div className="ai-chat-topbar-actions">
      {agentMode && <span className="ai-chat-agent-badge" title={ar ? "وكيل محلي" : "Local Agent"} aria-label={ar ? "وكيل محلي" : "Local Agent"}><Code2 size={12}/>{ar ? "وكيل محلي" : "Local Agent"}</span>}
      <button type="button" className="ai-chat-header-icon" onClick={openCodeCanvas} title={ar ? "محرر الأكواد" : "Code Canvas"}><Code2 size={16}/></button>
      <button type="button" className="ai-chat-header-icon" onClick={openSettings} title={ar ? "الاستخدام والذاكرة" : "Usage & memory"}><Settings2 size={16}/></button>
      <button type="button" className="ai-chat-menu-trigger" aria-label={ar ? "قائمة الشات" : "Chat menu"} aria-expanded={showChatMenu} onClick={()=>{setShowPlusMenu(false);setShowChatMenu(v=>!v)}}><MoreHorizontal size={21}/></button>
      {showChatMenu && <div className="ai-chat-top-menu" role="menu">
        {onToggleLanguage && <button type="button" onClick={()=>{onToggleLanguage();setShowChatMenu(false);}}>{ar ? "English · تغيير اللغة" : "العربية · Change language"}</button>}
        {onPageHelp && <button type="button" onClick={()=>{onPageHelp();setShowChatMenu(false);}}>{ar ? "مساعدة الصفحة" : "Page help"}</button>}
        <button type="button" onClick={()=>{setShowRoutingInfo(v=>!v);setShowChatMenu(false)}}><Bot size={16}/>{ar ? "التوجيه التلقائي" : "Auto routing"}</button>
        <button type="button" onClick={()=>{setShowConversationList(v=>!v);setShowChatMenu(false)}}><History size={16}/>{ar ? "المحادثات السابقة" : "Conversation history"}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);void createConversation()}} disabled={loading || historyLoading}><Plus size={16}/>{ar ? "محادثة جديدة" : "New chat"}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);openSettings()}}><Settings2 size={16}/>{ar ? "الاستخدام والذاكرة" : "Usage & memory"}</button>
        <button type="button" onClick={()=>{setAgentMode(value=>!value);setShowChatMenu(false);}} aria-pressed={agentMode}><Bot size={16}/>{ar ? (agentMode ? "إيقاف وضع الوكيل المحلي" : "تشغيل وضع الوكيل المحلي") : (agentMode ? "Disable local Agent mode" : "Enable local Agent mode")}</button>
        <button type="button" onClick={()=>{setShowChatMenu(false);showLiveVoice?setShowLiveVoice(false):openLiveVoice()}} aria-expanded={showLiveVoice}><Volume2 size={16}/>{ar ? "المحادثة الصوتية" : "Live voice"}</button>
        <div className="ai-chat-menu-divider"/>
        <button type="button" onClick={()=>{const value=messages.map(m=>(m.role==="user"?(ar?"أنت":"You"):"Munjizly")+": "+m.content).join("\n\n");if(navigator.share){void navigator.share({title:ar?"محادثة مع Munjizly":"Munjizly conversation",text:value}).then(()=>setShowChatMenu(false)).catch((shareError)=>{if(shareError instanceof Error && shareError.name!=="AbortError")setError(shareError.message || (ar?"تعذرت مشاركة المحادثة.":"Could not share conversation."));setShowChatMenu(false);});}else if(navigator.clipboard){void navigator.clipboard.writeText(value).then(()=>setShowChatMenu(false)).catch(()=>{setError(ar?"تعذر نسخ المحادثة.":"Could not copy conversation.");setShowChatMenu(false);});}else{setError(ar?"المشاركة غير مدعومة في هذا المتصفح.":"Sharing is not supported.");setShowChatMenu(false);}}}><Share2 size={16}/>{ar ? "مشاركة المحادثة" : "Share conversation"}</button>
        <button type="button" onClick={()=>{const value=messages.map(m=>(m.role==="user"?(ar?"أنت":"You"):"Munjizly")+": "+m.content).join("\n\n");if(navigator.clipboard)void navigator.clipboard.writeText(value).then(()=>setShowChatMenu(false)).catch(()=>{setError(ar?"تعذر نسخ المحادثة.":"Could not copy conversation.");setShowChatMenu(false);});else setError(ar?"النسخ غير مدعوم.":"Clipboard unavailable.");}}><Copy size={16}/>{ar ? "نسخ المحادثة" : "Copy conversation"}</button>
        <button type="button" onClick={()=>{togglePinnedConversation(activeConversationId);setShowChatMenu(false);}} disabled={!activeConversationId}><Pin size={16}/>{pinnedConversationIds.includes(activeConversationId)?(ar?"إلغاء تثبيت المحادثة":"Unpin conversation"):(ar?"تثبيت المحادثة":"Pin conversation")}</button>
        <button type="button" onClick={()=>{const item=conversations.find(entry=>entry.id===activeConversationId);if(item)void renameConversation(item);setShowChatMenu(false);}} disabled={!activeConversationId}><Pencil size={16}/>{ar ? "إعادة تسمية المحادثة" : "Rename conversation"}</button>
        <button type="button" className="danger" onClick={()=>{if(loadingRef.current || historyLoadingRef.current || !activeConversationId)return;setShowChatMenu(false);void deleteConversation(activeConversationId);}} disabled={loading || historyLoading || !activeConversationId}><Trash2 size={16}/>{ar ? "حذف المحادثة" : "Delete conversation"}</button>
      </div>}
      </div>
    </header>
    {showRoutingInfo && <div className="notice-bar ai-routing-note"><Bot size={14}/><span>{ar ? "التوجيه التلقائي مفعّل: Munjizly يختار نموذجًا مجانيًا متخصصًا حسب نوع طلبك ويجرّب بدائل عند التعطل." : "Automatic routing is on. Munjizly selects a free specialist model and tries alternatives when needed."}</span></div>}
    {currentMode && <div className="ai-chat-mode-banner"><span>{currentMode === "word" ? <FileText size={14}/> : currentMode === "excel" ? <Sheet size={14}/> : currentMode === "ppt" ? <Presentation size={14}/> : <BriefcaseBusiness size={14}/>} {currentMode === "word" ? (ar ? "وضع Word نشط" : "Word mode active") : currentMode === "excel" ? (ar ? "وضع Excel نشط" : "Excel mode active") : currentMode === "ppt" ? (ar ? "إعداد محتوى العرض التقديمي" : "Presentation content mode") : (ar ? "حزمة الأوفيس جاهزة" : "Office suite ready")}</span><button type="button" onClick={clearMode} aria-label={ar ? "إلغاء الوضع" : "Clear mode"}><X size={14}/></button></div>}
    {!signedIn ? <section className="panel panel-pad ai-chat-auth-gate" dir={ar?"rtl":"ltr"}>
      <div className="ai-chat-auth-gate-mark"><LockKeyhole size={25}/></div>
      <h2>{ar?"سجّل دخولك لفتح مساحة الشات":"Sign in to open your chat workspace"}</h2>
      <p className="account-copy">{copy.login}</p>
      <button type="button" className="ai-chat-auth-gate-button" onClick={()=>setLocation("/profile?focus=profile-account-card")}>{ar?"تسجيل الدخول أو إنشاء حساب":"Sign in or create an account"}</button>
    </section> : <>
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
            <div className="ai-chat-welcome-mark"><ZahinOrb state={loading ? "thinking" : "idle"} interactive /></div>
            <h1>{ar ? <>أهلاً بك مع <bdi dir="ltr" className="brand-latin">Munjizly</bdi></> : "Welcome to Munjizly"}</h1>
            <p>{ar ? "مساعدك الذكي المتكامل للبرمجة، الأوفيس، وإدارة المشاريع" : "Your AI workspace for coding, Office documents, and projects."}</p>
            <div className="ai-chat-quick-grid">
              <button type="button" onClick={() => activateMode('word')}><FileText size={17}/><span><strong>{ar ? "مستند Word" : "Word document"}</strong><small>{ar ? "تصدير مستند نصي جاهز" : "Create an editable document"}</small></span></button>
              <button type="button" onClick={() => activateMode('excel')}><Sheet size={17}/><span><strong>{ar ? "جدول Excel" : "Excel workbook"}</strong><small>{ar ? "تصدير جدول بيانات XLSX" : "Export an editable XLSX workbook"}</small></span></button>
              <button type="button" onClick={openCodeCanvas}><Code2 size={17}/><span><strong>{ar ? "برمجة ومعاينة" : "Code & preview"}</strong><small>{ar ? "فتح وتشغيل الكود في Canvas" : "Open and run code in Canvas"}</small></span></button>
              <button type="button" onClick={openSettings}><Bot size={17}/><span><strong>{ar ? "ذاكرة Munjizly" : "Munjizly memory"}</strong><small>{ar ? "تخصيص الذاكرة والوكيل المحلي" : "Memory and local Agent settings"}</small></span></button>
            </div>
          </div>}
          {messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}>
            <strong>{message.role === "user" ? (ar ? "أنت" : "You") : "Munjizly"}</strong>
            <MessageContent content={message.content} />
            {message.toolFailures?.length ? <div role="status" style={{display:"grid",gap:6,width:"100%",padding:10,marginTop:8,border:"1px solid rgba(134,80,210,.4)",borderRadius:10,background:"rgba(134,80,210,.07)"}}>
              <strong style={{fontSize:12}}>{ar ? "تنبيه: بعض الأدوات لم تكتمل" : "Some tools did not complete"}</strong>
              {message.toolFailures.slice(0,6).map((failure,index)=><div key={failure.callId || index} style={{fontSize:12,overflowWrap:"anywhere"}}><b>{failure.tool}</b>: {failure.message}</div>)}
            </div> : null}
            {message.agentPending && <div style={{display:"grid",gap:8,width:"100%",padding:12,border:"1px solid var(--border,#343a44)",borderRadius:10}}><strong>{ar ? "موافقة مطلوبة (" + message.agentPending.calls.length + ")" : "Approval required (" + message.agentPending.calls.length + ")"}</strong>{message.agentPending.calls.map((call)=><div key={call.id} style={{fontSize:12,overflowWrap:"anywhere"}}><b>{call.tool}</b><pre style={{whiteSpace:"pre-wrap",margin:"4px 0",color:"var(--muted,#9aa3af)"}}>{JSON.stringify(call.arguments,null,2)}</pre></div>)}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className="button button-primary button-small" disabled={loading || !agentToken.trim()} onClick={()=>void continueLocalAgent(index,true)}>{ar ? "موافقة وتنفيذ" : "Approve & execute"}</button><button type="button" className="button button-quiet button-small" disabled={loading || !agentToken.trim()} onClick={()=>void continueLocalAgent(index,false)}>{ar ? "رفض الإجراءات" : "Deny actions"}</button></div></div>}
            {message.taskId && !(message.attachment && (message.documentData || message.spreadsheetData || message.presentationData || message.sourceData || message.appData)) && <button type="button" className="button button-quiet button-small" onClick={()=>setLocation("/history/"+message.taskId+"?focus=task-plan")} style={{display:"inline-flex",alignItems:"center",gap:8}}><BriefcaseBusiness size={14}/>{ar ? "فتح المهمة في سجل المهام" : "Open task in Task History"}</button>}
            {message.attachment && (message.documentData || message.spreadsheetData || message.presentationData || message.sourceData || message.appData) && <div className="artifact-actions" style={{display:"flex",gap:8,flexWrap:"wrap",width:"100%"}}>
              <button type="button" className="button button-primary button-small" onClick={()=>setPreviewingDocument(previewingDocument===index?null:index)} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,flex:"1 1 130px"}}><Search size={15}/>{previewingDocument===index?(ar?"إغلاق المعاينة":"Close preview"):(ar?"معاينة الملف":"Preview file")}</button>
              <button type="button" className="button button-primary button-small" onClick={()=>{void downloadFileFromUrl(message.attachment!.url, message.attachment!.name);}} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,flex:"1 1 130px"}}><FileText size={15}/>{message.appData?(ar?"تحميل / فتح التطبيق":"Download / open app"):message.spreadsheetData?(ar?"تحميل ملف Excel":"Download Excel"):message.presentationData?(ar?"تحميل PowerPoint":"Download PowerPoint"):message.sourceData?(ar?"تحميل ملف الكود":"Download source file"):(ar?"تحميل ملف Word":"Download Word")} ({message.attachment.name.split(".").pop()})</button>
              {message.documentData && <button type="button" className="button button-quiet button-small" data-testid="download-word-pdf" onClick={()=>{void downloadWordAsPdf(message.documentData!, message.attachment!.name);}} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,flex:"1 1 130px"}}><FileText size={15}/>{ar?"تحميل PDF (يظهر الجدول كاملًا)":"Download PDF (full-width table)"}</button>}
              {message.appData && <button type="button" className="button button-quiet button-small" onClick={()=>{void navigator.clipboard.writeText(message.appData!.html).then(()=>{setCopiedIndex(index);window.setTimeout(()=>setCopiedIndex((current)=>current===index?null:current),1800);}).catch(()=>setError(ar?"تعذر نسخ كود HTML.":"Could not copy HTML source."));}} style={{display:"inline-flex",alignItems:"center",gap:8}}><Copy size={15}/>{copiedIndex===index?(ar?"تم نسخ الكود":"Code copied"):(ar?"نسخ الكود":"Copy code")}</button>}
              {message.documentData && <button type="button" className="button button-quiet button-small" onClick={()=>void copyArtifactText(getWordCopyText(message.documentData!),index,ar?"تعذر نسخ محتوى Word.":"Could not copy Word content.")} style={{display:"inline-flex",alignItems:"center",gap:8}}><Copy size={15}/>{copiedIndex===index?(ar?"تم النسخ":"Copied"):(ar?"نسخ النص والجدول":"Copy text & table")}</button>}
              {message.spreadsheetData && <button type="button" className="button button-quiet button-small" onClick={()=>void copyArtifactText(getSpreadsheetCopyText(message.spreadsheetData!),index,ar?"تعذر نسخ بيانات Excel.":"Could not copy Excel data.")} style={{display:"inline-flex",alignItems:"center",gap:8}}><Copy size={15}/>{copiedIndex===index?(ar?"تم النسخ":"Copied"):(ar?"نسخ بيانات الجداول":"Copy sheet data")}</button>}
              {message.presentationData && <button type="button" className="button button-quiet button-small" onClick={()=>void copyArtifactText(getPresentationCopyText(message.presentationData!),index,ar?"تعذر نسخ محتوى العرض.":"Could not copy presentation content.")} style={{display:"inline-flex",alignItems:"center",gap:8}}><Copy size={15}/>{copiedIndex===index?(ar?"تم النسخ":"Copied"):(ar?"نسخ محتوى الشرائح":"Copy slide content")}</button>}
              {message.sourceData && <button type="button" className="button button-quiet button-small" onClick={()=>{void navigator.clipboard.writeText(message.sourceData!.code).then(()=>{setCopiedIndex(index);window.setTimeout(()=>setCopiedIndex((current)=>current===index?null:current),1800);}).catch(()=>setError(ar?"تعذر نسخ الكود.":"Could not copy source code."));}} style={{display:"inline-flex",alignItems:"center",gap:8}}><Copy size={15}/>{copiedIndex===index?(ar?"تم نسخ الكود":"Code copied"):(ar?"نسخ الكود":"Copy code")}</button>}
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && <button type="button" className="button button-quiet button-small" onClick={()=>void shareAttachment(message.attachment!, message.appData?.title || message.presentationData?.title || message.sourceData?.title || message.documentData?.title || message.spreadsheetData?.title || message.attachment!.name)} style={{display:"inline-flex",alignItems:"center",gap:8}}><Share2 size={15}/>{ar?"مشاركة الملف":"Share file"}</button>}
              {message.taskId && <button type="button" className="button button-quiet button-small" onClick={()=>setLocation("/history/"+message.taskId+"?focus=task-plan")} style={{display:"inline-flex",alignItems:"center",gap:8}}><BriefcaseBusiness size={14}/>{ar ? "فتح المهمة في سجل المهام" : "Open task in Task History"}</button>}
            </div>}
            {message.appData && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#fff"}}><div style={{padding:"9px 12px",color:"var(--omda-accent,#b79aef)",background:"#11151b",fontSize:12}}>{message.appData.title}</div><SandboxedPreview html={withPreviewCsp(message.appData.html)} title={message.appData.title} style={{display:"block",width:"100%",height:"min(65vh, 620px)",minHeight:360,border:0,background:"#fff"}} /></div>}{message.appData && <small style={{display:"block",width:"100%",color:"var(--muted,#9aa3af)",fontSize:12}}>{ar?"على iPhone: اضغط تحميل ثم اختر «حفظ في الملفات» من قائمة المشاركة.":"On iPhone: tap Download, then choose Save to Files from the share sheet."}</small>}
            {message.presentationData && previewingDocument===index && <div style={{display:"grid",gap:12,width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,padding:12,background:"var(--surface,#10151b)"}}><strong>{message.presentationData.title} · {message.presentationData.slides.length} {ar?"شرائح":"slides"}</strong>{message.presentationData.slides.map((slide,i)=><section key={i} style={{border:"1px solid var(--border,#59616c)",borderRadius:10,padding:14,background:"linear-gradient(145deg,#182334,#101722)",color:"#f1f5f9",minHeight:130}}><small style={{color:"var(--omda-accent,#b79aef)"}}>{ar?"شريحة":"Slide"} {i+1}</small><h3 style={{fontSize:17,margin:"8px 0 10px",color:"#f8fafc"}}>{slide.title}</h3><ul style={{margin:0,paddingInlineStart:20,lineHeight:1.65}}>{slide.bullets.map((bullet,j)=><li key={j}>{bullet}</li>)}</ul>{slide.notes && <details style={{marginTop:10,color:"var(--omda-accent,#b79aef)"}}><summary>{ar?"ملاحظات المتحدث":"Speaker notes"}</summary><p style={{whiteSpace:"pre-wrap",color:"#f1f5f9"}}>{slide.notes}</p></details>}</section>)}</div>}
            {message.sourceData && message.sourceData.language==="svg" && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#fff"}}><div style={{padding:"9px 12px",color:"var(--omda-accent,#b79aef)",background:"#11151b",fontSize:12}}>{ar?"معاينة الرسم الهندسي SVG":"SVG drawing preview"}</div><iframe title={message.sourceData.name} srcDoc={withPreviewCsp(message.sourceData.code)} sandbox="" referrerPolicy="no-referrer" style={{display:"block",width:"100%",height:"min(65vh, 620px)",minHeight:320,border:0,background:"#fff"}} /></div>}
            {message.sourceData && message.sourceData.language==="dxf" && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#fff"}}><div style={{padding:"9px 12px",color:"var(--omda-accent,#b79aef)",background:"#11151b",fontSize:12}}>{ar?"معاينة رسم DXF (الكيانات المدعومة)":"DXF drawing preview (supported entities)"}</div><iframe title={message.sourceData.name} srcDoc={withPreviewCsp(dxfToSvg(message.sourceData.code))} sandbox="" referrerPolicy="no-referrer" style={{display:"block",width:"100%",height:"min(65vh, 620px)",minHeight:320,border:0,background:"#fff"}} /></div>}
            {message.sourceData && message.sourceData.language==="html" && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#fff"}}><div style={{padding:"9px 12px",color:"var(--omda-accent,#b79aef)",background:"#11151b",fontSize:12}}>{ar?"معاينة HTML آمنة":"Sandboxed HTML preview"}</div><SandboxedPreview html={withPreviewCsp(message.sourceData.code)} title={message.sourceData.name} style={{display:"block",width:"100%",height:"min(65vh, 620px)",minHeight:320,border:0,background:"#fff"}} /></div>}
            {message.sourceData && !["html","svg","dxf"].includes(message.sourceData.language) && previewingDocument===index && <div style={{width:"100%",border:"1px solid var(--border,#343a44)",borderRadius:10,overflow:"hidden",background:"#11151b"}}><div style={{padding:"9px 12px",color:"var(--omda-accent,#b79aef)",fontSize:12,borderBottom:"1px solid #343a44"}}>{message.sourceData.name} · {message.sourceData.language}</div><pre dir="ltr" style={{margin:0,padding:14,overflowX:"auto",maxHeight:"65vh",color:"#e8edf4",fontSize:13,lineHeight:1.65,whiteSpace:"pre"}}><code>{message.sourceData.code}</code></pre></div>}
            {message.spreadsheetData && previewingDocument===index && <div style={{display:"grid",gap:14,width:"100%",minWidth:0}}>
              <strong style={{display:"block"}}>{message.spreadsheetData.title}</strong>
              {(message.spreadsheetData.sheets?.length ? message.spreadsheetData.sheets : [{name:"Sheet1",columns:message.spreadsheetData.columns,rows:message.spreadsheetData.rows,formulas:message.spreadsheetData.formulas}]).map((sheet,sheetIndex)=><section key={sheet.name || sheetIndex} style={{minWidth:0,overflowX:"auto",border:"1px solid var(--border,#343a44)",borderRadius:10,padding:10,background:"var(--surface,#10151b)"}}>
                <strong style={{display:"block",marginBottom:10}}>{sheet.name || (ar?"ورقة":"Sheet")} · {sheet.rows.length} {ar?"صفوف":"rows"}</strong>
                <table dir={ar?"rtl":"ltr"} style={{width:"100%",borderCollapse:"collapse",tableLayout:"auto"}}><thead><tr>{sheet.columns.map((column,i)=><th key={i} style={{border:"1px solid var(--border,#59616c)",padding:"8px 10px",background:"rgba(183,154,239,.13)",textAlign:"start",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.6,verticalAlign:"top"}}>{column}</th>)}</tr></thead>
                  <tbody>{sheet.rows.map((row,rowIndex)=><tr key={rowIndex}>{sheet.columns.map((_,columnIndex)=><td key={columnIndex} style={{border:"1px solid var(--border,#59616c)",padding:"8px 10px",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.7,verticalAlign:"top"}}>{sheet.formulas?.[excelColumnName(columnIndex)+(rowIndex+2)] ? <span title={"="+sheet.formulas[excelColumnName(columnIndex)+(rowIndex+2)]} style={{fontFamily:"monospace",color:"var(--omda-accent,#b79aef)"}}>{"="+sheet.formulas[excelColumnName(columnIndex)+(rowIndex+2)]}</span> : (row[columnIndex] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </section>)}
              {Object.keys(message.spreadsheetData.formulas || {}).length>0 || message.spreadsheetData.sheets?.some(sheet=>Object.keys(sheet.formulas || {}).length>0) ? <small style={{color:"var(--muted,#9aa3af)"}}>{ar?"الصيغ محفوظة داخل Excel وسيعيد البرنامج حسابها عند فتح المصنف.":"Formulas are stored in Excel and will recalculate when the workbook is opened."}</small> : null}
            </div>}
            {message.documentData && previewingDocument===index && <div style={{width:"100%",overflowX:"auto",border:"1px solid var(--border,#343a44)",borderRadius:10,padding:10,background:"var(--surface,#10151b)"}}><strong style={{display:"block",marginBottom:10}}>{message.documentData.title}</strong>{message.documentData.paragraphs.map((paragraph,i)=>{const heading=paragraph.match(/^(#{1,3})\s+(.+)$/);const bullet=paragraph.match(/^[-*]\s+(.+)$/);return heading?<h2 key={i} style={{margin:"16px 0 8px",fontSize:heading[1].length===1?20:heading[1].length===2?18:16,fontWeight:700}}>{heading[2]}</h2>:bullet?<p key={i} style={{margin:"6px 0",paddingInlineStart:18,lineHeight:1.8,whiteSpace:"pre-wrap"}}>• {bullet[1]}</p>:<p key={i} style={{margin:"8px 0",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{paragraph}</p>})}{message.documentData.columns.length>0 && <table dir={ar?"rtl":"ltr"} style={{width:"100%",borderCollapse:"collapse",tableLayout:"auto"}}><thead><tr>{message.documentData.columns.map((column,i)=><th key={i} style={{border:"1px solid var(--border,#59616c)",padding:"8px 10px",background:"rgba(183,154,239,.13)",textAlign:"start",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.6,verticalAlign:"top"}}>{column}</th>)}</tr></thead><tbody>{message.documentData.rows.map((row,i)=><tr key={i}>{message.documentData!.columns.map((_,j)=><td key={j} style={{border:"1px solid var(--border,#59616c)",padding:"8px 10px",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.7,verticalAlign:"top"}}>{row[j]||" "}</td>)}</tr>)}</tbody></table>}</div>}
            {message.role === "assistant" && <div className="ai-message-actions" aria-label={ar ? "إجراءات الرد" : "Message actions"}>
              <button type="button" className="ai-message-action" onClick={()=>speak(message.content,index)} aria-label={speaking && speakingIndex===index ? (ar ? "إيقاف الاستماع" : "Stop listening") : (ar ? "استمع للرد" : "Listen to answer")} title={speaking && speakingIndex===index ? (ar ? "إيقاف الصوت" : "Stop audio") : (ar ? "استمع" : "Listen")}>{speaking && speakingIndex===index ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
              <button type="button" className="ai-message-action" onClick={()=>void copyAnswer(message.content,index)} aria-label={copy.copy} title={copiedIndex===index ? copy.copied : copy.copy}>{copiedIndex===index ? <span className="ai-message-action-check">✓</span> : <Copy size={15}/>}</button>
            </div>}
          </div>)}
          {loading && <div className="chat-message assistant"><strong>مُنجِزلي | Munjizly</strong><p className="ai-chat-thinking"><ZahinOrb state="thinking" /><span>{copy.loading}</span></p></div>}
        </div>
        {error && <div className="notice-bar notice-error" role="alert" style={{marginBottom:12}}>{error}</div>}
        {usage?.remaining === 0 && <div className="notice-bar" style={{marginBottom:12}}>{copy.exhausted}</div>}

        <div className="panel ai-agent-runtime-panel" data-agent-active={agentMode ? "true" : "false"} style={{padding:12,marginBottom:10,borderColor:agentMode?"rgba(146,108,198,.65)":undefined}}><div className="ai-agent-runtime-summary"><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><strong>{ar ? "وضع الوكيل المحلي" : "Local Agent mode"}</strong><small className="muted" style={{display:"block",marginTop:3}}>{ar ? "قراءة ملفات المشروع وتعديلها وتشغيل أوامر بعد موافقتك." : "Inspect project files, edit them and run commands with your approval."}</small></div><button type="button" className={"button button-small " + (agentMode?"button-primary":"button-quiet")} onClick={()=>{if(!signedIn){setError(copy.login);return;}setAgentMode((value)=>!value);}} disabled={!signedIn} title={!signedIn?(ar?"سجّل الدخول أولاً":"Sign in first"):undefined}>{agentMode?(ar?"مفعّل":"Enabled"):(ar?"تفعيل Agent":"Enable Agent")}</button></div></div>{agentMode && <div style={{display:"grid",gap:8,marginTop:10}}><input className="field" value={agentRuntimeUrl} onChange={(event)=>setAgentRuntimeUrl(event.target.value)} placeholder="http://127.0.0.1:4318" aria-label={ar?"عنوان الوكيل المحلي":"Local runtime URL"}/><input className="field" type="password" autoComplete="off" value={agentToken} onChange={(event)=>setAgentToken(event.target.value)} placeholder={ar?"رمز الاتصال المحلي (32 حرفًا على الأقل)":"Local access token (at least 32 characters)"} aria-label={ar?"رمز الاتصال":"Access token"}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><small className="muted">{agentSessionId ? (ar?"جلسة محفوظة: ":"Saved session: ")+agentSessionId.slice(0,12) : (ar?"لا توجد جلسة Agent محفوظة بعد.":"No saved Agent session yet.")}</small><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" className="button button-quiet button-small" onClick={()=>void checkLocalAgentConnection()}>{ar?"اختبار الاتصال":"Test connection"}</button><button type="button" className="button button-quiet button-small" onClick={()=>void loadAgentSessions()}>{ar?"الجلسات المحفوظة":"Saved sessions"}</button><button type="button" className="button button-quiet button-small" onClick={()=>{setAgentSessionId("");try{window.localStorage.removeItem("omda-agent-session");}catch{}}}>{ar?"جلسة جديدة":"New agent session"}</button></div></div>{agentConnectionStatus && <small className="muted">{agentConnectionStatus}</small>}{agentSessions.length>0 && <select className="field" value={agentSessionId} onChange={(event)=>{setAgentSessionId(event.target.value);try{window.localStorage.setItem("omda-agent-session",event.target.value);}catch{}}}><option value="">{ar?"اختر جلسة محفوظة":"Select a saved session"}</option>{agentSessions.map((session)=><option key={session.id} value={session.id}>{session.pending?"● ":""}{session.lastMessage || session.id} · {session.id.slice(0,8)}</option>)}</select>}<small className="muted">{ar?"يعمل الوكيل على الكمبيوتر الذي يشغّل Runtime فقط. من الهاتف لن يصل إلى ملفات الكمبيوتر إلا عبر ربط آمن منفصل. الرمز يبقى في ذاكرة الصفحة ولا يُحفظ بالحساب.":"The agent runs on the computer hosting the runtime. A phone cannot access that computer's files without a separate secure bridge. The token stays in page memory and is not saved to your account."}</small></div>}</div>
        <form onSubmit={sendMessage} className="ai-composer ai-chat-composer">
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
          <input ref={fileInputRef} type="file" accept=".docx,.xlsx,.pptx,.txt,.md,.csv,.json,.xml,.html,.htm" hidden onChange={async(event)=>{
            const file=event.currentTarget.files?.[0];
            event.currentTarget.value="";
            if(!file)return;
            if(file.size<=0||file.size>25*1024*1024){setError(ar?"حجم الملف يجب أن يكون أقل من 25 ميجابايت.":"File must be smaller than 25 MB.");return;}
            const extension=file.name.split(".").pop()?.toLowerCase()||"";
            const office=["docx","xlsx","pptx"].includes(extension);
            const textTypes=["txt","md","csv","json","xml","html","htm"];
            if(!office&&!textTypes.includes(extension)){setError(ar?"صيغة الملف غير مدعومة. استخدم Word أو Excel أو PowerPoint أو ملفًا نصيًا.":"Unsupported file type. Use Word, Excel, PowerPoint, or a text file.");return;}
            try{
              const extracted=office?await previewOfficeDocument(file,extension):await file.text();
              const normalized=extracted.replace(/\u0000/g,"").slice(0,40000);
              if(!normalized.trim())throw new Error(ar?"لم أستطع استخراج محتوى قابل للقراءة من الملف.":"No readable text could be extracted from this file.");
              setPendingFile({name:file.name,text:normalized});
              setError("");
            }catch(error){setError(error instanceof Error?error.message:(ar?"تعذر قراءة الملف.":"Could not read the file."));}
          }}/>
          {pendingFile&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"1px solid var(--border,#343a44)",borderRadius:10,marginBottom:8}}>
            <FileText size={22}/>
            <span style={{fontSize:12,overflowWrap:"anywhere",flex:1}}>{pendingFile.name}<small style={{display:"block",opacity:.65}}>{ar?"تم استخراج النص لإرساله مع طلبك":"Text extracted and ready to send"}</small></span>
            <button type="button" className="icon-button" onClick={()=>setPendingFile(null)} aria-label={ar?"إزالة الملف":"Remove file"}><X size={15}/></button>
          </div>}
          <div className="ai-composer-tools">
            <button type="button" className="ai-attach-image-button" aria-label={ar ? "إرفاق صورة" : "Attach image"} title={ar ? "إرفاق صورة" : "Attach image"} onClick={()=>imageInputRef.current?.click()} disabled={loading || historyLoading || !signedIn}><ImagePlus size={18}/></button>
            <div ref={plusWrapRef} className="ai-plus-wrap">
              <button type="button" className="ai-plus-button" aria-label={ar ? "إضافة أو اختيار أداة" : "Add or choose a tool"} aria-expanded={showPlusMenu} onClick={()=>{setShowChatMenu(false);setShowPlusMenu((v)=>!v)}}><Plus size={20}/></button>
              {showPlusMenu && <div className="ai-plus-menu" role="menu">
                <button type="button" className="ai-plus-option" onClick={()=>{setShowPlusMenu(false);fileInputRef.current?.click();}}><FileText size={16}/><span>{ar ? "إرفاق مستند أو جدول أو عرض" : "Attach a document or spreadsheet"}</span></button>
                <div className="ai-chat-menu-caption">{ar ? "برامج الأوفيس الكاملة" : "Office tools"}</div>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("word")}><FileText size={16}/><span>{ar ? "مستند Word (مع زر تحميل)" : "Word document"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("excel")}><Sheet size={16}/><span>{ar ? "جدول Excel (مع زر تحميل)" : "Excel workbook"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>activateMode("ppt")}><Presentation size={16}/><span>{ar ? "عرض PowerPoint (مع زر تحميل)" : "PowerPoint presentation"}</span></button>
                <div className="ai-chat-menu-divider"/>
                <button type="button" className="ai-plus-option" onClick={()=>{setShowPlusMenu(false);openCodeCanvas();}}><Code2 size={16}/><span>{ar ? "محرر ومعاين الأكواد (Canvas)" : "Code editor & preview"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>{setShowPlusMenu(false);void sendMessage(undefined, ar ? "حلل البيانات التالية، ونظمها في جدول واضح مع أهم المؤشرات: " : "Analyze the following data: ");}}><Sheet size={16}/><span>{ar ? "تحليل البيانات" : "Analyze data"}</span></button>
                <button type="button" className="ai-plus-option" onClick={()=>{setShowPlusMenu(false);void sendMessage(undefined, ar ? "ساعدني في تخطيط مشروع جديد، وحدد الهدف والمراحل والمهام المطلوبة: " : "Help me plan a new project: ");}}><Bot size={16}/><span>{ar ? "تخطيط مشروع" : "Plan a project"}</span></button>
              </div>}
            </div>
            <textarea ref={inputRef} id="ai-chat-input" className="field ai-composer-input" rows={1} maxLength={8000} value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void sendMessage();}}} placeholder={copy.placeholder} disabled={loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}/> 
            <button type="button" className={"ai-chat-mic-button" + (listening ? " is-listening" : "")} aria-label={listening ? copy.stop : copy.mic} title={listening ? copy.stop : copy.mic} onClick={toggleVoiceInput} disabled={!signedIn || loading || historyLoading}><Mic size={17}/></button>
            {loading && agentRunSessionId ? <button type="button" className="ai-send-button" aria-label={ar ? "إيقاف الوكيل" : "Stop Agent"} title={ar ? "إيقاف الوكيل" : "Stop Agent"} onClick={()=>void cancelLocalAgent()} disabled={agentCancelling}>{agentCancelling ? <LoaderCircle size={18} className="animate-spin"/> : <Square size={16}/>}</button> : input.trim() || pendingImage || pendingFile ? <button type="submit" className="ai-send-button" aria-label={copy.send} disabled={loading || historyLoading || !signedIn || (!agentMode && usage?.remaining === 0)}>{loading ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button> : <button type="button" className="ai-voice-button" aria-label={ar ? "محادثة صوتية مباشرة" : "Live voice conversation"} aria-expanded={showLiveVoice} onClick={openLiveVoice} disabled={!signedIn || loading || historyLoading || usage?.remaining === 0}><Headphones size={18}/></button>}
          </div>

          {(voiceStarting||listening||voiceFallback)&&<div className="ai-dictation-status" role="status" aria-live="polite">{voiceStarting?(ar?'جارٍ بدء خدمة الإملاء…':'Starting dictation…'):listening?(ar?'الميكروفون مفتوح للإملاء، تكلّم الآن. اضغطه للإيقاف.':'Dictation microphone is open. Speak now. Tap it to stop.'):error||copy.voiceUnsupported}{voiceFallback&&<button type="button" className="button button-quiet button-small" onClick={()=>inputRef.current?.focus()}>{copy.keyboardDictation}</button>}</div>}
          <div className="ai-composer-footer">
            <div>{speaking && <button type="button" className="button button-quiet button-small" onClick={()=>{window.speechSynthesis.cancel();setSpeaking(false);}}><VolumeX size={14}/>{ar ? "إيقاف الصوت" : "Stop voice"}</button>}</div>
            <small className="muted">{usage ? (ar ? `متبقي ${usage.remaining} من ${usage.limit} وحدة` : `${usage.remaining} of ${usage.limit} units left`) : copy.subtitle}</small>
          </div>
        </form>
      </section>
    </>}
      {showSettingsModal && <div className="ai-chat-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowSettingsModal(false);}}>
        <section className="ai-chat-settings-modal" role="dialog" aria-modal="true" aria-label={ar ? "إعدادات Munjizly" : "Munjizly settings"}>
          <header><strong><Settings2 size={16}/>{ar ? "إعدادات Munjizly" : "Munjizly settings"}</strong><button type="button" onClick={()=>setShowSettingsModal(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></header>
          <div className="ai-chat-settings-body">
            <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{ar ? "استهلاك الرصيد اليومي" : "Daily allowance"}</strong><span>{usage ? usage.remaining + " / " + usage.limit : "—"}</span></div>
              <div className="ai-chat-settings-stats"><div><small>{ar ? "المتبقي اليوم" : "Remaining"}</small><strong>{usage?.remaining ?? "—"}</strong></div><div><small>{ar ? "المستخدم" : "Used"}</small><strong>{usage?.used ?? "—"}</strong></div><div><small>{ar ? "الحد اليومي" : "Daily limit"}</small><strong>{usage?.limit ?? "—"}</strong></div></div>
              <div className="ai-chat-settings-progress"><i style={{width:percent + "%"}}/></div>
              {usage?.resetAt && <small className="muted">{copy.reset} {new Date(usage.resetAt).toLocaleTimeString(ar ? "ar-EG" : "en-US",{hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"})}</small>}
            </section>
            <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{copy.providers}</strong><span>Gemini · Groq · OpenRouter · Cloudflare</span></div>
              <div className="ai-chat-provider-row"><Sparkles size={15}/><span><strong>Gemini</strong><small>{usage?.providers?.gemini ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>OpenRouter Free Models</strong><small>{usage?.providers?.openrouter ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>Groq</strong><small>{usage?.providers?.groq ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <div className="ai-chat-provider-row"><Bot size={15}/><span><strong>Cloudflare Workers AI</strong><small>{usage?.providers?.cloudflare ? (ar ? "مهيأ" : "Configured") : (ar ? "غير مهيأ" : "Not configured")}</small></span></div>
              <small className="muted">{copy.voiceNote}</small>
            </section>
             <section className="ai-chat-settings-section"><div className="ai-chat-settings-section-title"><strong>{ar ? "ذاكرة Munjizly الخاصة بك" : "Your Munjizly memory"}</strong><span>{memory.length}/6000</span></div>
               <p>{ar ? "اكتب تفضيلاتك ومشاريعك وقراراتك المهمة. الذاكرة محفوظة في حسابك." : "Save preferences, projects, and important decisions to your account memory."}</p>
               <textarea className="field ai-chat-memory-field" rows={4} maxLength={6000} value={memory} onChange={(event)=>setMemory(event.target.value)} disabled={memoryLoading || memorySaving} placeholder={ar ? "اكتب هنا ما تريد أن يتذكره Munjizly..." : "What should Munjizly remember?"}/>
               <div className="ai-chat-settings-actions"><small>{memoryLoading ? (ar ? "جارٍ التحميل..." : "Loading...") : memorySaving ? (ar ? "جارٍ الحفظ..." : "Saving...") : ""}</small><button type="button" className="button button-quiet button-small" onClick={()=>void clearMemory()} disabled={memoryLoading || memorySaving || memoryGraphLoading || memoryGraphEdgeSaving || (!memory.trim() && memoryGraphNodes.length === 0 && !memoryGraphLoadError)}>{ar ? "حذف الذاكرة" : "Delete memory"}</button><button type="button" className="button button-primary button-small" onClick={()=>void saveMemory()} disabled={memoryLoading || memorySaving}>{ar ? "حفظ الذاكرة" : "Save memory"}</button></div>
             </section>
             <section className="ai-chat-settings-section">
               <div className="ai-chat-settings-section-title"><strong>{ar ? "الحقائق والتفضيلات المؤكدة" : "Confirmed memory graph"}</strong><span>{memoryGraphNodes.length} {ar ? "حقيقة" : "facts"} · {memoryGraphEdges.length} {ar ? "علاقة" : "relations"}</span></div>
               <p>{ar ? "يضيف Munjizly هنا فقط ما تطلب صراحةً حفظه أو تصحيحاتك الواضحة. تُرفض كلمات المرور وبيانات الاتصال والمعلومات الشخصية الحساسة." : "Only facts you explicitly ask Munjizly to remember or supported corrections are stored here. Passwords, contact details, and sensitive personal information are rejected."}</p>
               {memoryGraphLoadError && <div className="notice-bar" role="alert" style={{marginBottom:10}}><span>{memoryGraphLoadError}</span><button type="button" className="button button-quiet button-small" onClick={()=>void loadMemoryGraph()} disabled={memoryLoading || memoryGraphLoading || memorySaving}>{memoryGraphLoading ? (ar ? "جارٍ التحميل..." : "Loading...") : (ar ? "إعادة المحاولة" : "Retry")}</button></div>}
               {memoryLoading ? <small className="muted">{ar ? "جارٍ تحميل سجل الذاكرة..." : "Loading confirmed memory..."}</small> : memoryGraphLoadError ? <small className="muted">{ar ? "لم يتم تحميل السجل؛ البيانات السابقة لم تُعتبر فارغة." : "The graph was not loaded; previous data has not been treated as empty."}</small> : memoryGraphNodes.length ? <div style={{display:"grid",gap:8}}>
                 {memoryGraphNodes.slice(0,30).map((node)=><div key={node.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",border:"1px solid var(--border)",borderRadius:10}}>
                   <span className="status-chip">{node.node_type}</span><div style={{minWidth:0,flex:1}}><strong style={{fontSize:13,overflowWrap:"anywhere"}}>{node.label}</strong><small className="muted" style={{display:"block",marginTop:2}}>{node.source === "conversation_confirmed" ? (ar ? "تصحيح مؤكد" : "Confirmed correction") : (ar ? "حفظ صريح" : "Explicitly saved")}</small></div>
                 </div>)}
                 {memoryGraphEdges.length > 0 && <div style={{marginTop:4,paddingTop:8,borderTop:"1px solid var(--border)"}}><strong style={{fontSize:12}}>{ar ? "العلاقات" : "Relationships"}</strong>{memoryGraphEdges.slice(0,12).map((edge)=>{const from=memoryGraphNodes.find((node)=>node.id===edge.source_node_id)?.label;const to=memoryGraphNodes.find((node)=>node.id===edge.target_node_id)?.label;return from&&to?<p key={edge.id} className="muted" style={{fontSize:12,margin:"6px 0"}}>{from} — {edge.relation} → {to}</p>:null;})}</div>}
                  {memoryGraphNodes.length >= 2 && <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)",display:"grid",gap:8}}>
                    <strong style={{fontSize:12}}>{ar ? "إضافة علاقة بين حقيقتين" : "Connect two facts"}</strong>
                    <select className="field" aria-label={ar ? "الحقيقة الأولى" : "First fact"} value={memoryGraphEdgeSource} onChange={(event)=>setMemoryGraphEdgeSource(event.target.value)}>
                      <option value="">{ar ? "اختر الحقيقة الأولى" : "Choose first fact"}</option>
                      {memoryGraphNodes.map((node)=><option key={node.id} value={node.id}>{node.label}</option>)}
                    </select>
                    <select className="field" aria-label={ar ? "نوع العلاقة" : "Relationship type"} value={memoryGraphEdgeRelation} onChange={(event)=>setMemoryGraphEdgeRelation(event.target.value)}>
                      <option value="related_to">{ar ? "مرتبط بـ" : "Related to"}</option>
                      <option value="works_on">{ar ? "يعمل على" : "Works on"}</option>
                      <option value="uses">{ar ? "يستخدم" : "Uses"}</option>
                      <option value="owns">{ar ? "يمتلك" : "Owns"}</option>
                      <option value="prefers">{ar ? "يفضل" : "Prefers"}</option>
                      <option value="decided">{ar ? "قرر" : "Decided"}</option>
                      <option value="constrained_by">{ar ? "مقيد بـ" : "Constrained by"}</option>
                      <option value="corrected">{ar ? "صحح" : "Corrected"}</option>
                      <option value="member_of">{ar ? "عضو في" : "Member of"}</option>
                      <option value="created">{ar ? "أنشأ" : "Created"}</option>
                    </select>
                    <select className="field" aria-label={ar ? "الحقيقة الثانية" : "Second fact"} value={memoryGraphEdgeTarget} onChange={(event)=>setMemoryGraphEdgeTarget(event.target.value)}>
                      <option value="">{ar ? "اختر الحقيقة الثانية" : "Choose second fact"}</option>
                      {memoryGraphNodes.map((node)=><option key={node.id} value={node.id} disabled={node.id===memoryGraphEdgeSource}>{node.label}</option>)}
                    </select>
                    {memoryGraphActionError && <div className="notice-bar" role="alert"><span>{memoryGraphActionError}</span></div>}
                    <button type="button" className="button button-quiet button-small" onClick={()=>void addMemoryGraphEdge()} disabled={memoryGraphEdgeSaving || memoryGraphLoading || memorySaving || !memoryGraphEdgeSource || !memoryGraphEdgeTarget || memoryGraphEdgeSource===memoryGraphEdgeTarget}>
                      {memoryGraphEdgeSaving ? (ar ? "جارٍ حفظ العلاقة..." : "Saving relationship...") : (ar ? "إضافة العلاقة" : "Add relationship")}
                    </button>
                  </div>}
               </div> : memoryGraphLoadError ? null : <small className="muted">{ar ? "لا توجد حقائق مؤكدة محفوظة بعد. قل لمُنجِزلي: «احفظ أنني أفضل الرد بالعربية» لإضافة تفضيل." : "No confirmed facts yet. Tell Munjizly “Remember that I prefer concise replies” to add a preference."}</small>}
             </section>
<section className="ai-chat-settings-section ai-chat-agent-setting"><div><strong>{ar ? "وضع الوكيل المحلي" : "Local Agent mode"}</strong><p>{ar ? "قراءة ملفات المشروع وتعديلها وتشغيل أوامر بعد موافقتك. يحتاج Runtime يعمل على جهازك." : "Inspect project files and run commands with your approval. Requires a local runtime."}</p></div><button type="button" role="switch" aria-checked={agentMode} className={"ai-chat-switch" + (agentMode ? " on" : "")} onClick={()=>{if(!signedIn){setError(copy.login);return;}setAgentMode(v=>!v);}} disabled={!signedIn}><i/></button></section>
          </div>
          <footer>{error && <p className={"ai-chat-settings-feedback" + (/تعذر|فشل|خطأ|error|failed|could not/i.test(error) ? " is-error" : "")} role="status">{error}</p>}<button type="button" className="button button-primary" onClick={()=>{void saveMemory().then(saved=>{if(saved)setShowSettingsModal(false);});}} disabled={memorySaving || memoryLoading}>{memorySaving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إغلاق وحفظ الكل" : "Save & close")}</button></footer>
        </section>
      </div>}
      {showLiveVoice && <div className="ai-chat-modal-backdrop ai-chat-live-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowLiveVoice(false);}}>
        <section className="ai-chat-live-modal" role="dialog" aria-modal="true" aria-label={ar ? "المحادثة الصوتية المباشرة" : "Live voice conversation"}>
          <header><span><i/> {ar ? "التحدث الصوتي مع Munjizly" : "Talk with Munjizly"}</span><button type="button" onClick={()=>setShowLiveVoice(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></header>
          <Suspense fallback={<p role="status">{ar?"جارٍ تحميل المحادثة الصوتية…":"Loading live voice…"}</p>}><GeminiLiveVoice initialAudioContext={liveAudioUnlockRef.current} language={language} disabled={loading || historyLoading || usage?.remaining === 0} onTranscript={handleLiveTranscript}/></Suspense>
          <button type="button" className="ai-chat-live-end" onClick={()=>setShowLiveVoice(false)} aria-label={ar ? "إنهاء المحادثة الصوتية وإغلاق النافذة" : "End voice conversation and close"}><X size={15}/>{ar ? "إنهاء المحادثة الصوتية" : "End voice conversation"}</button>
        </section>
      </div>}
      {showCodeCanvas && <div className="ai-chat-modal-backdrop ai-chat-canvas-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowCodeCanvas(false);}}>
        <section className="ai-chat-canvas-modal" role="dialog" aria-modal="true" aria-label={ar ? "محرر الأكواد" : "Code Canvas"}>
          <header><strong><Code2 size={16}/>Code Canvas - {ar ? "محرر ومعاين الأكواد" : "Code editor & preview"}</strong><div><button type="button" className="button button-primary button-small" onClick={runCanvasCode}><Play size={13}/>{ar ? "تشغيل ومعاينة" : "Run preview"}</button><button type="button" onClick={()=>setShowCodeCanvas(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={17}/></button></div></header>
          <div className="ai-chat-canvas-workspace"><textarea dir="ltr" spellCheck={false} value={canvasCode} onChange={(event)=>setCanvasCode(event.target.value)} aria-label={ar ? "محرر الكود" : "Code editor"}/><div className="ai-chat-canvas-preview"><div>{ar ? "المعاينة" : "Preview"}</div>{canvasPreviewCode ? <SandboxedPreview html={withPreviewCsp(canvasPreviewCode)} title="Code Canvas preview"/> : <p>{ar ? "اكتب الكود ثم اضغط تشغيل ومعاينة." : "Write code and select Run preview."}</p>}</div></div>
        </section>
      </div>}
    </div>
  </div>;
}
