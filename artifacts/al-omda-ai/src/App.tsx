import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import AIChatPage from './AIChat';
import CollaborationWorkspace from './CollaborationWorkspace';
import AuditLogWorkspace from './AuditLogWorkspace';
import SalesAnalyticsWorkspace from './SalesAnalyticsWorkspace';
import WorkspaceAssets from './WorkspaceAssets';
import SeoAuditWorkspace from './SeoAuditWorkspace';
import { createDocxBlob, createPptxBlob, createXlsxBlob } from './lib/office-ooxml';
import { createZipBlob } from './lib/zip';
import { readAgentEventStream } from './lib/agent-stream';
import { getLocalAgentOrigin } from './lib/local-agent-url';
import { parseModelProviderHealth, parseModelProviderInfo, providerStatusLabel, type ModelProviderHealth } from './lib/model-provider-health';
import {
  createTask as apiCreateTask,
  getAuthSession,
  getAuthStatus,
  getWorkspace,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  updateProfile as apiUpdateProfile,
  updateTask as apiUpdateTask,
  uploadAvatar as apiUploadAvatar,
  type AuthUser as ApiAuthUser,
  type Task as ApiTask,
  type Workspace as ApiWorkspace,
} from '@workspace/api-client-react';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpLeft, BadgeCheck, Globe, Users, CreditCard, Contact, CalendarDays, Mail, Ticket, Scale, HardHat, Stethoscope, Calculator, Wrench, GraduationCap, Monitor, RefreshCw,
  Bot, BriefcaseBusiness, Check, CheckCheck, ChevronDown,
  Code2, Compass, Edit3, FileText, FlaskConical, History, LayoutDashboard,
  LockKeyhole, MessageSquareText, Pause, Play, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, StopCircle, UserRound, WandSparkles,
  X, Menu, Languages, Palette, Megaphone, UserRoundCog, Trash2, CircleHelp, TrendingUp, TrendingDown, Minus, Download, RotateCcw, type LucideIcon,
} from 'lucide-react';

type Language = 'ar' | 'en';
type StepState = 'pending' | 'approved' | 'rejected';
type TaskStatus = 'review' | 'paused' | 'approved' | 'stopped';
type Specialty = 'business' | 'development' | 'design' | 'marketing' | 'research' | 'assistant';
type PlanStepNote = { id:string; author:'user'|'assistant'|'system'; text:string; createdAt:string };
type PlanStep = { id: string; text: string; state: StepState; comments?:PlanStepNote[]; revisionHistory?:Array<{result:string;executedAt?:string;revisionRequestedAt:string;note:string}>; output?: string; complete?: string; result?: string; executedAt?: string; executionStatus?: "succeeded" | "failed"; executionError?: string };
type Task = { id: string; title: string; request: string; specialty: Specialty; steps: PlanStep[]; status: TaskStatus; createdAt: string; demo?: boolean };
type CommandAsset = { path:string; name:string; mimeType?:string|null; size?:number|null; projectId?:string|null };

type TaskCodeProject = { title: string; framework: string; entryPoint: string; files: Array<{ path: string; content: string }>; buildCommand: string; testCommand?: string; buildStatus: "not_run"; testStatus: "not_run" };
type TaskPresentation = { title: string; slides: Array<{ title: string; bullets: string[]; notes?: string }> };
function getTaskPresentation(result?: string): TaskPresentation | null {
  if (!result?.startsWith("ALOMDA_PPTX_JSON:")) return null;
  try {
    const value = JSON.parse(result.slice("ALOMDA_PPTX_JSON:".length));
    if (typeof value.title !== "string" || !Array.isArray(value.slides) || value.slides.length < 3 || value.slides.length > 30) return null;
    if (value.slides.some((slide: any) => !slide || typeof slide.title !== "string" || !Array.isArray(slide.bullets) || slide.bullets.length < 1 || slide.bullets.length > 8 || slide.bullets.some((bullet: unknown) => typeof bullet !== "string"))) return null;
    return value as TaskPresentation;
  } catch { return null; }
}
async function downloadTaskPowerPoint(data: TaskPresentation, projectId?: string): Promise<void> {
  const blob = createPptxBlob(data);
  await saveAndDownloadTaskArtifact(
    blob,
    safeArtifactName(data.title, "AL-OMDA-presentation") + ".pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    projectId,
  );
}

type TaskSpreadsheet = { title: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?:Record<string,string>; sheets?:Array<{name:string;columns:string[];rows:Array<Array<string|number|boolean>>;formulas?:Record<string,string>}> };
function renderTaskWorkbookPreview(data: TaskSpreadsheet, isAr: boolean): ReactNode {
  const sheets = data.sheets?.length
    ? data.sheets
    : [{ name: "Sheet1", columns: data.columns, rows: data.rows, formulas: data.formulas }];
  return <div style={{ display:"grid", gap:12 }}>
    {sheets.map((sheet,index) => <section key={sheet.name + "-" + index} style={{ minWidth:0 }}>
      {sheets.length > 1 && <strong style={{display:"block",marginBottom:7}}>{sheet.name}</strong>}
      <div style={{overflowX:"auto",maxWidth:"100%"}}>
        <table dir={isAr?"rtl":"ltr"} style={{borderCollapse:"collapse",minWidth:560,width:"100%",fontSize:12}}>
          <thead><tr>{sheet.columns.map((column,columnIndex)=><th key={columnIndex} style={{padding:8,border:"1px solid var(--border,#59616c)",background:"rgba(190,160,100,.13)",textAlign:"start"}}>{column}</th>)}</tr></thead>
          <tbody>{sheet.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={cellIndex} style={{padding:8,border:"1px solid var(--border,#59616c)"}}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>)}
  </div>;
}
function getTaskSpreadsheet(result?: string): TaskSpreadsheet | null {
  if (!result?.startsWith("ALOMDA_XLSX_JSON:")) return null;
  try {
    const value = JSON.parse(result.slice("ALOMDA_XLSX_JSON:".length));
    if (typeof value.title !== "string" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null;
    if (!value.columns.length || value.columns.length > 30 || value.rows.length > 500) return null;
    if (value.rows.some((row: unknown) => !Array.isArray(row) || row.length !== value.columns.length)) return null;
    return value as TaskSpreadsheet;
  } catch { return null; }
}
async function downloadTaskExcel(data: TaskSpreadsheet, projectId?: string): Promise<void> {
  const blob = createXlsxBlob(data);
  await saveAndDownloadTaskArtifact(
    blob,
    safeArtifactName(data.title, "AL-OMDA-workbook") + ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    projectId,
  );
}

type TaskWordDocument = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };
function getTaskWordDocument(result?: string): TaskWordDocument | null {
  if (!result?.startsWith("ALOMDA_DOCX_JSON:")) return null;
  try {
    const value = JSON.parse(result.slice("ALOMDA_DOCX_JSON:".length));
    if (typeof value.title !== "string" || !Array.isArray(value.paragraphs) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null;
    if (value.columns.length > 12 || value.rows.length > 100) return null;
    if (value.columns.length === 0 && (value.rows.length > 0 || value.paragraphs.length === 0)) return null;
    if (value.rows.some((row: unknown) => !Array.isArray(row) || row.length !== value.columns.length)) return null;
    return value as TaskWordDocument;
  } catch { return null; }
}
let cachedCodeProjectResult: string | undefined;
let cachedCodeProjectValue: TaskCodeProject | null = null;

function getTaskCodeProject(result?: string): TaskCodeProject | null {
  if (result === cachedCodeProjectResult) return cachedCodeProjectValue;
  cachedCodeProjectResult = result;
  cachedCodeProjectValue = null;
  if (!result?.startsWith("ALOMDA_CODE_PROJECT_JSON:")) return null;
  try {
    const value = JSON.parse(result.slice("ALOMDA_CODE_PROJECT_JSON:".length));
    if (typeof value.title !== "string" || typeof value.framework !== "string" ||
      typeof value.entryPoint !== "string" || !Array.isArray(value.files) ||
      value.files.length < 3 || value.files.length > 60) return null;
    const normalizedPaths = new Set<string>();
    let totalBytes = 0;
    const encoder = new TextEncoder();
    for (const file of value.files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") return null;
      const contentBytes = encoder.encode(file.content).length;
      if (contentBytes > 60000) return null;
      totalBytes += contentBytes;
      if (totalBytes > 200000) return null;
      const path = file.path.normalize("NFKC");
      if (!path || path.length > 180 || path.startsWith("/") || path.startsWith("~") ||
        path.includes("\\\\") || path.includes("\\0") ||
        !/^[\\p{L}\\p{N}._@+/-]+$/u.test(path) ||
        path.split("/").some((part: string) => !part || part === "." || part === ".." ||
          ["node_modules", ".git", "dist", "build", ".env"].includes(part.toLocaleLowerCase()) ||
          (part.toLocaleLowerCase().startsWith(".env.") && part.toLocaleLowerCase() !== ".env.example")) ||
        /\\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(path)) return null;
      const key = path.toLocaleLowerCase();
      if (normalizedPaths.has(key)) return null;
      normalizedPaths.add(key);
    }
    const normalizedEntryPoint = value.entryPoint.normalize("NFKC");
    if (!normalizedPaths.has(normalizedEntryPoint.toLocaleLowerCase()) ||
      !value.files.some((file: any) => file.path.normalize("NFKC") === normalizedEntryPoint)) return null;
    if (value.buildStatus !== "not_run" || value.testStatus !== "not_run" || typeof value.buildCommand !== "string") return null;
    cachedCodeProjectValue = value as TaskCodeProject;
    return cachedCodeProjectValue;
  } catch { return null; }
}
function getTaskHtmlApp(result?: string): string | null {
  return result?.startsWith("ALOMDA_HTML_APP:") ? result.slice("ALOMDA_HTML_APP:".length) : null;
}
function safeArtifactName(value: string, fallback: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || fallback;
}
async function persistTaskArtifact(blob: Blob, filename: string, mimeType: string, projectId?: string): Promise<void> {
  if (!projectId) return;
  const params = new URLSearchParams({ filename, projectId });
  const response = await fetch("/api/storage/assets?" + params.toString(), {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": mimeType },
    body: blob,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the generated file to project assets.");
}
function triggerArtifactDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function deliverTaskArtifact(blob: Blob, filename: string, mimeType: string): Promise<void> {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const file = new File([blob], filename, { type: mimeType });
    if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // If the iOS share sheet is unavailable, fall back to opening the file.
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  triggerArtifactDownload(blob, filename);
}
async function saveAndDownloadTaskArtifact(blob: Blob, filename: string, mimeType: string, projectId?: string): Promise<void> {
  // Invoke the browser's native file/share UI directly from the user's click before awaiting upload I/O.
  await deliverTaskArtifact(blob, filename, mimeType);
  await persistTaskArtifact(blob, filename, mimeType, projectId);
}

async function persistTaskDeliverable(result: string, projectId: string, fallbackTitle: string): Promise<boolean> {
  const codeProject = getTaskCodeProject(result);
  if (codeProject) {
    await persistTaskArtifact(createZipBlob(codeProject.files), safeArtifactName(codeProject.title || fallbackTitle, "AL-OMDA-project") + ".zip", "application/zip", projectId);
    return true;
  }
  if (result.startsWith("ALOMDA_HTML_APP:")) {
    const html = result.slice("ALOMDA_HTML_APP:".length);
    if (!html.trim()) return false;
    await persistTaskArtifact(new Blob([html], { type: "text/html;charset=utf-8" }), safeArtifactName(fallbackTitle, "AL-OMDA-app") + ".html", "text/html", projectId);
    return true;
  }
  const word = getTaskWordDocument(result);
  if (word) {
    const rtl = /[\u0590-\u08ff]/.test(word.title + word.paragraphs.join(" ") + word.columns.join(" ") + word.rows.flat().join(" "));
    await persistTaskArtifact(createDocxBlob(word, rtl), safeArtifactName(word.title, "AL-OMDA-document") + ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", projectId);
    return true;
  }
  const workbook = getTaskSpreadsheet(result);
  if (workbook) {
    await persistTaskArtifact(createXlsxBlob(workbook), safeArtifactName(workbook.title, "AL-OMDA-workbook") + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", projectId);
    return true;
  }
  const presentation = getTaskPresentation(result);
  if (presentation) {
    await persistTaskArtifact(createPptxBlob(presentation), safeArtifactName(presentation.title, "AL-OMDA-presentation") + ".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", projectId);
    return true;
  }
  return false;
}
async function downloadTaskCodeProject(data: TaskCodeProject, projectId?: string): Promise<void> {
  const blob = createZipBlob(data.files);
  await saveAndDownloadTaskArtifact(blob, safeArtifactName(data.title, "AL-OMDA-project") + ".zip", "application/zip", projectId);
}
async function downloadTaskHtml(data: { title: string; html: string }, projectId?: string): Promise<void> {
  const filename = safeArtifactName(data.title, "AL-OMDA-app") + ".html";
  const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
  await saveAndDownloadTaskArtifact(blob, filename, "text/html", projectId);
}
async function downloadTaskWord(data: TaskWordDocument, projectId?: string): Promise<void> {
  const rtl = /[\u0590-\u08ff]/.test(data.title + data.paragraphs.join(" ") + data.columns.join(" ") + data.rows.flat().join(" "));
  const blob = createDocxBlob(data, rtl);
  await saveAndDownloadTaskArtifact(
    blob,
    safeArtifactName(data.title, "AL-OMDA-document") + ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    projectId,
  );
}


const translations = {
  ar: {
    overview:'الرئيسية', aiChat:'الشات الذكي', usage:'الاستخدام والذاكرة', agents:'سوق الوكلاء', agentNetwork:'شبكة الوكلاء', workbench:'مساحة العمل', history:'سجل المهام', profile:'الملف الشخصي',
    workspace:'مساحة العمل', account:'الحساب', launcherInsightsAccount:'المتابعة والحساب', launcherCoreTitle:'العمل الأساسي', launcherCoreDesc:'ابدأ وأنجز وتابع', launcherSecondaryDesc:'إحصاءات وتفضيلات التطبيق', launcherSubtitleChat:'ابدأ محادثة مع العمدة', launcherSubtitleWorkbench:'حوّل طلبك إلى خطة', launcherSubtitleAgents:'اختر التخصص المناسب', launcherSubtitleHistory:'راجع مشاريعك ونتائجك', launcherSubtitleUsage:'الاستهلاك والذاكرة', launcherSubtitleProfile:'بياناتك وتفضيلاتك', control:'أنت صاحب القرار', controlText:'كل مرحلة تتطلب موافقتك. لا يتم إرسال أي مرحلة للتنفيذ إلا بعد اعتمادك.',
    developerTitle:'وحدة المطور', developerSub:'نظرة تقنية على مساحة العمل', dashboard:'لوحة التحكم', welcome:'مساحة عملك، بوضوح كامل.', hello:'مرحباً بك،', hero:'ابدأ محادثتك مع العمدة، ودعه يساعدك في إنجاز العمل.', heroText:'اسأل، أنشئ ملفاتك ومشروعاتك، أو فوّض مهمة لوكيل متخصص مع الاحتفاظ بالتحكم في قراراتك.', newRequest:'طلب جديد', activeTasks:'مهام قيد المراجعة', approvedPlans:'خطط معتمدة', specialists:'اختصاصات متاحة', totalTasks:'إجمالي المهام', preview:'عرض تجريبي محلي', recent:'أحدث المهام', seeHistory:'عرض السجل', specialties:'اختصاصات الوكلاء', allSix:'كل الاختصاصات الستة', demoNotice:'هذه بيانات عرض تجريبية. الخطط محاكاة محلية محددة مسبقاً وليست ناتجة عن ذكاء اصطناعي أو تنفيذ حقيقي.',
    marketplace:'سوق الوكلاء', marketplaceSub:'مساعدون متخصصون، تحت إشرافك الكامل.', all:'الكل', available:'متاح الآن', useAgent:'ابدأ بطلب', request:'اطلب مساعدة', workbenchSub:'اكتب ما تحتاجه، ثم راجع الخطة قبل الموافقة.', requestLabel:'ما المهمة التي تريد تفويضها؟', requestPlaceholder:'مثال: أريد خطة إطلاق لخدمة اشتراك موجهة للشركات الصغيرة في السعودية...', chooseSpecialty:'اختر الاختصاص', generatePlan:'اعرض الخطة المقترحة', yourPlan:'الخطة المقترحة', planEmptyTitle:'خطتك تبدأ من هنا', planEmptyText:'اكتب طلبك واختر اختصاصاً. سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لتراجعها قبل التنفيذ.', planDisclaimer:'سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لمراجعتها قبل بدء التنفيذ.', edit:'تعديل', save:'حفظ التعديل', stepDetails:'تفاصيل الخطوة', expectedOutput:'النتيجة المطلوبة', completionCheck:'معيار الاكتمال', approve:'موافقة وتنفيذ', approveAll:'اعتماد باقي المراحل وتشغيل المشروع', reject:'رفض الخطوة', approvedStep:'تمت الموافقة', rejectedStep:'مرفوضة — عدّلها أو وافق عليها للمتابعة', pendingStep:'بانتظار موافقتك', step:'الخطوة', pause:'إيقاف مؤقت', resume:'استئناف المراجعة', stop:'إيقاف المهمة', paused:'متوقفة مؤقتاً', stopped:'متوقفة', completed:'الخطة معتمدة', reviewStatus:'بانتظار المراجعة', progress:'تقدم الخطة', allApproved:'تمت الموافقة على كل خطوات الخطة.', noExecution:'بعد موافقتك على كل خطوة، ينفّذها العمدة تلقائياً ويحفظ مخرجها هنا.',
    historySub:'كل طلباتك وخططك في مكان واحد.', searchTasks:'ابحث في المهام...', detail:'تفاصيل المهمة', backHistory:'العودة إلى السجل', taskRequest:'الطلب الأصلي', planProgress:'حالة الخطة', created:'تاريخ الإنشاء', demoTask:'مهمة عرض', userTask:'طلبك', noTasks:'لا توجد مهام تطابق بحثك.', profileSub:'تحكم في تفضيلاتك وطريقة عرض مساحة العمل.', discoverFeatures:'اكتشف إمكانيات العمدة', discoverFeaturesText:'افتح أي ميزة للانتقال مباشرة إلى مكان استخدامها.', featureChat:'الشات الذكي', featureChatText:'تحدث مع العمدة واطلب المساعدة.', featureAgents:'سوق الوكلاء', featureAgentsText:'استعرض الاختصاصات وابدأ طلبًا.', featureWorkbench:'مساحة العمل', featureWorkbenchText:'أنشئ طلبًا وراجع خطواته.', featureHistory:'سجل المهام', featureHistoryText:'تابع طلباتك ونتائجها.', featureUsage:'الاستخدام والذاكرة', featureUsageText:'راجع استهلاكك وإعدادات الذاكرة.', accountDetails:'بيانات الحساب', displayName:'الاسم المعروض', organization:'الجهة أو النشاط', language:'لغة الواجهة', languageDesc:'يتم حفظ اختيارك على هذا الجهاز.', notifications:'التنبيهات', notificationDesc:'تنبيهات محلية داخل مساحة العمل.', safeguards:'ضوابط التفويض', safeguard1:'لا شيء يتحرك دون موافقتك.', safeguard2:'كل خطوة مستقلة وتحتاج قراراً واضحاً.', safeguard3:'لا توجد تكاملات أو إجراءات خارجية.', saveProfile:'حفظ الملف', saved:'تم الحفظ', interface:'تفضيلات الواجهة', userName:'مستخدم العمْدة', orgName:'مشروعك', taskCount:'طلب', tasksCount:'طلبات', menu:'القائمة', languageSwitch:'EN', search:'بحث', newTask:'إنشاء طلب جديد', taskPlan:'خطة المهمة', planIsDemo:'عرض محلي', chooseAgent:'اختر وكيلاً متخصصاً', workbenchTag:'مساحة عمل خاضعة لإشرافك', requestCreated:'تم إنشاء خطة المعاينة', emptyHistory:'ابدأ بطلبك الأول', emptyHistoryText:'ستجد خططك هنا مع سجل واضح لكل قرار وموافقة.', toWorkbench:'إنشاء طلب', updateName:'أدخل اسمك', updateOrg:'اسم النشاط أو الفريق', approvedCount:'خطوات معتمدة', pendingCount:'خطوات متبقية', noExternal:'بدون إجراءات خارجية',
    cat_business:'الأعمال', cat_development:'التطوير', cat_design:'التصميم', cat_marketing:'التسويق', cat_research:'البحث', cat_assistant:'المساعد الشخصي',
    desc_business:'خطط واضحة للنمو والعمليات وقرارات العمل.', desc_development:'تفكيك المتطلبات إلى خطوات تقنية قابلة للمراجعة.', desc_design:'تحويل الأفكار إلى موجزات وتجارب مرئية.', desc_marketing:'رسائل وحملات وخطط محتوى عملية.', desc_research:'أسئلة منظمة ومحاور بحث قابلة للتحقق.', desc_assistant:'تنظيم الأولويات والمهام اليومية باهتمام.',
    label_business:'استراتيجية وتشغيل', label_development:'هندسة ومنتج', label_design:'تجربة وهوية', label_marketing:'نمو ومحتوى', label_research:'تحليل واكتشاف', label_assistant:'تنظيم يومي',
    plan1:'تحديد النتيجة المطلوبة ونطاق المهمة', plan2:'تقسيم العمل إلى مخرجات قابلة للمراجعة', plan3:'تجهيز ملخص وتسليم للمراجعة النهائية', plan4:'مراجعة المخاطر والافتراضات معك',
    authAccount:'حساب Supabase', authUnavailable:'إعدادات Supabase غير متاحة حالياً. سيبقى هذا العرض محلياً على هذا الجهاز.', authConfigured:'تسجيل الدخول يحفظ مهامك وملفك في مساحة خاصة بحسابك.', authChecking:'جارٍ التحقق من إعدادات الحساب...', email:'البريد الإلكتروني', password:'كلمة المرور', signIn:'تسجيل الدخول', signUp:'إنشاء حساب', switchToSignUp:'ليس لديك حساب؟ أنشئ حساباً', switchToSignIn:'لديك حساب بالفعل؟ سجّل الدخول', signOut:'تسجيل الخروج', emailConfirmation:'تحقق من بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول.', signedInAs:'تم تسجيل الدخول باسم', avatar:'الصورة الشخصية', uploadAvatar:'رفع صورة', avatarHint:'PNG أو JPEG أو WebP، بحد أقصى 5 ميجابايت. الصورة خاصة بحسابك.', authWorking:'جارٍ حفظ التغييرات...', localOnly:'معاينة محلية فقط', apiUnavailable:'تعذر الاتصال بخادم الحسابات. ما زالت المعاينة المحلية متاحة.', saveTaskFailed:'تعذر حفظ المهمة في Supabase.', profileSaved:'تم حفظ الملف في حسابك.',
    confirmStop:'هل تريد إيقاف هذه المهمة؟', active:'نشط', availableFor:'اختصاص متاح', privacy:'خصوصية وتحكم', assistantLabel:'موجّه AL OMDA', noMore:'هذا العرض لا يتصل بأي خدمة خارجية.', chatWelcome:'أهلاً بك. صف المهمة التي تريد تفويضها، وسأعرض لك تصوراً محلياً لتراجعه.', localResponse:'هذا تصور توضيحي مبني على قالب محلي. لا يتصل بذكاء اصطناعي ولا ينفّذ أي خطوة.',
  },
  en: {
    overview:'Overview', aiChat:'AI Chat', usage:'Usage & memory', agents:'Agent marketplace', agentNetwork:'Agent Network', workbench:'Workbench', history:'Task history', profile:'Profile',
    workspace:'WORKSPACE', account:'ACCOUNT', launcherInsightsAccount:'INSIGHTS & ACCOUNT', launcherCoreTitle:'CORE WORKSPACE', launcherCoreDesc:'Create, delegate, and track', launcherSecondaryDesc:'Usage and app preferences', launcherSubtitleChat:'Talk to AL OMDA', launcherSubtitleWorkbench:'Turn a request into a plan', launcherSubtitleAgents:'Choose a specialist', launcherSubtitleHistory:'Review projects and results', launcherSubtitleUsage:'Usage and memory', launcherSubtitleProfile:'Personal details and settings', control:'You stay in control', controlText:'Every stage requires your approval. A stage is sent for execution only after you approve it.',
    developerTitle:'Developer console', developerSub:'A technical view of your workspace', dashboard:'Dashboard', welcome:'Your workspace, in full view.', hello:'Welcome back,', hero:'Start a conversation with AL OMDA and get things done.', heroText:'Ask questions, create files and projects, or delegate work to a specialist while keeping control of every decision.', newRequest:'New request', activeTasks:'Awaiting review', approvedPlans:'Plans approved', specialists:'Specialties available', totalTasks:'Total tasks', preview:'LOCAL PREVIEW', recent:'Recent tasks', seeHistory:'View history', specialties:'Agent specialties', allSix:'All six specialties', demoNotice:'Seeded demo data. Plans are deterministic local previews—not AI output and not real execution.',
    marketplace:'Agent marketplace', marketplaceSub:'Specialists for focused work, always under your oversight.', all:'All', available:'Available now', useAgent:'Start a request', request:'Request help', workbenchSub:'Describe what you need, then review every proposed step.', requestLabel:'What would you like to delegate?', requestPlaceholder:'Example: Outline a launch plan for a subscription service for small businesses in Riyadh...', chooseSpecialty:'Choose a specialty', generatePlan:'Propose a plan', yourPlan:'Proposed plan', planEmptyTitle:'Your plan starts here', planEmptyText:'Describe your request and choose a specialty. AL OMDA will create a tailored AI plan for your review before execution.', planDisclaimer:'AL OMDA will create a tailored AI plan for your review before execution begins.', edit:'Edit', save:'Save changes', stepDetails:'Step details', expectedOutput:'Expected output', completionCheck:'Completion check', approve:'Approve & run', approveAll:'Approve remaining stages & run project', reject:'Reject step', approvedStep:'Approved', rejectedStep:'Rejected — edit or approve to continue', pendingStep:'Awaiting your approval', step:'Step', pause:'Pause task', resume:'Resume review', stop:'Stop task', paused:'Paused', stopped:'Stopped', completed:'Plan approved', reviewStatus:'Awaiting review', progress:'Plan progress', allApproved:'All proposed steps have been approved.', noExecution:'Once you approve a step, AL OMDA executes it automatically and saves the deliverable here.',
    historySub:'Every request and proposed plan, in one place.', searchTasks:'Search tasks...', detail:'Task details', backHistory:'Back to history', taskRequest:'Original request', planProgress:'Plan status', created:'Created', demoTask:'Demo task', userTask:'Your request', noTasks:'No tasks match your search.', profileSub:'Set your preferences and how your workspace behaves.', discoverFeatures:'Explore AL OMDA features', discoverFeaturesText:'Open a feature to go straight to where you can use it.', featureChat:'AI chat', featureChatText:'Talk to AL OMDA and ask for help.', featureAgents:'Agent marketplace', featureAgentsText:'Explore specialties and start a request.', featureWorkbench:'Workbench', featureWorkbenchText:'Create a request and review its steps.', featureHistory:'Task history', featureHistoryText:'Track your requests and their results.', featureUsage:'Usage & memory', featureUsageText:'Review usage and memory settings.', accountDetails:'Account details', displayName:'Display name', organization:'Organization or project', language:'Interface language', languageDesc:'Your choice is saved on this device.', notifications:'Notifications', notificationDesc:'Local notifications inside this workspace.', safeguards:'Delegation safeguards', safeguard1:'Nothing moves without your approval.', safeguard2:'Each step is separate and requires a clear decision.', safeguard3:'No integrations or external actions are connected.', saveProfile:'Save profile', saved:'Saved', interface:'Interface preferences', userName:'AL OMDA user', orgName:'Your workspace', taskCount:'task', tasksCount:'tasks', menu:'MENU', languageSwitch:'عربي', search:'Search', newTask:'Create a request', taskPlan:'Task plan', planIsDemo:'LOCAL PREVIEW', chooseAgent:'Choose a specialist', workbenchTag:'A workspace under your direction', requestCreated:'Preview plan created', emptyHistory:'Start with your first request', emptyHistoryText:'Your plans will appear here with a clear record of every decision.', toWorkbench:'Create a request', updateName:'Enter your name', updateOrg:'Business or team name', approvedCount:'steps approved', pendingCount:'steps remaining', noExternal:'No external actions',
    cat_business:'Business', cat_development:'Development', cat_design:'Design', cat_marketing:'Marketing', cat_research:'Research', cat_assistant:'Personal assistant',
    desc_business:'Clear growth, operations, and business decision plans.', desc_development:'Break requirements into technical steps for review.', desc_design:'Turn ideas into clear briefs and visual experiences.', desc_marketing:'Practical messaging, campaigns, and content plans.', desc_research:'Structured questions and verifiable research themes.', desc_assistant:'Thoughtful organization for everyday priorities.',
    label_business:'Strategy & operations', label_development:'Engineering & product', label_design:'Experience & identity', label_marketing:'Growth & content', label_research:'Analysis & discovery', label_assistant:'Daily organization',
    plan1:'Clarify the intended outcome and scope', plan2:'Break the work into reviewable deliverables', plan3:'Prepare a summary for your final review', plan4:'Review assumptions and risks with you',
    authAccount:'Supabase account', authUnavailable:'Supabase settings are not available yet. This preview will remain local to this device.', authConfigured:'Signing in saves your tasks and profile to your private account space.', authChecking:'Checking account setup...', email:'Email address', password:'Password', signIn:'Sign in', signUp:'Create account', switchToSignUp:'New here? Create an account', switchToSignIn:'Already have an account? Sign in', signOut:'Sign out', emailConfirmation:'Check your email to confirm the account, then sign in.', signedInAs:'Signed in as', avatar:'Profile image', uploadAvatar:'Upload image', avatarHint:'PNG, JPEG, or WebP, up to 5 MB. Your image stays private to your account.', authWorking:'Saving changes...', localOnly:'Local preview only', apiUnavailable:'Could not reach the account server. The local preview is still available.', saveTaskFailed:'Could not save the task to Supabase.', profileSaved:'Profile saved to your account.',
    confirmStop:'Stop this task?', active:'Active', availableFor:'Specialty available', privacy:'Privacy & control', assistantLabel:'AL OMDA Orchestrator', noMore:'This preview does not connect to any external service.', chatWelcome:'Welcome. Describe what you want to delegate, and I’ll show a local outline for you to review.', localResponse:'This is an illustrative outline from a local template. It does not call AI or execute any step.',
  },
} as const;
type TranslationKey = keyof typeof translations.en;

const specialties: { id: Specialty; icon: LucideIcon }[] = [
  { id:'business', icon:BriefcaseBusiness }, { id:'development', icon:Code2 }, { id:'design', icon:Palette },
  { id:'marketing', icon:Megaphone }, { id:'research', icon:FlaskConical }, { id:'assistant', icon:UserRoundCog },
];
const localPlanTemplates: Record<Language, Record<Specialty, string[]>> = {
  ar: {
    business: ['تحديد الهدف والشريحة المستهدفة', 'حصر الفرص والافتراضات الرئيسية', 'ترتيب خطوات العمل والمخرجات', 'اقتراح مؤشرات للمراجعة معك'],
    development: ['تحديد المتطلبات والنتيجة المطلوبة', 'توضيح المكونات والبيانات المتأثرة', 'ترتيب خطوات التنفيذ والتحقق', 'مراجعة الأمان والتكامل والنشر'],
    design: ['تحديد الجمهور والهدف من التجربة', 'رسم مسار المستخدم ونقاط التفاعل', 'إعداد موجز للمحتوى والاتجاه البصري', 'مراجعة سهولة الاستخدام والاستجابة'],
    marketing: ['تحديد الجمهور والرسالة الأساسية', 'صياغة محاور المحتوى والحملة', 'اقتراح القنوات وجدول النشر', 'مراجعة الادعاءات ومؤشرات الأداء'],
    research: ['صياغة سؤال البحث والافتراضات', 'تحديد المصادر ومحاور الاستقصاء', 'تنظيم الأدلة والملاحظات', 'تلخيص النتائج وحدودها للمراجعة'],
    assistant: ['توضيح الأولوية والموعد النهائي', 'تقسيم المطلوب إلى مهام قصيرة', 'اقتراح ترتيب وجدول مناسب', 'مراجعة التعارضات والخطوة التالية'],
  },
  en: {
    business: ['Clarify the goal and target segment', 'List the main opportunities and assumptions', 'Prioritize work steps and deliverables', 'Suggest review metrics with you'],
    development: ['Define requirements and the intended outcome', 'Map affected components and data', 'Sequence implementation and verification', 'Review security, integrations, and release'],
    design: ['Clarify the audience and experience goal', 'Outline user journeys and touchpoints', 'Draft a content and visual direction brief', 'Review usability and responsive behavior'],
    marketing: ['Define the audience and core message', 'Shape campaign and content themes', 'Suggest channels and a publishing schedule', 'Review claims and success measures'],
    research: ['Frame the research question and assumptions', 'Identify sources and inquiry themes', 'Organize evidence and observations', 'Summarize findings and limitations for review'],
    assistant: ['Clarify the priority and deadline', 'Break the request into small actions', 'Suggest a useful order and schedule', 'Review conflicts and the next step'],
  },
};

function getStepGuidance(specialty:Specialty, index:number, language:Language):{output:string; complete:string} {
  const ar = language === 'ar';
  const guidance:Record<Specialty,{output:string[];complete:string[];outputEn:string[];completeEn:string[]}> = {
    business:{
      output:['ملخص فرصة العمل والعميل المستهدف','قائمة المنتجات أو الخدمات مع تسعير وتكلفة مبدئية','مقارنة الموردين وخطة موارد ومخاطر','خطة إطلاق ومؤشرات متابعة'],
      complete:['الهدف والعميل والقيود مكتوبة بوضوح','كل خيار له تكلفة وسعر وهامش أو مبرر للاختيار','الموردون قورنوا بمعايير موحدة والمخاطر موثقة','تم اختبار مسار العميل وتحديد مؤشرات قابلة للقياس'],
      outputEn:['Business opportunity and target-customer brief','Product/service shortlist with initial costs and pricing','Supplier comparison, resource plan, and risks','Launch plan and tracking metrics'],
      completeEn:['Goal, customer, and constraints are documented','Each option has cost, price, margin, or a clear selection rationale','Suppliers are compared consistently and risks are recorded','Customer journey is tested and measurable metrics are set']},
    development:{
      output:['وثيقة متطلبات ونطاق واضح','مخطط الشاشات أو المكونات وتدفق الاستخدام','تقسيم تقني للمهام والاعتماديات','نسخة قابلة للاختبار وخطة إصدار'],
      complete:['المتطلبات ومعايير القبول محددة','المسارات والحالات الأساسية والبديلة موضحة','كل مكوّن له مهمة واعتمادية معروفة','اختبارات القبول الأساسية ناجحة وخطة الإصدار موثقة'],
      outputEn:['Requirements and scope brief','Screen/component map and user flows','Technical task breakdown and dependencies','Testable release candidate and release plan'],
      completeEn:['Requirements and acceptance criteria are defined','Primary and alternative flows are documented','Each component has a task and known dependencies','Core acceptance tests pass and release plan is recorded']},
    design:{
      output:['ملخص الجمهور والرسالة والهدف','اتجاه بصري ومراجع وأسس التصميم','مسودة التصميم ومراجعاتها','ملفات نهائية ومواصفات التسليم'],
      complete:['الجمهور والرسالة والمقاس أو الاستخدام محدد','الألوان والخطوط والتكوين متسقة مع الهدف','تمت مراجعة النصوص والمحاذاة والنسخ المطلوبة','الملفات بالمقاسات والصيغ المطلوبة وجاهزة للاستخدام'],
      outputEn:['Audience, message, and objective brief','Visual direction, references, and design foundations','Design draft and reviewed variations','Final assets and handoff specifications'],
      completeEn:['Audience, message, and dimensions/use are defined','Colors, typography, and composition support the objective','Copy, alignment, and required variations are reviewed','Assets use the required dimensions/formats and are ready']},
    marketing:{
      output:['تعريف الجمهور والهدف والرسالة','أفكار ومواد أو نصوص جاهزة للاختبار','جدول نشر أو إعداد حملة وقنواتها','تقرير نتائج وتوصيات تحسين'],
      complete:['الجمهور والهدف ومؤشر النجاح محددون','المواد متوافقة مع الرسالة والمنصة','المواعيد والقنوات والميزانية أو الموارد موثقة','النتائج مقاسة مقارنة بالهدف والتحسينات محددة'],
      outputEn:['Audience, objective, and message definition','Campaign/content assets ready for testing','Publishing calendar or campaign/channel setup','Results report and optimization recommendations'],
      completeEn:['Audience, objective, and success metric are defined','Assets match the message and platform','Dates, channels, and budget/resources are documented','Results are measured against the goal and improvements identified']},
    research:{
      output:['سؤال بحث ونطاق ومعايير','مجموعة مصادر وأدلة موثقة','تحليل ومقارنة للنتائج','ملخص نتائج وتوصيات وحدود البحث'],
      complete:['السؤال والنطاق ومعايير الاستبعاد واضحة','المصادر موثوقة والادعاءات مرتبطة بأدلتها','التعارضات والفجوات والافتراضات موضحة','كل توصية مدعومة وقيود البحث مذكورة'],
      outputEn:['Research question, scope, and criteria','Documented source and evidence set','Analysis and comparison of findings','Findings summary, recommendations, and limitations'],
      completeEn:['Question, scope, and exclusion criteria are clear','Sources are credible and claims linked to evidence','Conflicts, gaps, and assumptions are identified','Recommendations are supported and limitations stated']},
    assistant:{
      output:['هدف وأولويات ومواعيد محددة','قائمة مهام وموارد وعوائق','جدول تنفيذ واقعي مرتب','نقطة متابعة ومقياس إنجاز'],
      complete:['النتيجة المطلوبة والموعد والأولوية محددة','المهام والموارد والعوائق محصورة','لكل مهمة وقت ومسؤول أو خطوة تالية واضحة','يوجد موعد مراجعة ومقياس واضح للتقدم'],
      outputEn:['Defined goal, priorities, and deadlines','Task, resource, and blocker list','Prioritized realistic action schedule','Check-in point and completion measure'],
      completeEn:['Desired outcome, deadline, and priority are clear','Tasks, resources, and blockers are captured','Each task has a time estimate and clear next action/owner','A review point and progress measure are set']}
  };
  const item = guidance[specialty];
  const i = Math.max(0,Math.min(index,3));
  return ar ? {output:item.output[i],complete:item.complete[i]} : {output:item.outputEn[i],complete:item.completeEn[i]};
}

function cleanSubmittedRequest(value:string):string {
  const clean = value.trim().replace(/\s+/g,' ');
  // Strip accidentally pasted plan UI only when its quoted original request is present.
  const quoted = clean.match(/تحديد المطلوب للطلب\s*[:：]\s*[«“]+([\s\S]*?)[»”]+/);
  const extracted = quoted?.[1] && /الخطة المقترحة|معاينة محلية فقط|بانتظار موافقتك|تمت الموافقة/.test(clean)
    ? quoted[1].trim()
    : clean;
  // Remove quotation marks accidentally included around the submitted request.
  return extracted.replace(/^[«“"']+|[»”"']+$/g,'').trim();
}

function buildLocalPlan(request:string, specialty:Specialty, language:Language):string[] {
  const clean = request.trim().replace(/\s+/g,' ');
  const normalized = clean.toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/ـ/g,'');
  const ar = language === 'ar';
  // Extract practical constraints before choosing a specialty-specific workflow.
  const budgetMatch = clean.match(/(?:ميزانية|بميزانية|التكلفة|تكلفة|مبلغ|رأس المال|رأس مال)\s*[:：]?\s*([\d,.]+\s*(?:درهم(?:اً)?|دولار(?:اً)?|جنيه(?:اً)?|ريال(?:اً)?|aed|usd|egp|sar)?)/i)
    ?? clean.match(/([\d,.]+\s*(?:درهم|دولار|جنيه|ريال|aed|usd|egp|sar))\s*(?:ميزانية|كرأس مال)/i);
  const budget = budgetMatch?.[1]?.trim();
  const deadlineMatch = clean.match(/(?:خلال|في خلال|قبل|لمدة|مدة|على مدار|في غضون)\s*(?:(\d+)\s*)?(يوم(?:ين)?|أيام|اسبوع(?:ين)?|أسابيع|شهر(?:ين)?|شهور|ساعه(?:ين)?|ساعات|days?|weeks?|months?|hours?)/i);
  const deadline = deadlineMatch ? [deadlineMatch[1], deadlineMatch[2]].filter(Boolean).join(' ') : undefined;
  const audienceMatch = clean.match(/(?:يستهدف|تستهدف|استهداف|الجمهور المستهدف|الفئة المستهدفة|موجه(?:ة)? الى|موجه(?:ة)? ل|جمهور|عملاء)\s*(?:هو|هي)?\s*([^،.؛!?؟]{2,45}?)(?=\s+(?:بميزانية|خلال|في خلال|لمدة|على مدار|قبل|في غضون)|[،.؛!?؟]|$)/i);
  const audience = audienceMatch?.[1]?.trim().replace(/^(?:الـ|ال)\s*/, '');
  const locationMatch = clean.match(/(?:في\s+(?:مدينة|دولة|سوق)|داخل\s+مدينة|بمدينة|بمنطقة|بالسوق)\s+([\p{L}][\p{L}\s-]{1,28}?)(?=\s+(?:مع|خلال|لمدة|بميزانية|ويستهدف|وتستهدف|على|لدى)|[،.؛!?؟]|$)/u);
  const location = locationMatch?.[1]?.trim();
  const platformMatch = clean.match(/\b(tiktok|instagram|facebook|youtube|linkedin|snapchat|web|ios|android)\b|تيك.?توك|انستجرام|انستغرام|فيسبوك|يوتيوب|لينكد.?ان|سناب(?: شات)?/i);
  const platform = platformMatch?.[0]?.trim();
  const exactProductCountMatch = clean.match(/(?:بـ\s*)?(\d{1,4})\s*(منتجات|منتج)(?=\s|$|[،.؛!?؟])/i);
  const exactProductCount = exactProductCountMatch?.[1];
  const scaleMatch = clean.match(/(?:عدد|بواقع|حوالي|تقريبا|بـ)\s*(\d{1,6})\s*(منتجات|منتج|عملاء|عميل|موظفين|موظف|صفحات|صفحة|فيديوهات|فيديو|قطع|قطعة|users?|customers?|products?|pages?|videos?)(?=\s|$|[،.؛!?؟])/i);
  const scale = exactProductCount ? exactProductCount + ' منتجات' : scaleMatch ? scaleMatch[1] + ' ' + scaleMatch[2] : undefined;
  const context = [
    budget ? (ar ? 'الميزانية: ' : 'Budget: ') + budget : '',
    deadline ? (ar ? 'المدة: ' : 'Timeline: ') + deadline : '',
    audience ? (ar ? 'الفئة: ' : 'Audience: ') + audience : '',
    location ? (ar ? 'النطاق المكاني: ' : 'Location: ') + location : '',
    platform ? (ar ? 'المنصة: ' : 'Platform: ') + platform : '',
    scale ? (ar ? 'الحجم: ' : 'Scale: ') + scale : '',
  ].filter(Boolean).join('؛ ');
  type Flow = { pattern:RegExp; ar:string[]; en:string[] };
  const flows:Record<Specialty,Flow[]> = {
    business:[
      {pattern:/(متجر|تجارة إلكترونية|بيع أونلاين|e-?commerce|online store).*(ملابس|أزياء|fashion|clothing|apparel)|(ملابس|أزياء|fashion|clothing|apparel).*(متجر|تجارة إلكترونية|e-?commerce|online store)/i,ar:['الأيام 1–5: اختبر طلب الشباب على 3 أنواع من الملابس باستطلاع سريع، وحدد أكثر المقاسات والأسعار المطلوبة قبل شراء أي مخزون','الأيام 6–12: اختر 5–10 منتجات كبداية، وحدد لكل منتج سعر البيع والتكلفة والهامش وسياسة المقاسات والاستبدال','الأيام 13–22: قارن 3 موردين على الأقل، واطلب عينات، وتحقق من الجودة والمقاسات ومدة التوريد، ثم ضع سقفاً للشراء واترك احتياطياً من الميزانية','الأيام 23–30: جهّز صفحات المنتجات والصور والدفع والتوصيل وسياسة الاستبدال، ثم نفّذ طلباً تجريبياً وأطلق المتجر على نطاق صغير وتابع الزيارات والطلبات والمرتجعات'],en:['Days 1–5: Validate youth demand across three clothing categories with a short survey; identify preferred sizes and price points before buying stock','Days 6–12: Select 5–10 launch products and calculate selling price, unit cost, margin, sizing details, and exchange policy for each','Days 13–22: Compare at least three suppliers, order samples, verify quality, sizing, and lead times, then cap the initial purchase and keep part of the budget in reserve','Days 23–30: Prepare product pages, photos, payments, delivery, and exchange policy; place a test order, launch small, and track visits, orders, and returns']},
      {pattern:/متجر|تجارة إلكترونية|بيع أونلاين|e-?commerce|online store/i,ar:['تحديد المنتج والفئة المستهدفة والقيمة التي يقدمها المتجر','اختيار الموردين والتسعير وطريقة الدفع والتوصيل','رسم رحلة العميل من اكتشاف المنتج حتى إتمام الطلب','إعداد قائمة الإطلاق ومؤشرات المبيعات والمخزون'],en:['Define products, target buyers, and store value proposition','Choose suppliers, pricing, payment, and delivery','Map the customer journey from discovery to checkout','Prepare launch checklist and sales/inventory metrics']},
      {pattern:/مطعم|كافيه|مقهى|café|cafe|restaurant/i,ar:['تحديد مفهوم المكان والعملاء والموقع المناسب','بناء قائمة المنتجات وحساب تكلفة وسعر كل منتج','تخطيط التشغيل والعمالة والموردين وتجربة العميل','إعداد ميزانية الافتتاح ومؤشرات المبيعات والهدر'],en:['Define the concept, customers, and location','Build the menu and calculate unit costs and prices','Plan operations, staffing, suppliers, and customer experience','Prepare opening budget and sales/waste metrics']},
      {pattern:/مبيعات|بيع|عملاء|زبائن|sales|customer|revenue/i,ar:['تحديد العميل المحتمل واحتياجه وسبب الشراء','مراجعة العرض والسعر والاعتراضات المتوقعة','بناء مسار متابعة من أول تواصل حتى إتمام البيع','تحديد أهداف ومؤشرات التحويل والاحتفاظ بالعملاء'],en:['Identify likely buyers, needs, and purchase triggers','Review the offer, pricing, and likely objections','Build follow-up from first contact through closing','Set targets and conversion/retention metrics']},
    ],
    development:[
      {pattern:/تطبيق|ابلكيشن|موبايل|app|mobile/i,ar:['تحديد المستخدمين والوظائف الأساسية للتطبيق','رسم الشاشات ومسارات الاستخدام وحالات الخطأ','تقسيم البناء إلى واجهة وخلفية وبيانات وتكاملات','وضع اختبارات القبول والأمان وخطة إصدار أول نسخة'],en:['Define users and core app features','Map screens, user flows, and error states','Split work into frontend, backend, data, and integrations','Set acceptance/security tests and first-release plan']},
      {pattern:/موقع|ويب|صفحة|website|web page/i,ar:['تحديد هدف الموقع وصفحاته والجمهور المستهدف','ترتيب المحتوى والتنقل وأزرار اتخاذ الإجراء','تحديد متطلبات الواجهة والخادم والاستضافة والنطاق','اختبار الهاتف والسرعة والنماذج قبل النشر'],en:['Define website goals, pages, and audience','Organize content, navigation, and calls to action','Specify frontend, server, hosting, and domain needs','Test mobile layout, speed, and forms before release']},
      {pattern:/خطأ|مشكلة|إصلاح|bug|error|fix/i,ar:['تسجيل الخطأ وخطوات إعادة ظهوره','تحديد الجزء المتأثر ورسائل الخطأ المرتبطة','اقتراح إصلاح محدد واختبار يمنع تكرار المشكلة','التحقق من عدم تأثر الوظائف الأخرى وتوثيق النتيجة'],en:['Record the bug and reproduction steps','Identify affected components and related errors','Propose a focused fix and regression test','Check for side effects and document the result']},
    ],
    design:[
      {pattern:/شعار|لوجو|هوية|brand|logo|identity/i,ar:['تحديد شخصية العلامة والجمهور والانطباع المطلوب','اختيار اتجاه بصري وألوان وخطوط مناسبة','إعداد نسخ الشعار وقواعد استخدام الهوية','اختبار الهوية على التطبيقات وتجهيز ملفات التسليم'],en:['Define brand personality, audience, and intended impression','Choose visual direction, colors, and typography','Prepare logo variations and identity usage rules','Test applications and package final assets']},
      {pattern:/واجهة|تطبيق|موقع|ui|ux|interface|website|app/i,ar:['تحديد المستخدم والهدف والمهام الأساسية','رسم هيكل الصفحات ومسار المستخدم','تصميم المكونات وحالات الهاتف وسطح المكتب','مراجعة سهولة الاستخدام والتباين وتجهيز المواصفات'],en:['Define users, goals, and key tasks','Map page structure and user journeys','Design components and responsive states','Review usability/contrast and prepare specifications']},
      {pattern:/صورة|بوستر|منشور|تصميم|image|poster|social post|graphic/i,ar:['تحديد رسالة التصميم والمنصة ومقاس النشر','اختيار فكرة بصرية مرتبطة مباشرة بالرسالة','تنفيذ التكوين والنصوص والتسلسل البصري','مراجعة المقروئية والمقاس وإخراج النسخة النهائية'],en:['Define message, platform, and output dimensions','Choose a visual concept tied directly to the message','Build composition, copy, and visual hierarchy','Check legibility and dimensions, then export']},
    ],
    marketing:[
      {pattern:/تيك.?توك|فيديو|ريلز|محتوى|tiktok|video|reels|content/i,ar:['تحديد الجمهور وهدف المحتوى ونبرة الحساب','بناء أفكار وسيناريوهات بخطاف واضح لكل فيديو','إعداد جدول نشر وعناوين وصيغ تصوير ودعوات للتفاعل','قياس الاحتفاظ بالمشاهدة والتفاعل وتحسين المحتوى التالي'],en:['Define audience, content goal, and account voice','Create ideas and scripts with a clear hook per video','Prepare publishing calendar, captions, formats, and CTAs','Measure retention and engagement to improve next content']},
      {pattern:/إعلان|حملة|ترويج|ads|campaign|promot/i,ar:['تحديد هدف الحملة والجمهور والعرض','صياغة الرسالة والمواد الإعلانية ونسخ الاختبار','اختيار القنوات وتوزيع الميزانية وهيكل الحملة','تحديد تكلفة النتيجة ومؤشرات التحويل وقواعد الإيقاف'],en:['Define campaign objective, audience, and offer','Create messaging, ad assets, and test variations','Select channels, budget allocation, and campaign structure','Set cost/conversion metrics and stop rules']},
      {pattern:/بيع|عملاء|جمهور|sales|customers|audience/i,ar:['تحديد شريحة الجمهور ومشكلتها الأساسية','صياغة عرض ورسالة تناسب مرحلة العميل','اختيار قنوات الوصول وطريقة جمع العملاء المحتملين','متابعة التحويل وتكلفة اكتساب العميل وجودة العملاء'],en:['Define audience segment and core problem','Craft an offer and message for the customer stage','Choose acquisition channels and lead-capture flow','Track conversion, acquisition cost, and lead quality']},
    ],
    research:[
      {pattern:/مقارنة|أفضل|اختيار|compare|best|choose/i,ar:['تحديد الخيارات ومعايير القرار وأوزانها','جمع بيانات قابلة للمقارنة من مصادر موثوقة','تحليل الفروق ورصد المعلومات الناقصة والمتعارضة','عرض مقارنة وتوصية مرتبطة بالأدلة وحدودها'],en:['Define options, decision criteria, and weights','Collect comparable data from reliable sources','Analyze differences and flag missing/conflicting evidence','Present an evidence-based comparison and qualified recommendation']},
      {pattern:/سوق|منافس|منافسين|market|competitor/i,ar:['تحديد السوق والنطاق الجغرافي وشرائح العملاء','حصر المنافسين وعروضهم وأسعارهم وقنواتهم','تحليل الفجوات والفرص ومخاطر الدخول','تلخيص النتائج والافتراضات وما يحتاج تحققاً ميدانياً'],en:['Define market, geography, and customer segments','Map competitors, offers, pricing, and channels','Analyze gaps, opportunities, and entry risks','Summarize findings, assumptions, and field checks']},
      {pattern:/دراسة|بحث|معلومات|مصادر|study|research|sources/i,ar:['صياغة سؤال بحث محدد وحدود الموضوع','تحديد المصادر ومعايير قبول المعلومات','جمع الأدلة ومقارنة النتائج المتعارضة','فصل الحقائق عن الافتراضات والفجوات في الخلاصة'],en:['Frame a focused research question and scope','Set sources and evidence-quality criteria','Collect evidence and compare conflicting findings','Separate facts, assumptions, and gaps in the synthesis']},
    ],
    assistant:[
      {pattern:/جدول|وقت|موعد|أسبوع|يوم|schedule|time|calendar|week|day/i,ar:['حصر الالتزامات والمواعيد والوقت المتاح','تقسيم المطلوب إلى فترات ومهام واقعية','ترتيب الجدول حسب الأولوية والطاقة والمدة','إضافة وقت احتياطي ومراجعة يومية للتقدم'],en:['List commitments, deadlines, and available time','Break work into realistic time blocks and tasks','Prioritize by importance, energy, and duration','Add buffer time and a daily progress review']},
      {pattern:/أولوية|مهام|ترتيب|إنجاز|priority|tasks|organize|productivity/i,ar:['جمع المهام وتحديد موعد وأثر كل مهمة','تمييز العاجل والمهم وما يمكن تأجيله أو تفويضه','ترتيب قائمة تنفيذ قصيرة وواضحة','تحديد أول خطوة ومراجعة الإنجاز يومياً'],en:['Capture tasks and define each deadline and impact','Separate urgent, important, deferrable, and delegable work','Create a short actionable priority list','Choose the first action and review progress daily']},
      {pattern:/هدف|خطة|عادة|تطوير|goal|plan|habit|improve/i,ar:['تحويل الهدف إلى نتيجة محددة قابلة للقياس','تحديد نقطة البداية والعوائق والموارد','تقسيم الهدف إلى خطوات صغيرة ومواعيد متابعة','اختيار مؤشر تقدم ومراجعة أسبوعية للتعديل'],en:['Turn the goal into a specific measurable outcome','Identify starting point, obstacles, and resources','Break it into small steps and check-in dates','Choose a progress measure and weekly review']},
    ],
  };
  const generic:Record<Specialty,{ar:string[];en:string[]}> = {
    business:{ar:['تحديد النتيجة التجارية والعميل المستهدف','حصر الموارد والتكاليف والقيود','اختيار مسار عمل ومخرجات قابلة للقياس','تحديد مؤشرات الأداء والمخاطر'],en:['Define business outcome and target customer','List resources, costs, and constraints','Choose a work path and measurable deliverables','Set performance metrics and risks']},
    development:{ar:['تحديد المتطلبات والمستخدمين ومعيار القبول','تقسيم النظام إلى مكونات وبيانات وتكاملات','ترتيب البناء والاختبارات حسب الأولوية','مراجعة الأمان والأداء وخطة الإصدار'],en:['Define requirements, users, and acceptance criteria','Break system into components, data, and integrations','Sequence implementation and tests by priority','Review security, performance, and release plan']},
    design:{ar:['تحديد الجمهور والرسالة والهدف البصري','اختيار اتجاه بصري وهيكل مناسب للمحتوى','إعداد التصميم ومراجعة نسخه','اختبار الوضوح والتناسق وتجهيز التسليم'],en:['Define audience, message, and visual objective','Choose visual direction and content structure','Create design and review variations','Check clarity and consistency, then prepare handoff']},
    marketing:{ar:['تحديد الجمهور والهدف والرسالة','اختيار الفكرة والقنوات والمواد المطلوبة','بناء جدول نشر أو حملة بمخرجات واضحة','قياس النتائج وتحديد التحسينات'],en:['Define audience, objective, and message','Choose concept, channels, and required assets','Build a publishing or campaign schedule','Measure results and identify improvements']},
    research:{ar:['تحديد سؤال البحث ونطاقه','اختيار المصادر وطريقة جمع الأدلة','تحليل المعلومات والتحقق من موثوقيتها','عرض النتائج والقيود والتوصيات'],en:['Define research question and scope','Select sources and evidence methods','Analyze information and verify reliability','Present findings, limitations, and recommendations']},
    assistant:{ar:['تحديد النتيجة والموعد والأولوية','حصر المهام والموارد والعوائق','ترتيب خطوات عملية بوقت واقعي','تحديد نقطة متابعة ومقياس للإنجاز'],en:['Define outcome, deadline, and priority','List tasks, resources, and blockers','Sequence practical actions with realistic timing','Set a check-in point and completion measure']},
  };
  const flow = flows[specialty].find((item)=>item.pattern.test(normalized));
  const steps = [...(flow ? (ar ? flow.ar : flow.en) : generic[specialty][ar ? 'ar' : 'en'])];
  // Preserve an explicitly requested launch quantity instead of replacing it with a generic range.
  if (specialty === 'business' && exactProductCount && /ملابس|أزياء|fashion|clothing|apparel|متجر|e-?commerce|online store/i.test(normalized)) {
    steps[1] = ar
      ? `اختر ${exactProductCount} منتجات كبداية، وحدد لكل منتج سعر البيع والتكلفة والهامش وسياسة المقاسات والاستبدال`
      : `Select exactly ${exactProductCount} launch products and calculate selling price, unit cost, margin, sizing details, and exchange policy for each`;
  }
  const detail = context ? (ar ? ' مع مراعاة ' : ', accounting for ') + context : '';
  return [
    '1. ' + steps[0] + detail + '.',
    '2. ' + steps[1] + detail + '.',
    '3. ' + steps[2] + detail + '.',
    '4. ' + steps[3] + '.',
  ];
}

const navItems: { path:string; key:TranslationKey; icon:LucideIcon }[] = [
  { path:'/', key:'overview', icon:LayoutDashboard }, { path:'/agents', key:'agentNetwork', icon:Compass },
  { path:'/workbench', key:'workbench', icon:BriefcaseBusiness }, { path:'/history', key:'history', icon:History },
];
type DashboardShortcut = { path:string; ar:string; en:string; subtitleAr:string; subtitleEn:string; icon:LucideIcon };
const appLauncherGroups: { id:string; titleAr:string; titleEn:string; subtitleAr:string; subtitleEn:string; items:DashboardShortcut[] }[] = [
  { id:'core', titleAr:'مساحة العمل', titleEn:'WORKSPACE', subtitleAr:'إنشاء المشاريع ومتابعة تنفيذها', subtitleEn:'Create projects and track execution', items:[
    {path:'/projects',ar:'المشاريع',en:'Projects',subtitleAr:'كل مشاريعك المحفوظة',subtitleEn:'All saved projects',icon:BriefcaseBusiness},
    {path:'/pipeline',ar:'مسار العمل',en:'Pipeline',subtitleAr:'مراحل التنفيذ والموافقات',subtitleEn:'Execution stages and approvals',icon:Activity},
    {path:'/assets',ar:'الأصول والملفات',en:'Assets',subtitleAr:'ملفات ومخرجات المشاريع',subtitleEn:'Project files and deliverables',icon:FileText},
    {path:'/workbench',ar:'مشروع جديد',en:'New Project',subtitleAr:'ابدأ مشروعًا أو مهمة',subtitleEn:'Start a project or task',icon:Plus},
    {path:'/history',ar:'سجل المهام',en:'Task History',subtitleAr:'النتائج وسجل التنفيذ',subtitleEn:'Results and execution history',icon:History},
    {path:'/agents',ar:'شبكة الوكلاء',en:'Agent Network',subtitleAr:'التخصصات والوكلاء',subtitleEn:'Specialties and agents',icon:Compass},
  ]},
  { id:'analytics', titleAr:'المالية والتحليلات', titleEn:'FINANCE & ANALYTICS', subtitleAr:'لوحات المتابعة والبيانات المتصلة', subtitleEn:'Dashboards and connected data', items:[
    {path:'/finance/sales-overview',ar:'نظرة عامة على المبيعات',en:'Sales Overview',subtitleAr:'مؤشرات المبيعات',subtitleEn:'Sales metrics',icon:TrendingUp},
    {path:'/finance/sales-distribution',ar:'توزيع المبيعات',en:'Sales Distribution',subtitleAr:'توزيع القنوات والمصادر',subtitleEn:'Channel and source distribution',icon:Globe},
    {path:'/finance/payment-gateways',ar:'بوابات الدفع',en:'Payment Gateways',subtitleAr:'حالة تكاملات الدفع',subtitleEn:'Payment integrations',icon:CreditCard},
    {path:'/finance/active-users',ar:'المستخدمون النشطون',en:'Active Users',subtitleAr:'تحليلات نشاط المستخدمين',subtitleEn:'User activity analytics',icon:Users},
  ]},
  { id:'collaboration', titleAr:'التعاون والتطبيقات', titleEn:'COLLABORATION & APPS', subtitleAr:'أدوات التواصل وإدارة العمل', subtitleEn:'Communication and work tools', items:[
    {path:'/collaboration/contacts',ar:'جهات الاتصال',en:'Contacts',subtitleAr:'دفتر جهات الاتصال',subtitleEn:'Contact directory',icon:Contact},
    {path:'/ai',ar:'المحادثات',en:'Chats',subtitleAr:'محادثاتك مع العمدة',subtitleEn:'Your conversations',icon:MessageSquareText},
    {path:'/collaboration/calendar',ar:'التقويم',en:'Calendar',subtitleAr:'المواعيد والجدولة',subtitleEn:'Events and scheduling',icon:CalendarDays},
    {path:'/collaboration/email',ar:'البريد الإلكتروني',en:'Email',subtitleAr:'إدارة البريد بعد الربط',subtitleEn:'Email after connection',icon:Mail},
    {path:'/collaboration/tickets',ar:'التذاكر والدعم',en:'Tickets & Support',subtitleAr:'طلبات الدعم والمتابعة',subtitleEn:'Support requests and tracking',icon:Ticket},
  ]},
  { id:'system', titleAr:'النظام والإعدادات', titleEn:'SYSTEM & SETTINGS', subtitleAr:'الأمان وإدارة الحساب', subtitleEn:'Security and account settings', items:[
    {path:'/system/security',ar:'الأمان والسجلات',en:'Security & Logs',subtitleAr:'سجلات الأمان والتدقيق',subtitleEn:'Security and audit logs',icon:ShieldCheck},
    {path:'/profile',ar:'الإعدادات',en:'Settings',subtitleAr:'تفضيلات التطبيق والحساب',subtitleEn:'App and account preferences',icon:Settings2},
    {path:'/tools/seo',ar:'فحص SEO',en:'SEO Audit',subtitleAr:'فحص وتحسين المواقع بـ20 نقطة',subtitleEn:'20-point website audit and optimization',icon:Search},
  ]},
  { id:'professionals', titleAr:'التخصصات المهنية', titleEn:'PROFESSIONAL SPECIALTIES', subtitleAr:'أيقونات المجالات المهنية المتاحة ضمن شبكة الوكلاء', subtitleEn:'Professional fields represented in the agent network', items:[
    {path:'/specialties/legal',ar:'المحامي والخدمات القانونية',en:'Lawyer & Legal',subtitleAr:'استشارات وصياغة ومراجعة قانونية',subtitleEn:'Legal research, drafting, and review',icon:Scale},
    {path:'/specialties/engineering',ar:'المهندس والتصميم الهندسي',en:'Engineer & Engineering',subtitleAr:'الهندسة والتصميم والمواصفات',subtitleEn:'Engineering, design, and specifications',icon:HardHat},
    {path:'/specialties/healthcare',ar:'الطب والرعاية الصحية',en:'Medicine & Healthcare',subtitleAr:'المعلومات الصحية والبحث الطبي',subtitleEn:'Health information and medical research',icon:Stethoscope},
    {path:'/specialties/accounting',ar:'المحاسبة والمالية',en:'Accounting & Finance',subtitleAr:'الحسابات والتحليل المالي',subtitleEn:'Accounting and financial analysis',icon:Calculator},
    {path:'/specialties/maintenance',ar:'الصيانة والتشغيل',en:'Maintenance & Operations',subtitleAr:'التشغيل والفحص والصيانة',subtitleEn:'Operations, inspection, and maintenance',icon:Wrench},
    {path:'/specialties/education',ar:'التعليم والتدريب',en:'Education & Training',subtitleAr:'التعليم وإعداد المحتوى التدريبي',subtitleEn:'Learning and training content',icon:GraduationCap},
  ]},
];
const professionalSpecialtyPages = {
  "/specialties/legal": { ar:"المحامي والخدمات القانونية", en:"Legal Services", subtitleAr:"بحث قانوني وصياغة ومراجعة المستندات مع توضيح الولاية القضائية وحدود المراجعة.", subtitleEn:"Legal research, drafting, and document review with jurisdiction and review limits made explicit.", workbenchSpecialty:"research" as Specialty, icon:Scale, promptAr:"أحتاج مساعدة في مهمة قانونية. حدّد الدولة والولاية القضائية أولاً، وافصل بين النصوص القانونية الموثقة والتحليل، واذكر المصادر وما يحتاج مراجعة محامٍ مرخص.", promptEn:"I need help with a legal task. First identify the country and jurisdiction, distinguish verified legal sources from analysis, cite sources, and flag what requires review by a licensed lawyer." },
  "/specialties/engineering": { ar:"المهندس والتصميم الهندسي", en:"Engineering & Design", subtitleAr:"تحليل المتطلبات والمواصفات والحسابات الأولية ومراجعة المخططات مع توثيق الافتراضات.", subtitleEn:"Requirements, specifications, preliminary calculations, and drawing reviews with documented assumptions.", workbenchSpecialty:"development" as Specialty, icon:HardHat, promptAr:"أحتاج مهمة هندسية. ابدأ بتحديد التخصص والمعايير والكود المحلي والأحمال والمدخلات المتاحة، ولا تعتمد أي تصميم إنشائي أو تنفيذي دون مراجعة مهندس مختص.", promptEn:"I need an engineering task. Identify the discipline, applicable local codes, loads, and available inputs first. Do not approve structural or construction designs without qualified engineer review." },
  "/specialties/healthcare": { ar:"الطب والرعاية الصحية", en:"Healthcare", subtitleAr:"تنظيم المعلومات الصحية والبحث في الأدلة وتجهيز أسئلة للمختص، دون تشخيص أو وصف علاج مستقل.", subtitleEn:"Organize health information, research evidence, and prepare clinician questions without independent diagnosis or prescribing.", workbenchSpecialty:"research" as Specialty, icon:Stethoscope, promptAr:"أحتاج مساعدة معلوماتية صحية. وضّح السؤال والسياق، واعتمد على مصادر طبية موثوقة وحديثة، وافصل المعلومات العامة عن الحالات التي تستلزم تقييم طبيب.", promptEn:"I need health information support. Clarify the question and context, use reliable current medical sources, and distinguish general information from issues requiring clinician assessment." },
  "/specialties/accounting": { ar:"المحاسبة والمالية", en:"Accounting & Finance", subtitleAr:"تنظيم القيود والتقارير وتحليل المصروفات والتدفقات وفق العملة والفترة والمعيار المحاسبي.", subtitleEn:"Organize entries and reports and analyze expenses and cash flow by currency, period, and accounting standard.", workbenchSpecialty:"business" as Specialty, icon:Calculator, promptAr:"أحتاج مهمة محاسبية أو مالية. حدّد الدولة والعملة والفترة والمعيار المحاسبي، وميّز بين البيانات التي أقدمها والافتراضات، ولا تنشئ أرقامًا غير موجودة.", promptEn:"I need an accounting or finance task. Identify jurisdiction, currency, period, and accounting standard. Separate supplied data from assumptions and never invent figures." },
  "/specialties/maintenance": { ar:"الصيانة والتشغيل", en:"Maintenance & Operations", subtitleAr:"خطط الصيانة الوقائية وقوائم الفحص وتحليل الأعطال وسجلات التشغيل بناءً على بيانات المعدات.", subtitleEn:"Preventive maintenance plans, inspection checklists, fault analysis, and operating logs based on equipment data.", workbenchSpecialty:"development" as Specialty, icon:Wrench, promptAr:"أحتاج مهمة صيانة وتشغيل. حدّد نوع المعدة والطراز وظروف التشغيل والعطل وإجراءات السلامة، ثم أنشئ خطة فحص وصيانة قابلة للمراجعة دون افتراض بيانات فنية غير متاحة.", promptEn:"I need a maintenance and operations task. Identify equipment type, model, operating conditions, fault, and safety procedures, then prepare a reviewable inspection and maintenance plan without assuming unavailable technical data." },
  "/specialties/education": { ar:"التعليم والتدريب", en:"Education & Training", subtitleAr:"إعداد الدروس والحقائب التدريبية والاختبارات وخطط التعلم وفق المستوى والأهداف.", subtitleEn:"Create lessons, training materials, assessments, and learning plans matched to level and objectives.", workbenchSpecialty:"assistant" as Specialty, icon:GraduationCap, promptAr:"أحتاج مهمة تعليمية أو تدريبية. حدّد المرحلة والمستوى والأهداف والمدة وطريقة التقييم، ثم جهّز محتوى مناسبًا مع أنشطة وقياس واضح للتعلم.", promptEn:"I need an education or training task. Identify learner level, objectives, duration, and assessment method, then prepare suitable content with activities and measurable learning outcomes." },
} as const;

const launcherSubtitleKeys: Record<string, TranslationKey> = {
  '/ai':'launcherSubtitleChat', '/workbench':'launcherSubtitleWorkbench', '/agents':'launcherSubtitleAgents',
  '/history':'launcherSubtitleHistory', '/profile':'launcherSubtitleProfile',
};
const mobileNavItems: typeof navItems = [
  { path:'/', key:'overview', icon:LayoutDashboard },
  { path:'/agents', key:'agentNetwork', icon:Compass },
  { path:'/workbench', key:'workbench', icon:BriefcaseBusiness },
  { path:'/history', key:'history', icon:History },
  { path:'/profile', key:'profile', icon:UserRound },
];
const platformStatusPages = {
  '/finance/sales-overview': { ar:'نظرة عامة على المبيعات', en:'Sales Overview', sourceAr:'مصدر بيانات المبيعات غير مربوط', sourceEn:'Sales data source is not connected', detailAr:'لن تظهر إيرادات أو مصروفات أو أرباح تقديرية. ستظهر الأرقام بعد ربط مصدر مبيعات حقيقي.', detailEn:'Revenue, expenses, and profit are intentionally hidden until a real sales source is connected.' },
  '/finance/sales-distribution': { ar:'توزيع المبيعات', en:'Sales Distribution', sourceAr:'قنوات المبيعات غير مربوطة', sourceEn:'Sales channels are not connected', detailAr:'لن يتم توزيع المبيعات على الموقع أو التطبيق أو السوق أو الوكلاء دون بيانات معاملات فعلية.', detailEn:'Sales will not be attributed to web, mobile, marketplace, or agents without actual transaction data.' },
  '/finance/payment-gateways': { ar:'بوابات الدفع', en:'Payment Gateways', sourceAr:'لا توجد بوابة دفع متصلة', sourceEn:'No payment gateway is connected', detailAr:'لا توجد معاملات أو مفاتيح ربط مؤكدة لعرضها. لا تُدخل مفاتيح سرية في المحادثة؛ استخدم إعدادات الربط الآمنة عند تجهيز التكامل.', detailEn:'There are no verified payment connections or transactions to display. Never paste secret keys into chat; use secure integration settings when available.' },
  '/finance/active-users': { ar:'المستخدمون النشطون', en:'Active Users', sourceAr:'تحليلات المستخدمين غير مفعّلة', sourceEn:'User analytics are not enabled', detailAr:'لن يتم عرض أعداد مستخدمين أو مواقع جغرافية تخمينية. يلزم مصدر تحليلات حقيقي ومصرّح به.', detailEn:'No estimated user counts or guessed locations are shown. A real, authorized analytics source is required.' },
  '/collaboration/contacts': { ar:'جهات الاتصال', en:'Contacts', sourceAr:'دفتر جهات الاتصال غير مربوط', sourceEn:'Contacts provider is not connected', detailAr:'اربط مصدر جهات الاتصال أولًا حتى لا تظهر أسماء أو بيانات أشخاص وهمية.', detailEn:'Connect a contacts source before displaying people or contact details.' },
  '/collaboration/calendar': { ar:'التقويم', en:'Calendar', sourceAr:'التقويم الخارجي غير مربوط', sourceEn:'External calendar is not connected', detailAr:'لا توجد مواعيد خارجية متاحة حاليًا. لن ننشئ أحداثًا أو اجتماعات غير محفوظة.', detailEn:'No external events are available. The app will not invent or imply saved meetings.' },
  '/collaboration/email': { ar:'البريد الإلكتروني', en:'Email', sourceAr:'حساب البريد غير مربوط', sourceEn:'Email account is not connected', detailAr:'لن يتم عرض رسائل أو الادعاء بإرسال بريد قبل ربط حساب بريد فعلي ومنح الإذن.', detailEn:'Messages are not displayed and emails are not claimed as sent until a real mailbox is connected and authorized.' },
  '/collaboration/tickets': { ar:'التذاكر والدعم', en:'Tickets & Support', sourceAr:'نظام التذاكر غير مربوط', sourceEn:'Ticketing system is not connected', detailAr:'لا توجد تذاكر فعلية متاحة. يلزم ربط نظام دعم أو تفعيل تخزين التذاكر قبل استخدامها.', detailEn:'There are no real tickets available. Connect a support system or enable ticket storage before using this area.' },
  '/system/security': { ar:'الأمان والسجلات', en:'Security & Logs', sourceAr:'مصدر سجلات التدقيق غير مربوط', sourceEn:'Audit log source is not connected', detailAr:'لا نعرض سجلات أمنية مصطنعة. يلزم تفعيل سجل أحداث موثوق قبل عرض التنبيهات والتغييرات.', detailEn:'Synthetic security events are not shown. A trusted audit-event source must be enabled before displaying alerts or changes.' },
} as const;

const STORE_KEY = 'al-omda-demo-v1';
const workspaceCacheKey = (userId:string) => `${STORE_KEY}:workspace:${userId}`;
function readWorkspaceTaskCache(userId:string): Task[] {
  try {
    const cached = JSON.parse(localStorage.getItem(workspaceCacheKey(userId)) || 'null');
    if (!Array.isArray(cached)) return [];
    return cached.filter((item): item is Task => {
      if (!item || typeof item !== 'object') return false;
      const task = item as Partial<Task>;
      return typeof task.id === 'string' && typeof task.title === 'string' &&
        typeof task.request === 'string' && Array.isArray(task.steps) && task.demo !== true;
    });
  } catch { return []; }
}
const starterTasks: Task[] = [
  { id:'demo-brief', title:'خطة إطلاق خدمة استشارية', request:'إعداد تصور أولي لإطلاق خدمة استشارية رقمية تستهدف الشركات الصغيرة.', specialty:'business', status:'approved', createdAt:'2025-02-20T10:30:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الشريحة المستهدفة والقيمة المقترحة',state:'approved'},{id:'s2',text:'تقسيم الإطلاق إلى مراحل ومخرجات',state:'approved'},{id:'s3',text:'اقتراح مؤشرات متابعة للمراجعة',state:'approved'}] },
  { id:'demo-content', title:'أفكار محتوى للربع القادم', request:'اقتراح محاور محتوى تعرّف الجمهور بخدماتنا دون مبالغة في الوعود.', specialty:'marketing', status:'review', createdAt:'2025-02-19T08:10:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الجمهور ونبرة التواصل المناسبة',state:'approved'},{id:'s2',text:'اقتراح محاور محتوى قابلة للمراجعة',state:'pending'},{id:'s3',text:'ترتيب المحاور في جدول نشر أولي',state:'pending'}] },
  { id:'demo-research', title:'مراجعة تجربة صفحة التسجيل', request:'مراجعة تجربة التسجيل الحالية وتحديد أسئلة البحث التي تساعد على تحسينها.', specialty:'research', status:'paused', createdAt:'2025-02-17T14:05:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الأسئلة والافتراضات التي تحتاج تحققاً',state:'approved'},{id:'s2',text:'اقتراح محاور مراجعة تجربة المستخدم',state:'pending'},{id:'s3',text:'تلخيص النتائج المتوقعة للمراجعة',state:'pending'}] },
];

function readInitial(): { language:Language; tasks:Task[]; name:string; org:string; accent:string; compact:boolean; wallpaper:string; reduceMotion:boolean } {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) return { ...{ language:'ar' as Language, tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', accent:'blue', compact:false, wallpaper:'midnight', reduceMotion:false }, ...JSON.parse(stored) };
  } catch { /* use seeded local preview */ }
  return { language:'ar', tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', accent:'blue', compact:false, wallpaper:'midnight', reduceMotion:false };
}
const apiRequestOptions = { credentials:'same-origin' as const };
function readApiError(error:unknown, fallback:string):string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as {data?:unknown}).data;
    if (data && typeof data === 'object' && 'error' in data && typeof (data as {error?:unknown}).error === 'string') {
      return (data as {error:string}).error;
    }
    if (data && typeof data === 'object') {
      const fields = data as Record<string,unknown>;
      for (const key of ['message','msg','error_description']) {
        if (typeof fields[key] === 'string') return fields[key] as string;
      }
    }
  }
  return error instanceof Error && !error.message.startsWith('HTTP ') ? error.message : fallback;
}
const taskStatusKey = (status:TaskStatus): TranslationKey => status === 'approved' ? 'completed' : status === 'paused' ? 'paused' : status === 'stopped' ? 'stopped' : 'reviewStatus';
const specialtyKey = (id:Specialty): TranslationKey => `cat_${id}` as TranslationKey;
const specialtyDesc = (id:Specialty): TranslationKey => `desc_${id}` as TranslationKey;
const specialtyLabel = (id:Specialty): TranslationKey => `label_${id}` as TranslationKey;
const dateLabel = (date:string, lang:Language) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { month:'short', day:'numeric' }).format(new Date(date));

const PAGE_GUIDANCE: Record<string, { ar: string; en: string }> = {
  "/": { ar: "ابدأ من هنا لمتابعة المشاريع والمهام وحالة مساحة العمل. أرقام الزوار التجريبية تظهر للضيف فقط؛ بعد تسجيل الدخول نعرض البيانات الحقيقية المتاحة دون تخمين.", en: "Use this page to monitor projects, tasks, and workspace status. Sample visitor figures are guest-only; signed-in users see available real data, never guessed values." },
  "/workbench": { ar: "اكتب المطلوب والنتيجة التي تريدها. راجع الخطة والمخرجات المتوقعة أولًا، ثم اعتمد التنفيذ. يمكنك بدء مشروع جديد دون إيقاف مشروع آخر.", en: "Describe the outcome you need. Review the plan and expected deliverables before approving execution. You can start a new project without stopping another." },
  "/projects": { ar: "هنا تظهر المشاريع المحفوظة وحالة كل مشروع. افتح المشروع لمراجعة مراحله ومخرجاته، أو ابدأ مشروعًا جديدًا من زر مشروع جديد.", en: "Find saved projects and their status here. Open a project to review its stages and deliverables, or start another with New Project." },
  "/pipeline": { ar: "تابع انتقال المشاريع بين المراجعة والتنفيذ والاكتمال. لا تنتقل مرحلة إلى التنفيذ قبل اعتمادها وحفظ نتيجة المرحلة السابقة.", en: "Track projects through review, execution, and completion. A stage cannot run until it is approved and the previous stage's result is saved." },
  "/assets": { ar: "هذه مساحة الملفات الناتجة عن المشاريع. افتح المعاينة قبل التنزيل، وتأكد من أن حالة الملف مكتملة؛ لا تعتبر نص المحادثة ملفًا قابلًا للتنزيل.", en: "This is the workspace for project files. Preview before downloading and check that the file is complete; chat text alone is not a downloadable file." },
  "/history": { ar: "استخدم السجل للعثور على المهام السابقة ومراجعة نتائجها وتصدير البيانات المتاحة. المشروع المتوقف يحتفظ بآخر نقطة تنفيذ محفوظة.", en: "Use history to find previous tasks, review their results, and export available data. A stopped project retains its last saved execution checkpoint." },
  "/agents": { ar: "اختر التخصص أو الوكيل المناسب للمهمة. الأدوات الخارجية والعمليات المؤثرة تحتاج موافقتك، والوكلاء لا يدّعون نجاح خطوة لم تُنفذ.", en: "Choose the specialist suited to the task. External tools and consequential actions require your approval; agents must not claim a step succeeded unless it ran." },
  "/ai": { ar: "المحادثة للأسئلة والشرح والطلبات المباشرة. آخر رسالة منك هي التي تحدد المقصود؛ التحية أو السؤال العادي لا ينشئ ملفًا. اطلب حفظ معلومة صراحةً إذا أردت إضافتها إلى الذاكرة.", en: "Use chat for questions, explanations, and direct requests. Your latest message determines intent; a greeting or ordinary question does not create a file. Explicitly ask to save a fact if you want it in memory." },
  "/ai/usage": { ar: "راجع الاستهلاك والحدود والذاكرة من هذه الصفحة. إذا لم تتوفر بيانات الحساب، يجب أن تظهر غير متاحة بدل اختراع رقم.", en: "Review usage, limits, and memory here. If account data is unavailable, it should be shown as unavailable rather than replaced with an invented number." },
  "/profile": { ar: "عدّل بيانات الحساب واللغة والمظهر وإعدادات الخصوصية. لا تضع مفاتيح API أو كلمات المرور داخل المحادثة؛ استخدم حقول الربط الآمنة عند توفرها.", en: "Manage account details, language, appearance, and privacy settings. Never paste API keys or passwords into chat; use secure connection settings when available." },
  "/finance/sales-overview": { ar: "تعرض هذه الصفحة مؤشرات المبيعات عند ربط مصدر معاملات حقيقي. لا تُعرض إيرادات أو أرباح تجريبية على أنها أرقام فعلية.", en: "This page displays sales metrics only after a real transaction source is connected. Sample revenue or profit must never appear as real data." },
  "/finance/sales-distribution": { ar: "يتطلب توزيع المبيعات بيانات معاملات وقنوات موثقة. عند عدم وجود مصدر متصل، تظل الصفحة موضحة لحالة عدم الربط.", en: "Sales distribution requires verified transaction and channel data. When no source is connected, the page remains clearly marked as not connected." },
  "/finance/payment-gateways": { ar: "لا تظهر بوابة دفع كمتصلة إلا بعد إعداد مصادقة صحيحة واختبارها. لا تشارك المفاتيح السرية في الشات.", en: "A payment gateway is connected only after valid authentication and verification. Do not share secret keys in chat." },
  "/finance/active-users": { ar: "تعرض الصفحة مؤشرات نشاط الحسابات المصرح به فقط، دون جمع أو عرض مواقع المستخدمين.", en: "This page shows authorized account activity metrics only; it does not collect or display user locations." },
  "/collaboration/contacts": { ar: "تظهر جهات الاتصال بعد ربط دفتر عناوين حقيقي ومنح الإذن. لا تُنشأ أسماء أو أرقام أشخاص افتراضيين.", en: "Contacts appear only after a real address book is connected and authorized. No fictional names or phone numbers are created." },
  "/collaboration/calendar": { ar: "تظهر المواعيد بعد ربط تقويم فعلي. لن يتم الادعاء بحفظ اجتماع أو إرساله ما لم يؤكد مزود التقويم ذلك.", en: "Events appear after a real calendar is connected. A meeting is not claimed as saved or sent unless the calendar provider confirms it." },
  "/collaboration/email": { ar: "تحتاج قراءة الرسائل وإرسالها إلى ربط صندوق بريد ومنح الصلاحيات. لا يتم الادعاء بإرسال رسالة دون تأكيد المزود.", en: "Reading and sending email requires a connected mailbox and granted permissions. No message is claimed as sent without provider confirmation." },
  "/collaboration/tickets": { ar: "تحتاج التذاكر إلى نظام دعم متصل أو تخزين فعلي داخل التطبيق. لا تعرض الصفحة تذاكر تجريبية على أنها حقيقية.", en: "Tickets require a connected support system or real in-app storage. Sample tickets are never presented as real." },
  "/system/security": { ar: "تعرض الصفحة سجلات التدقيق من مصدر موثوق فقط. عند عدم تفعيل المصدر، ستظهر حالة عدم الربط بدل تنبيهات مصطنعة.", en: "Audit logs appear only from a trusted source. If no source is enabled, the page shows not connected instead of synthetic alerts." },
};
function getPageGuidance(route: string, isAr: boolean): string {
  const key = route.startsWith("/history/") ? "/history" : route;
  const guide = PAGE_GUIDANCE[key] ?? PAGE_GUIDANCE["/"];
  return isAr ? guide.ar : guide.en;
}

function App() {
  const [location, setLocation] = useLocation();
  const [saved, setSaved] = useState(readInitial);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [pageHelpOpen, setPageHelpOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandAssets, setCommandAssets] = useState<CommandAsset[]>([]);
  const [projectViewMode, setProjectViewMode] = useState<'grid'|'list'>('grid');
  const [projectCategoryFilter, setProjectCategoryFilter] = useState<'all'|Specialty>('all');
  const { language, tasks } = saved;
  const t = (key:TranslationKey) => translations[language][key];
  const isAr = language === 'ar';
  const defaultDisplayName = isAr ? 'مستخدم العمدة' : 'AL OMDA user';
  const name = saved.name.trim() || defaultDisplayName;
  const org = saved.org.trim() || (isAr ? 'مساحة العمل' : 'Workspace');
  const [request, setRequest] = useState('');
  const [planGenerating, setPlanGenerating] = useState(false);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string,string>>({});
  const [stepCommentErrors, setStepCommentErrors] = useState<Record<string,string>>({});
  const taskExecutionLockRef = useRef(false);
  const projectRunLockRef = useRef(false);
  const approvalLockRef = useRef(false);
  const commentSubmissionLockRef = useRef(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty>('business');
  const [filter, setFilter] = useState<Specialty | 'all'>('all');
  const [query, setQuery] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all'|'review'|'approved'|'stopped'>(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    return status === 'review' || status === 'approved' || status === 'stopped' ? status : 'all';
  });
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editComplete, setEditComplete] = useState('');
  const [profileName, setProfileName] = useState(name === defaultDisplayName ? '' : name);
  const [profileOrg, setProfileOrg] = useState(org);
  const [savedToast, setSavedToast] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking'|'unconfigured'|'configured'|'offline'>('checking');
  const [authLoading, setAuthLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [authUser, setAuthUser] = useState<ApiAuthUser | null>(null);
  const [liveUserAnalytics, setLiveUserAnalytics] = useState<{active_users_30d:number;active_users_previous_30d:number;growth_percent:number|null;measured_at:string}|null>(null);
  const [liveUserAnalyticsError, setLiveUserAnalyticsError] = useState('');
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { setLiveUserAnalytics(null); setLiveUserAnalyticsError(''); return; }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setLiveUserAnalytics(null);
    setLiveUserAnalyticsError('');
    fetch('/api/analytics/active-users', { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not load live analytics.');
        const valid = data && Number.isInteger(data.active_users_30d) && data.active_users_30d >= 0 &&
          Number.isInteger(data.active_users_previous_30d) && data.active_users_previous_30d >= 0 &&
          (data.growth_percent === null || (typeof data.growth_percent === 'number' && Number.isFinite(data.growth_percent))) &&
          typeof data.measured_at === 'string';
        if (!valid) throw new Error('The analytics source returned invalid data.');
        return data as {active_users_30d:number;active_users_previous_30d:number;growth_percent:number|null;measured_at:string};
      })
      .then(data => { if (!cancelled) setLiveUserAnalytics(data); })
      .catch(error => { if (!cancelled) setLiveUserAnalyticsError(error instanceof Error ? error.message : 'Could not load live analytics.'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [authLoading, authUser?.id]);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login'|'signup'>('login');
  const [authWorking, setAuthWorking] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    setHistoryStatusFilter(status === 'review' || status === 'approved' || status === 'stopped' ? status : 'all');
  }, [location]);
  useEffect(() => { setPageHelpOpen(false); }, [location]);
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarWorking, setAvatarWorking] = useState(false);
  const [localAgentUrl, setLocalAgentUrl] = useState("http://127.0.0.1:4318");
  const [localAgentToken, setLocalAgentToken] = useState("");
  const [localAgentGoal, setLocalAgentGoal] = useState("");
  const [localAgentStatus, setLocalAgentStatus] = useState<"idle" | "checking" | "ready" | "running" | "approval" | "error">("idle");
  const [localAgentMessage, setLocalAgentMessage] = useState("");
  const [agentGuideNotice, setAgentGuideNotice] = useState("");
  const [localAgentSessionId, setLocalAgentSessionId] = useState(() => { try { return localStorage.getItem("al-omda-agent-session") || ""; } catch { return ""; } });
  const [localAgentPending, setLocalAgentPending] = useState<Array<{ id: string; tool: string; arguments: Record<string, unknown> }>>([]);
  const [localAgentBusy, setLocalAgentBusy] = useState(false);
  const [delegateRoleOne, setDelegateRoleOne] = useState("Code reviewer");
  const [delegateGoalOne, setDelegateGoalOne] = useState("");
  const [delegateModeOne, setDelegateModeOne] = useState<"read_only" | "proposal">("read_only");
  const [delegateRoleTwo, setDelegateRoleTwo] = useState("Security reviewer");
  const [delegateGoalTwo, setDelegateGoalTwo] = useState("");
  const [delegateModeTwo, setDelegateModeTwo] = useState<"read_only" | "proposal">("read_only");
  const [delegateBusy, setDelegateBusy] = useState(false);
  const [delegateResults, setDelegateResults] = useState<Array<{ role: string; mode?: "read_only" | "proposal"; result: string; turns?: number; proposalDirectory?: string; proposalFiles?: Array<{ path: string; bytes: number }>; error?: string; evidence?: Array<{ tool: string; summary: string }> }>>([]);
  const [delegateError, setDelegateError] = useState("");

  const [httpFlowUrl, setHttpFlowUrl] = useState("");
  const [httpFlowMethod, setHttpFlowMethod] = useState<"GET" | "HEAD" | "OPTIONS">("GET");
  const [httpFlowAvailableRoles, setHttpFlowAvailableRoles] = useState<string[]>([]);
  const [httpFlowSelectedRoles, setHttpFlowSelectedRoles] = useState<string[]>([]);
  const [httpFlowBusy, setHttpFlowBusy] = useState(false);
  const [httpFlowError, setHttpFlowError] = useState("");
  const [httpFlowResult, setHttpFlowResult] = useState<any>(null);
  const [httpFlowHistory, setHttpFlowHistory] = useState<Array<{ id: string; createdAt: string; target: string; method: string; roles: string[]; responses: Array<{ role: string; status: number; durationMs: number; bodyLength: number }>; comparison: { sameStatus: boolean; sameBody: boolean; bodyDifferenceAt: number | null; changedHeaders: string[] } }>>([]);
  const [httpFlowHistoryBusy, setHttpFlowHistoryBusy] = useState(false);
  const [httpFlowHistoryError, setHttpFlowHistoryError] = useState("");
  const [localModelProviders, setLocalModelProviders] = useState<Array<{ name: string; model: string; kind: "local" | "remote"; hasApiKey: boolean; purposes?: string[]; priority?: number }>>([]);
  const [modelProvidersError, setModelProvidersError] = useState("");
  const [localModelHealth, setLocalModelHealth] = useState<ModelProviderHealth[]>([]);
  const [modelHealthError, setModelHealthError] = useState("");
  const [modelHealthBusy, setModelHealthBusy] = useState(false);
  const modelProviderRequestRef = useRef(0);
  useEffect(() => { modelProviderRequestRef.current += 1; setLocalModelProviders([]); setLocalModelHealth([]); setModelProvidersError(""); setModelHealthError(""); setModelHealthBusy(false); return () => { modelProviderRequestRef.current += 1; }; }, [localAgentUrl, localAgentToken]);
  const [browserWorkspace, setBrowserWorkspace] = useState<{ policy: { version: 1; allowedHosts: string[] }; configured: boolean; connected: boolean; tools: Array<{ name: string; description: string }>; connectionError: string | null } | null>(null);
  const [browserSiteInput, setBrowserSiteInput] = useState("");
  const [browserWorkspaceBusy, setBrowserWorkspaceBusy] = useState(false);
  const [browserWorkspaceError, setBrowserWorkspaceError] = useState("");
  const [desktopWorkspace, setDesktopWorkspace] = useState<{ configured: boolean; connected: boolean; tools: Array<{ name: string; description: string }>; connectionError: string | null } | null>(null);
  const [desktopWorkspaceBusy, setDesktopWorkspaceBusy] = useState(false);
  const [desktopWorkspaceError, setDesktopWorkspaceError] = useState("");
  const taskWriteQueue = useRef(new Map<string, Promise<void>>());
  const path = location.split('?')[0];
  const detailMatch = path.match(/^\/history\/([^/]+)$/);
  const currentTask = useMemo(() => tasks.find((task) => task.id === (detailMatch?.[1] ?? selectedTaskId ?? new URLSearchParams(window.location.search).get('task'))), [tasks, detailMatch?.[1], selectedTaskId, location]);
  const requestedSpecialty = new URLSearchParams(window.location.search).get('specialty');
  const focusTarget = new URLSearchParams(location.includes('?') ? location.slice(location.indexOf('?') + 1) : '').get('focus');
  const focusedHref = (href:string, target:string) => {
    const url = new URL(href, window.location.origin);
    url.searchParams.set('focus', target);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const navigationHref = (href:string) => {
    const pathname = new URL(href, window.location.origin).pathname;
    const target = pathname === '/ai' ? (authUser ? 'ai-chat-input' : 'ai-chat-login-cta')
      : pathname === '/workbench' ? 'request-input'
      : pathname === '/agents' ? 'agent-marketplace-grid'
      : pathname === '/history' ? 'history-list'
      : pathname.startsWith('/history/') ? 'task-plan'
      : pathname === '/profile' ? 'profile-account-card'
      : 'dashboard-overview';
    return focusedHref(href, target);
  };
  const showWorkspaceHeader = path !== '/ai' && path !== '/ai/usage';
  const workspaceMetrics = useMemo(() => {
    if (!showWorkspaceHeader) return { total:0, needsReview:0, approved:0 };
    return tasks.reduce((metrics, task) => {
      if (!task.demo) {
        metrics.total += 1;
        if (task.status === 'review' || task.status === 'paused') metrics.needsReview += 1;
        if (task.status === 'approved') metrics.approved += 1;
      }
      return metrics;
    }, { total:0, needsReview:0, approved:0 });
  }, [tasks, showWorkspaceHeader]);
  const runtimeStatusLabels = {
    idle: { ar:'لم يتم فحص Runtime', en:'Runtime not checked' },
    checking: { ar:'جارٍ الفحص', en:'Checking runtime' },
    ready: { ar:'Runtime متصل', en:'Runtime connected' },
    running: { ar:'الوكيل يعمل', en:'Agent running' },
    approval: { ar:'بانتظار موافقتك', en:'Approval required' },
    error: { ar:'تعذر الاتصال', en:'Runtime error' },
  } as const;
  const runtimeStatusLabel = runtimeStatusLabels[localAgentStatus]?.[language] ?? runtimeStatusLabels[localAgentStatus]?.en ?? 'Unknown';

  const copyAgentSetup = async (value:string) => {
    try {
      await navigator.clipboard.writeText(value);
      setAgentGuideNotice(isAr ? 'تم نسخ الأوامر. الصقها في Terminal على الكمبيوتر.' : 'Commands copied. Paste them into your computer terminal.');
    } catch {
      setAgentGuideNotice(isAr ? 'تعذر النسخ تلقائيًا. اضغط مطولًا على الأوامر لنسخها.' : 'Clipboard access is unavailable. Select the commands and copy them manually.');
    }
  };
  const linuxMacAgentSetup = `git clone https://github.com/Abdelfattah-hossam/al-omda-ai-app.git
cd al-omda-ai-app
pnpm install
export OMDA_AGENT_TOKEN="$(openssl rand -hex 32)"
export OMDA_AGENT_WORKSPACE="$PWD"
export OMDA_AGENT_EXECUTION="disabled"
export OMDA_AGENT_APP_ORIGINS="https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
export OMDA_AGENT_MODEL_BASE_URL="http://127.0.0.1:1234/v1"
export OMDA_AGENT_MODEL_NAME="your-loaded-lm-studio-model-id"
echo "Your token: $OMDA_AGENT_TOKEN"
pnpm --filter @workspace/scripts agent:runtime`;
  const windowsAgentSetup = `git clone https://github.com/Abdelfattah-hossam/al-omda-ai-app.git
cd al-omda-ai-app
pnpm install
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:OMDA_AGENT_TOKEN = [Convert]::ToHexString($bytes).ToLower()
$env:OMDA_AGENT_WORKSPACE = (Get-Location).Path
$env:OMDA_AGENT_EXECUTION = "disabled"
$env:OMDA_AGENT_APP_ORIGINS = "https://al-omda-ai-app.abdelfattahhossam1.workers.dev"
$env:OMDA_AGENT_MODEL_BASE_URL = "http://127.0.0.1:1234/v1"
$env:OMDA_AGENT_MODEL_NAME = "your-loaded-lm-studio-model-id"
Write-Host "Your token: $env:OMDA_AGENT_TOKEN"
pnpm --filter @workspace/scripts agent:runtime`;

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainArea = document.querySelector<HTMLElement>('.main-area');
    if (mainArea) mainArea.scrollTop = 0;
    const contentWrap = document.querySelector<HTMLElement>('.main-area > .content-wrap');
    if (contentWrap) contentWrap.scrollTop = 0;
  }, [path]);

  useEffect(() => {
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(focusTarget);
      if (!target) return;
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target.scrollIntoView({ behavior: saved.reduceMotion ? 'auto' : 'smooth', block: focusTarget === 'ai-chat-input' || focusTarget === 'request-input' ? 'center' : 'start' });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location, focusTarget, saved.reduceMotion]);

  useEffect(() => {
    const onKeyDown = (event:KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      } else if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.classList.add('dark');
  }, [language]);
  useEffect(() => {
    if (!commandPaletteOpen) return;
    if (!authUser) { setCommandAssets([]); return; }
    setCommandAssets([]);
    let cancelled = false;
    const loadCommandAssets = async () => {
      const projectIds = tasks.filter(task=>!task.demo).slice(0,15).map(task=>task.id);
      const folders: Array<{projectId:string|null;url:string}> = [
        {projectId:null,url:'/api/storage/assets'},
        ...projectIds.map(projectId=>({projectId,url:'/api/storage/assets?projectId='+encodeURIComponent(projectId)})),
      ];
      const responses = await Promise.all(folders.map(async folder => {
        try {
          const response = await fetch(folder.url,{credentials:'same-origin'});
          if(!response.ok)return [];
          const data = await response.json().catch(()=>[]);
          return Array.isArray(data) ? data.map((item:any)=>({...item,projectId:folder.projectId})) : [];
        } catch { return []; }
      }));
      if(cancelled)return;
      const unique = new Map<string,CommandAsset>();
      for(const asset of responses.flat()) if(typeof asset.path==='string'&&typeof asset.name==='string') unique.set(asset.path,asset as CommandAsset);
      setCommandAssets([...unique.values()]);
    };
    void loadCommandAssets();
    return ()=>{cancelled=true;};
  }, [commandPaletteOpen, authUser?.id, tasks]);

  useEffect(() => {
    if (authLoading) return;
    const localSnapshot = authUser
      ? { ...saved, tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك' }
      : saved;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(localSnapshot)); } catch { /* local preview remains usable without storage */ }
  }, [saved, authLoading, authUser]);
  // Keep a private, account-scoped fallback so a temporary workspace request
  // failure never makes a signed-in user's saved projects appear deleted.
  useEffect(() => {
    if (!authUser) return;
    try {
      localStorage.setItem(
        workspaceCacheKey(authUser.id),
        JSON.stringify(saved.tasks.filter((task) => !task.demo)),
      );
    } catch { /* The database remains the source of truth if local storage is unavailable. */ }
  }, [authUser?.id, saved.tasks]);
  const applyWorkspace = (workspace:ApiWorkspace, email:string) => {
    setWorkspaceLoaded(true);
    setWorkspaceLoadError('');
    const storedDisplayName = workspace.profile.displayName.trim();
    const profileInputName = storedDisplayName.toLocaleLowerCase() === email.toLocaleLowerCase() ? '' : storedDisplayName;
    const remoteName = profileInputName || (language === 'ar' ? 'مستخدم العمدة' : 'AL OMDA user');
    const remoteOrg = workspace.profile.organization.trim() || (language === 'ar' ? 'مساحة العمل' : 'Workspace');
    const remoteTasks = workspace.tasks as Task[];
    // Workspace polling runs in the background. Do not replace React state with
    // freshly parsed but identical API data, which needlessly re-renders the whole app.
    setSaved((prev) => {
      const sameTasks = JSON.stringify(prev.tasks) === JSON.stringify(remoteTasks);
      if (prev.name === remoteName && prev.org === remoteOrg && sameTasks) return prev;
      return { ...prev, name:remoteName, org:remoteOrg, tasks:remoteTasks };
    });
    setProfileName((current) => current === profileInputName ? current : profileInputName);
    setProfileOrg((current) => current === remoteOrg ? current : remoteOrg);
    setAvatarPath((current) => current === workspace.profile.avatarPath ? current : workspace.profile.avatarPath);
  };
  useEffect(() => {
    let cancelled = false;
    const initializeAccount = async () => {
      let hasAccountSession = false;
      try {
        const status = await getAuthStatus(apiRequestOptions);
        if (cancelled) return;
        if (!status.configured) {
          setAuthStatus('unconfigured');
          return;
        }
        setAuthStatus('configured');
        const session = await getAuthSession(apiRequestOptions);
        if (cancelled || !session.user) return;
        const accountUser = session.user;
        hasAccountSession = true;
        setAuthUser(accountUser);
        setSaved((prev) => ({ ...prev, tasks:readWorkspaceTaskCache(accountUser.id), name:language === 'ar' ? 'مستخدم العمدة' : 'AL OMDA user', org:language === 'ar' ? 'مساحة العمل' : 'Workspace' }));
        setProfileName('');
        setProfileOrg(language === 'ar' ? 'مساحة العمل' : 'Workspace');
        try {
          const workspace = await getWorkspace(apiRequestOptions);
          if (!cancelled) applyWorkspace(workspace, accountUser.email);
        } catch (error) {
          if (!cancelled) {
            setWorkspaceLoadError(readApiError(error, t('saveTaskFailed')));
            setWorkspaceLoaded(true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAuthStatus('offline');
          setAuthError(readApiError(error, t('apiUnavailable')));
        }
      } finally {
        if (!cancelled) {
          if (!hasAccountSession) setWorkspaceLoaded(true);
          setAuthLoading(false);
        }
      }
    };
    void initializeAccount();
    return () => { cancelled = true; };
  }, []);
  // Refresh the signed-in workspace so tasks created in chat appear without a manual page reload.
  useEffect(() => {
    if (!authUser || authLoading) return;
    let cancelled = false;
    const refreshWorkspace = async () => {
      if (cancelled || document.visibilityState !== "visible" || taskWriteQueue.current.size > 0) return;
      try {
        const workspace = await getWorkspace(apiRequestOptions);
        if (!cancelled) applyWorkspace(workspace, authUser.email);
      } catch {
        // Keep the current task list visible if a background refresh is temporarily unavailable.
      }
    };
    const interval = window.setInterval(() => void refreshWorkspace(), 7000);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshWorkspace(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authUser?.id, authLoading]);

  useEffect(() => {
    if (requestedSpecialty && specialties.some(({id})=>id===requestedSpecialty)) setSelectedSpecialty(requestedSpecialty as Specialty);
  }, [requestedSpecialty]);

  const saveRemoteTask = (task:Task): Promise<void> => {
    const write = () => apiUpdateTask(task.id, {
      title:task.title, request:task.request, specialty:task.specialty, steps:task.steps, status:task.status,
    }, apiRequestOptions).then(() => undefined);
    const previous = taskWriteQueue.current.get(task.id) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(write);
    taskWriteQueue.current.set(task.id, pending);
    void pending.catch((error) => setWorkspaceError(readApiError(error, t('saveTaskFailed')))).finally(() => {
      if (taskWriteQueue.current.get(task.id) === pending) taskWriteQueue.current.delete(task.id);
    });
    return pending;
  };
  const patchTask = (id:string, updater:(task:Task)=>Task) => {
    const current = saved.tasks.find((task) => task.id === id);
    if (!current) return;
    const updated = updater(current);
    setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((task) => task.id === id ? updated : task) }));
    if (authUser && !current.demo) {
      void saveRemoteTask(updated).catch(async (error) => {
        setWorkspaceError(readApiError(error, t('saveTaskFailed')));
        try {
          const workspace = await getWorkspace(apiRequestOptions);
          if (authUser) applyWorkspace(workspace, authUser.email);
        } catch {
          // Keep the visible save error if the server cannot be refreshed.
        }
      });
    }
  };
  const toggleLanguage = () => setSaved((prev) => ({ ...prev, language:prev.language === 'ar' ? 'en' : 'ar' }));
  const createPlan = async (event:FormEvent) => {
    event.preventDefault();
    const cleanRequest = cleanSubmittedRequest(request);
    if (!cleanRequest || planGenerating) return;
    if (!authUser) { setWorkspaceError(isAr ? 'سجّل الدخول أولاً لإنشاء خطة بالذكاء الاصطناعي.' : 'Sign in first to generate an AI project plan.'); return; }
    setPlanGenerating(true);
    setWorkspaceError('');
    try {
      const response = await fetch('/api/ai/project-plan', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({ request:cleanRequest, specialty:selectedSpecialty, language }) });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.details) ? data.details.filter((item:unknown)=>typeof item==='string').join(' · ') : '';
        throw new Error([data.error || (isAr ? 'تعذر إنشاء الخطة.' : 'Could not generate the plan.'),details].filter(Boolean).join(' — '));
      }
      if (!data.title || !Array.isArray(data.steps) || data.steps.length < 3) throw new Error(isAr ? 'الخطة التي وصلت غير مكتملة.' : 'The returned plan is incomplete.');
      const steps:PlanStep[] = data.steps.map((step:{text:string;output?:string;complete?:string}) => ({ id:crypto.randomUUID(), text:step.text, output:step.output || '', complete:step.complete || '', state:'pending' as StepState }));
      const task:Task = { id:'task-'+Date.now(), title:String(data.title).slice(0,120), request:cleanRequest, specialty:selectedSpecialty, steps, status:'review', createdAt:new Date().toISOString() };
      const remote = await apiCreateTask({ title:task.title, request:task.request, specialty:task.specialty, steps:task.steps, status:task.status }, apiRequestOptions);
      const savedTask = remote as Task;
      setSaved((prev) => ({ ...prev, tasks:[savedTask,...prev.tasks] }));
      setRequest('');
      setSelectedTaskId(savedTask.id);
      setLocation('/workbench?task='+savedTask.id+'&focus=task-plan');
    } catch (error) { setWorkspaceError(readApiError(error, isAr ? 'تعذر إنشاء الخطة بالذكاء الاصطناعي.' : 'AI plan generation failed.')); }
    finally { setPlanGenerating(false); }
  };
    const executeStep = async (task:Task, step:PlanStep, fromProjectRun = false): Promise<{ result:string; executedAt:string } | null> => {
    if (taskExecutionLockRef.current || (projectRunLockRef.current && !fromProjectRun)) return null;
    if (!authUser) { setExecutionError(isAr ? 'سجّل الدخول أولاً لتنفيذ المرحلة.' : 'Sign in before executing this stage.'); return null; }
    if (step.state !== 'approved') { setExecutionError(isAr ? 'يجب اعتماد هذه المرحلة أولاً.' : 'Approve this stage before execution.'); return null; }
    if (step.result) { setExecutionError(isAr ? 'هذه المرحلة لها مخرج محفوظ بالفعل.' : 'This stage already has a saved result.'); return null; }
    taskExecutionLockRef.current = true;
    setExecutingStepId(step.id);
    setExecutionError('');
    try {
      const response = await fetch('/api/ai/execute-step', {
        method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'},
        body:JSON.stringify({taskId:task.id,stepId:step.id,language}),
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : (isAr ? 'تعذر تنفيذ الخطوة.' : 'Could not execute this step.'));
      if (typeof data.result !== 'string' || !data.result.trim()) throw new Error(isAr ? 'لم يصل مخرج صالح من الذكاء الاصطناعي.' : 'The AI returned no usable deliverable.');
      // A generated project file is saved to the private Assets workspace automatically.
      // Keep the successfully completed stage even if the separate file upload fails.
      try {
        await persistTaskDeliverable(data.result, task.id, task.title);
      } catch (artifactError) {
        const detail = artifactError instanceof Error ? artifactError.message : '';
        setWorkspaceError(isAr
          ? 'تم تنفيذ المرحلة وحفظ نتيجتها، لكن تعذر حفظ الملف في الأصول. يمكنك إعادة حفظه من بطاقة المرحلة. ' + detail
          : 'The stage completed and its result was saved, but the file could not be added to Assets. You can save it again from the stage card. ' + detail);
      }
      setSaved(prev=>({...prev,tasks:prev.tasks.map(item=>item.id===task.id?{...item,steps:item.steps.map(current=>current.id===step.id?{...current,result:data.result,executedAt:data.executedAt,executionStatus:"succeeded",executionError:undefined}:current)}:item)}));
      return { result:data.result, executedAt:data.executedAt };
    } catch(error) {
      setExecutionError(error instanceof Error ? error.message : (isAr ? 'تعذر تنفيذ الخطوة.' : 'Could not execute this step.'));
      try {
        const workspace = await getWorkspace(apiRequestOptions);
        if (authUser) applyWorkspace(workspace, authUser.email);
      } catch { /* Keep the execution error visible if refresh is unavailable. */ }
    } finally { taskExecutionLockRef.current = false; setExecutingStepId(null); }
    return null;
  };

  const approveAndRunRemaining = async (task:Task) => {
    if (!authUser) { setWorkspaceError(isAr ? 'سجّل الدخول أولاً لتشغيل المشروع.' : 'Sign in before running the project.'); return; }
    if (task.demo) { setWorkspaceError(isAr ? 'هذه مهمة عرض تجريبية ولا يمكن تنفيذها.' : 'This is a demo task and cannot be executed.'); return; }
    if (task.status === 'paused' || task.status === 'stopped') { setWorkspaceError(isAr ? 'استأنف المشروع قبل التنفيذ.' : 'Resume the project before execution.'); return; }
    if (projectRunLockRef.current || taskExecutionLockRef.current || approvalLockRef.current || commentSubmissionLockRef.current || executingStepId) return;
    projectRunLockRef.current = true;
    setWorkspaceError('');
    setExecutionError('');
    let workingTask = task;
    let ranAny = false;
    try {
      for (let index = 0; index < workingTask.steps.length; index += 1) {
        let currentStep = workingTask.steps[index];
        if (currentStep.result) continue;
        if (workingTask.steps.slice(0, index).some((step) => !step.result)) {
          setWorkspaceError(isAr ? 'توقّف التنفيذ: المرحلة السابقة لم تُنتج مخرجًا محفوظًا بعد.' : 'Execution stopped: a previous stage has no saved deliverable.');
          return;
        }
        if (currentStep.state !== 'approved') {
          const approvedSteps = workingTask.steps.map((step, stepIndex) => stepIndex === index ? { ...step, state:'approved' as StepState, executionError:undefined } : step);
          const approvedTask:Task = { ...workingTask, steps:approvedSteps, status:approvedSteps.every((step) => step.state === 'approved') ? 'approved' : 'review' };
          try {
            await saveRemoteTask(approvedTask);
            workingTask = approvedTask;
            setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? approvedTask : item) }));
          } catch (error) {
            setWorkspaceError(readApiError(error, t('saveTaskFailed')));
            try { const workspace = await getWorkspace(apiRequestOptions); applyWorkspace(workspace, authUser.email); } catch { /* Preserve the last confirmed state. */ }
            return;
          }
          currentStep = workingTask.steps[index];
        }
        const execution = await executeStep(workingTask, currentStep, true);
        if (!execution) return;
        ranAny = true;
        const nextTask:Task = { ...workingTask, steps:workingTask.steps.map((step, stepIndex) => stepIndex === index ? { ...step, result:execution.result, executedAt:execution.executedAt, executionStatus:'succeeded' as const, executionError:undefined } : step) };
        workingTask = nextTask;
        setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? nextTask : item) }));
      }
      if (!ranAny && workingTask.steps.every((step) => Boolean(step.result))) {
        setWorkspaceError(isAr ? 'كل مراحل المشروع منفذة بالفعل ومخرجاتها محفوظة.' : 'Every project stage has already been executed and saved.');
      }
    } finally {
      projectRunLockRef.current = false;
    }
  };

  const handleAuthSubmit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthWorking(true);
    setAuthError('');
    setAuthNotice('');
    setWorkspaceError('');
    try {
      const credentials = { email:authEmail.trim(), password:authPassword };
      const result = authMode === 'signup'
        ? await apiSignUp(credentials, apiRequestOptions)
        : await apiSignIn(credentials, apiRequestOptions);
      if (result.emailConfirmationRequired) {
        setAuthNotice(t('emailConfirmation'));
        setAuthMode('login');
        setAuthPassword('');
        return;
      }
      if (!result.user) throw new Error(t('apiUnavailable'));
      const accountUser = result.user;
      setAuthUser(accountUser);
      setWorkspaceLoaded(false);
      setSaved((prev) => ({ ...prev, tasks:readWorkspaceTaskCache(accountUser.id), name:defaultDisplayName, org:isAr ? 'مساحة العمل' : 'Workspace' }));
      setProfileName('');
      setProfileOrg(isAr ? 'مساحة العمل' : 'Workspace');
      const workspace = await getWorkspace(apiRequestOptions);
      applyWorkspace(workspace, accountUser.email);
      setAuthPassword('');
    } catch (error) {
      setWorkspaceLoadError(readApiError(error, t('apiUnavailable')));
      setWorkspaceLoaded(true);
      setAuthError(readApiError(error, t('apiUnavailable')));
    } finally {
      setAuthWorking(false);
    }
  };
  const handleSignOut = async () => {
    setAuthWorking(true);
    try {
      await apiSignOut(apiRequestOptions);
    } catch {
      // Clearing the local view is still required if the remote revoke is unavailable.
    } finally {
      setAuthUser(null);
      setWorkspaceLoaded(true);
      setAvatarPath(null);
      setWorkspaceError('');
      const local = readInitial();
      setSaved(local);
      setProfileName(local.name);
      setProfileOrg(local.org);
      setAuthPassword('');
      setAuthNotice('');
      setAuthError('');
      setAuthWorking(false);
    }
  };
  const handleSaveProfile = async () => {
    const displayName = profileName.trim();
    const organization = profileOrg.trim() || org;
    setWorkspaceError('');
    if (authUser) {
      try {
        const profile = await apiUpdateProfile({ displayName, organization }, apiRequestOptions);
        setProfileName(profile.displayName);
        setProfileOrg(profile.organization);
        setSaved((prev) => ({ ...prev, name:profile.displayName.trim() || defaultDisplayName, org:profile.organization.trim() || org }));
        setAuthNotice(t('profileSaved'));
      } catch (error) {
        setWorkspaceError(readApiError(error, t('saveTaskFailed')));
        return;
      }
    } else {
      setProfileName(displayName);
      setSaved((prev) => ({ ...prev, name:displayName || defaultDisplayName, org:organization }));
    }
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2200);
  };
  const handleAvatarUpload = async (event:ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
      setWorkspaceError(t('avatarHint'));
      return;
    }
    setAvatarWorking(true);
    setWorkspaceError('');
    try {
      const result = await apiUploadAvatar(file, { ...apiRequestOptions, headers:{'Content-Type':file.type} });
      setAvatarPath(result.path);
      setAvatarVersion(Date.now());
      setAuthNotice(t('profileSaved'));
    } catch (error) {
      setWorkspaceError(readApiError(error, t('saveTaskFailed')));
    } finally {
      setAvatarWorking(false);
    }
  };
  const approveStep = async (task:Task, stepId:string) => {
    const stepIndex = task.steps.findIndex((step) => step.id === stepId);
    if (approvalLockRef.current || projectRunLockRef.current || taskExecutionLockRef.current || commentSubmissionLockRef.current || stepIndex < 0 || task.status !== 'review' || executingStepId) return;
    const firstOpen = task.steps.findIndex((step) => step.state !== 'approved');
    if (stepIndex !== firstOpen) return;
    if (task.steps.slice(0, stepIndex).some((step) => !step.result?.trim())) {
      setExecutionError(isAr ? 'لا يمكن اعتماد المرحلة التالية قبل حفظ مخرج المرحلة السابقة بنجاح.' : 'The previous stage must produce and save its deliverable before the next stage can be approved.');
      return;
    }
    approvalLockRef.current = true;
    const steps = task.steps.map((step) => step.id === stepId ? { ...step, state:'approved' as StepState } : step);
    const approvedStep = steps[stepIndex];
    const updatedTask = { ...task, steps, status:steps.every((step) => step.state === 'approved') ? 'approved' as TaskStatus : 'review' as TaskStatus };
    setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? updatedTask : item) }));
    try {
      if (!authUser || task.demo) throw new Error(isAr ? 'سجّل الدخول لتنفيذ المرحلة.' : 'Sign in to execute this stage.');
      await saveRemoteTask(updatedTask);
      await executeStep(updatedTask, approvedStep);
    } catch (error) {
      setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? task : item) }));
      try { const workspace = await getWorkspace(apiRequestOptions); if (authUser) applyWorkspace(workspace, authUser.email); } catch { /* Keep the local rollback. */ }
      setWorkspaceError(readApiError(error, t('saveTaskFailed')));
    } finally { approvalLockRef.current = false; }
  };

  const requestStepRevision = async (task:Task, step:PlanStep) => {
    const note = (commentDrafts[step.id] ?? '').trim();
    if (!authUser || !step.result || !note || executingStepId) return;
    setExecutingStepId(step.id);
    setWorkspaceError('');
    try {
      const response = await fetch('/api/tasks/' + encodeURIComponent(task.id) + '/revise-step', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({stepId:step.id,note}) });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : (isAr ? 'تعذر تسجيل طلب التعديل.' : 'Could not save the revision request.'));
      const workspace = await getWorkspace(apiRequestOptions);
      applyWorkspace(workspace, authUser.email);
      setCommentDrafts((prev)=>({...prev,[step.id]:''}));
    } catch(error) {
      setWorkspaceError(readApiError(error, isAr ? 'تعذر تسجيل طلب التعديل.' : 'Could not save the revision request.'));
    } finally { setExecutingStepId(null); }
  };
  const addStepComment = async (task:Task, stepId:string) => {
    const text = (commentDrafts[stepId] ?? '').trim();
    if (!text || text.length > 2000 || !authUser || executingStepId || commentSubmissionLockRef.current || projectRunLockRef.current || taskExecutionLockRef.current || approvalLockRef.current) return;
    const target = task.steps.find((step) => step.id === stepId);
    if (!target || (target.comments?.length ?? 0) >= 50) return;
    commentSubmissionLockRef.current = true;
    const note:PlanStepNote = { id:crypto.randomUUID(), author:'user', text, createdAt:new Date().toISOString() };
    const updatedTask:Task = { ...task, steps:task.steps.map((step) => step.id === stepId ? { ...step, comments:[...(step.comments ?? []), note] } : step) };
    setExecutingStepId(stepId);
    setWorkspaceError('');
    setStepCommentErrors((prev) => ({ ...prev, [stepId]:'' }));
    setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? updatedTask : item) }));
    try {
      await saveRemoteTask(updatedTask);
      setCommentDrafts((prev) => ({ ...prev, [stepId]:'' }));
      const response = await fetch('/api/ai/respond-to-step-comment', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({ taskId:task.id, stepId, commentId:note.id, language }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : (isAr ? 'تم حفظ التعليق لكن تعذر على العمدة الرد.' : 'The comment was saved, but AL OMDA could not reply.'));
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error(isAr ? 'تم حفظ التعليق لكن العمدة لم يُرجع ردًا.' : 'The comment was saved, but AL OMDA returned no reply.');
      const assistantNote:PlanStepNote = { id:'assistant-' + note.id, author:'assistant', text:data.reply.trim(), createdAt:new Date().toISOString() };
      setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? { ...item, steps:item.steps.map((step) => step.id === stepId ? { ...step, comments:[...(step.comments ?? []), assistantNote].filter((item,index,array)=>array.findIndex((candidate)=>candidate.id===item.id)===index).slice(-50) } : step) } : item) }));
      try { const workspace = await getWorkspace(apiRequestOptions); applyWorkspace(workspace, authUser.email); } catch { /* The confirmed assistant reply is already visible locally. */ }
    } catch (error) {
      const message = readApiError(error, isAr ? 'تعذر على العمدة الرد على التعليق.' : 'AL OMDA could not reply to the comment.');
      setStepCommentErrors((prev) => ({ ...prev, [stepId]:message }));
      setWorkspaceError(message);
      try { const workspace = await getWorkspace(apiRequestOptions); if (authUser) applyWorkspace(workspace, authUser.email); } catch { /* Keep the saved comment and visible error. */ }
    } finally {
      commentSubmissionLockRef.current = false;
      setExecutingStepId(null);
    }
  };

  const rejectStep = (task:Task, stepId:string) => {
    const firstOpen = task.steps.findIndex((step) => step.state !== 'approved');
    if (task.status !== 'review' || task.steps[firstOpen]?.id !== stepId) return;
    patchTask(task.id, (prev) => ({ ...prev, steps:prev.steps.map((step) => step.id === stepId ? { ...step, state:'rejected' as StepState } : step) }));
  };
  const changeStep = (task:Task, stepId:string, values:{text:string;output:string;complete:string}) => patchTask(task.id, (prev) => ({ ...prev, steps:prev.steps.map((step) => step.id === stepId ? { ...step, ...values, state:step.state === 'rejected' ? 'pending' : step.state } : step) }));
  const statusLabel = (status:TaskStatus) => t(taskStatusKey(status));

  const navLink = (item:typeof navItems[number], mobile = false) => {
    const Icon = item.icon;
    const active = item.path === '/' ? path === '/' : path.startsWith(item.path);
    return <Link key={item.path} href={navigationHref(item.path)} onClick={()=>setCurtainOpen(false)} className={`${mobile ? 'mobile-nav-link' : 'nav-link'}${mobile && item.path === '/ai' ? ' mobile-chat-link' : ''}${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={`link-${item.key}`}>
      <Icon size={17} strokeWidth={1.8}/><span>{t(item.key)}</span>
    </Link>;
  };
  const commandAssetMatches = useMemo(() => {
    const needle = commandQuery.trim().toLocaleLowerCase();
    if(!needle)return [];
    return commandAssets.filter(asset=>(asset.name+' '+(asset.mimeType||'')).toLocaleLowerCase().includes(needle)).slice(0,12);
  }, [commandAssets, commandQuery]);
  const commandNavigationMatches = useMemo(() => {
    const needle = commandQuery.trim().toLocaleLowerCase();
    const entries = [
      { path:'/', ar:'لوحة التحكم', en:'Dashboard' },
      { path:'/projects', ar:'المشاريع', en:'Projects' },
      { path:'/pipeline', ar:'مسار العمل', en:'Pipeline' },
      { path:'/assets', ar:'الأصول والملفات', en:'Assets and files' },
      { path:'/workbench', ar:'مشروع جديد', en:'New project' },
      { path:'/history', ar:'سجل المهام', en:'Task history' },
      { path:'/ai', ar:'المحادثات', en:'Chats' },
      { path:'/agents', ar:'شبكة الوكلاء', en:'Agent network' },
      { path:'/profile', ar:'الإعدادات', en:'Settings' },
      ...Object.entries(platformStatusPages).map(([path, info])=>({path,ar:info.ar,en:info.en})),
    ];
    return entries.filter(item=>!needle||((item.ar+' '+item.en).toLocaleLowerCase().includes(needle))).slice(0,12);
  }, [commandQuery, isAr]);
  const commandMatches = useMemo(() => {
    const needle = commandQuery.trim().toLocaleLowerCase();
    const realTasks = tasks.filter(task=>!task.demo);
    const matches = realTasks.flatMap(task => {
      const taskMatch = !needle || `${task.title} ${task.request}`.toLocaleLowerCase().includes(needle);
      const outputMatches = task.steps.filter(step=>needle && `${step.text} ${step.output ?? ''} ${step.result ?? ''}`.toLocaleLowerCase().includes(needle));
      if (taskMatch) return [{task,detail:isAr?'مشروع':'Project'}];
      return outputMatches.map(step=>({task,detail:(isAr?'مخرج: ':'Output: ')+step.text}));
    });
    return matches.slice(0,12);
  }, [tasks, commandQuery, isAr]);
  const downloadCommandAsset = async (asset:CommandAsset) => {
    try {
      const response = await fetch('/api/storage/assets/download?path='+encodeURIComponent(asset.path),{credentials:'same-origin'});
      if(!response.ok)throw new Error(isAr?'تعذر تنزيل الملف.':'Could not download the file.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href=url;link.download=asset.name;document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) {
      setWorkspaceError(error instanceof Error?error.message:(isAr?'تعذر تنزيل الملف.':'Could not download the file.'));
    }
  };
  const label = (id:Specialty) => t(specialtyKey(id));
  const count = (task:Task) => task.steps.filter((step) => step.state === 'approved').length;
  const executionCount = (task:Task) => task.steps.filter((step) => step.executionStatus === 'succeeded' && Boolean(step.result)).length;

  const pageHeading = (eyebrow:string, title:string, subtitle:string, action?:ReactNode) => <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
  const platformStatusPage = (route:string) => {
    const info = platformStatusPages[route as keyof typeof platformStatusPages];
    if (!info) return notFoundPage(isAr?'الصفحة غير موجودة':'Page not found',isAr?'هذا القسم غير متاح.':'This section is unavailable.','/',isAr?'العودة للرئيسية':'Back to dashboard');
    const isActiveUsersPage = route === '/finance/active-users';
    const exportActiveUsers = () => {
      const isLive = Boolean(!authLoading && authUser && liveUserAnalytics);
      const rows = [
        ['Metric','Value','Data status'],
        ['Active users (last 30 days)', isLive ? String(liveUserAnalytics!.active_users_30d) : authLoading || authUser ? 'Unavailable' : '23,214', isLive ? 'Live Supabase auth analytics' : authUser ? 'Live analytics unavailable' : 'Sample guest preview'],
        ['Growth vs previous 30 days', isLive && liveUserAnalytics!.growth_percent !== null ? liveUserAnalytics!.growth_percent + '%' : authLoading || authUser ? 'Unavailable' : '8.06%', isLive ? 'Calculated from sign-in activity' : authUser ? 'Live analytics unavailable' : 'Sample guest preview'],
        ['Location data', 'Not collected', 'No user coordinates are stored or exported'],
      ];
      const csv = '\\uFEFF' + rows.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
      const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const anchor = document.createElement('a'); anchor.href=url; anchor.download='al-omda-active-users.csv'; anchor.click(); URL.revokeObjectURL(url);
    };
    return <div className="page-enter">
      {pageHeading(isAr?'منصة العمدة':'AL OMDA PLATFORM',isAr?info.ar:info.en,isActiveUsersPage?(isAr?'لوحة تحليلات المستخدمين النشطين.':'Active users analytics dashboard.'):(isAr?'حالة تكامل المنصة ومصادر البيانات.':'Platform integration status and data sources.'))}
      {isActiveUsersPage && <section className="panel panel-pad" style={{marginTop:16,maxWidth:900}}>
        <div className="section-head"><h2 className="section-title">{isAr?'المستخدمون النشطون':'Active Users'}</h2><button type="button" className="button button-secondary" onClick={exportActiveUsers} disabled={authLoading}><Download size={15}/>{isAr?'تصدير':'Export'}</button></div>
        <div className="global-user-metrics">
          <div className="global-user-metric"><span>{isAr?'المستخدمون النشطون خلال آخر 30 يومًا':'Active users · last 30 days'}</span><strong>{authLoading || authUser ? (liveUserAnalytics ? liveUserAnalytics.active_users_30d.toLocaleString() : '—') : '23,214'}</strong><small>{authLoading || authUser ? (liveUserAnalytics ? (isAr?'بيانات حقيقية من تسجيلات الدخول':'Live sign-in analytics') : (liveUserAnalyticsError || (authLoading ? (isAr?'جارٍ التحقق من الحساب…':'Checking account…') : (isAr?'جارٍ تحميل البيانات الحقيقية…':'Loading live analytics…')))) : (isAr?'بيانات عرض للزوار':'Sample preview for guests')}</small></div>
          <div className="global-user-growth"><span>{isAr?'مقارنة بالـ30 يومًا السابقة':'Vs. previous 30 days'}</span><strong>{!authLoading && !authUser ? <><TrendingUp size={18}/> 8.06%</> : liveUserAnalytics && liveUserAnalytics.growth_percent !== null ? <><TrendingUp size={18}/> {liveUserAnalytics.growth_percent}%</> : '—'}</strong><small>{authLoading || authUser ? (liveUserAnalytics ? (isAr?'محسوبة من نشاط تسجيل الدخول':'Calculated from sign-in activity') : (isAr?'لا تتوفر بيانات كافية':'Not enough live data')) : (isAr?'قيمة تجريبية للزوار':'Sample preview for guests')}</small></div>
        </div>
        <p className="page-subtitle" style={{marginTop:14}}>{authUser ? (liveUserAnalytics ? (isAr?'البيانات محسوبة من تسجيلات الدخول خلال آخر 30 يومًا مقارنة بالـ30 يومًا السابقة.':'Figures are calculated from sign-ins in the last 30 days versus the previous 30 days.') : (isAr?'تعذر تحميل التحليلات الحقيقية حاليًا؛ لن يتم استبدالها بأرقام تجريبية.':'Live analytics are currently unavailable; sample figures are not substituted for signed-in users.')) : (isAr?'أنت تشاهد معاينة الزوار التجريبية. سجّل الدخول لعرض الأرقام الحقيقية من قاعدة البيانات.':'You are viewing the guest sample preview. Sign in to see real database analytics.')}</p>
      </section>}
      {!isActiveUsersPage && <section className="panel panel-pad" style={{marginTop:16,maxWidth:900}}>
        <div className="section-head"><h2 className="section-title">{isAr?info.sourceAr:info.sourceEn}</h2><span className="status-chip">{isAr?'غير مربوط':'Not connected'}</span></div>
        <p className="page-subtitle" style={{marginTop:12,lineHeight:1.8}}>{isAr?info.detailAr:info.detailEn}</p>
        <div className="notice-bar" style={{marginTop:16}}><ShieldCheck size={16}/><span>{isAr?'حماية من البيانات الوهمية: لن يعرض العمدة أرقامًا أو سجلات أو مواقع غير موجودة في مصدر متصل.':'Grounded data only: AL OMDA will not display invented figures, records, or locations without a connected source.'}</span></div>
      </section>}
    </div>;
  };
  const taskIcon = (id:Specialty, size=17) => {
    const Icon = specialties.find((item) => item.id === id)?.icon ?? Bot;
    return <Icon size={size} strokeWidth={1.7}/>;
  };
  const statusBadge = (status:TaskStatus) => <span className={`status-chip ${status}`}><span>{statusLabel(status)}</span></span>;

  const renderPlan = (task:Task) => {
    const activeIndex = task.steps.findIndex((step) => step.state !== 'approved');
    return <section className="panel plan-card" id="task-plan">
      <div className="plan-heading"><div><div className="eyebrow">{t('planIsDemo')}</div><h2 className="section-title" style={{marginTop:9}}>{t('yourPlan')}</h2></div><span className="section-meta">{count(task)}/{task.steps.length}</span></div>
      <div className="notice-bar" style={{margin:'15px 0 5px'}}><ShieldCheck size={15} style={{flex:'none'}}/><span>{planGenerating ? (isAr ? 'العمدة بيحلل طلبك وينشئ الخطة...' : 'AL OMDA is analyzing your request...') : (isAr ? 'الخطة تُنشأ بالذكاء الاصطناعي وتُحفظ للمراجعة؛ لا يبدأ التنفيذ قبل موافقتك.' : 'AI-generated plan saved for review; execution will not start before your approval.')}</span></div>
      {task.status === 'paused' && <div className="notice-bar" style={{marginTop:12}}><Pause size={14}/><span>{t('paused')}</span></div>}
      {task.steps.map((step,index) => {
        const isCurrent = task.status === 'review' && index === activeIndex;
        return <div className={`plan-step ${isCurrent ? 'step-current' : ''}`} key={step.id}>
          <div className={`step-number ${step.state}`}>{step.state === 'approved' ? <Check size={13}/> : index+1}</div>
          <div className="step-copy">
            {editId === step.id ? <div style={{display:'grid',gap:9}}>
              <label className="form-label">{isAr?'تفاصيل الخطوة':'Step details'}</label>
              <textarea className="step-edit" value={editText} onChange={(event) => setEditText(event.target.value)} aria-label={isAr?'تفاصيل الخطوة':'Step details'}/>
              <label className="form-label">{t('expectedOutput')}</label>
              <textarea className="step-edit" value={editOutput} onChange={(event) => setEditOutput(event.target.value)} aria-label={t('expectedOutput')} />
              <label className="form-label">{t('completionCheck')}</label>
              <textarea className="step-edit" value={editComplete} onChange={(event) => setEditComplete(event.target.value)} aria-label={t('completionCheck')} />
            </div> : <strong>{step.text}</strong>}
            <small>{step.state === 'approved' ? t('approvedStep') : step.state === 'rejected' ? t('rejectedStep') : isCurrent ? t('pendingStep') : ''}</small>
            {(() => { const guidance = getStepGuidance(task.specialty,index,language); return <div style={{display:'grid',gap:5,marginTop:9,padding:'9px 11px',borderRadius:8,background:'rgba(198,167,108,0.07)',border:'1px solid rgba(198,167,108,0.16)'}}>
              <div><small style={{display:'block',color:'#c6a76c',fontWeight:700,marginBottom:2}}>{t('expectedOutput')}</small><span style={{fontSize:12,lineHeight:1.6,color:'var(--text-secondary,#c5c8ce)'}}>{step.output ?? guidance.output}</span></div>
              <div><small style={{display:'block',color:'#c6a76c',fontWeight:700,marginBottom:2}}>{t('completionCheck')}</small><span style={{fontSize:12,lineHeight:1.6,color:'var(--text-secondary,#c5c8ce)'}}>{step.complete ?? guidance.complete}</span></div>
            </div>; })()}
            {step.result && <div style={{marginTop:12,padding:12,borderRadius:9,border:'1px solid rgba(74,190,145,.28)',background:'rgba(74,190,145,.06)'}}>
               <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:8,color:'#72d6ad',fontWeight:700,fontSize:12}}><CheckCheck size={14}/>{isAr?'المخرج المنفذ':'Executed deliverable'}{step.executedAt && <span style={{marginInlineStart:'auto',opacity:.7,fontWeight:400}}>{dateLabel(step.executedAt,language)}</span>}</div>
               {getTaskPresentation(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskPresentation(step.result)!.title}</strong>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskPowerPoint(getTaskPresentation(step.result)!,task.id).catch((error)=>setWorkspaceError(readApiError(error,isAr?"تعذر حفظ أو تنزيل ملف PowerPoint.":"Could not save or download the PowerPoint file.")))}><FileText size={14}/>{isAr?'حفظ وتنزيل عرض PowerPoint (.pptx)':'Save & download PowerPoint (.pptx)'}</button></div>
                 <div style={{display:'grid',gap:8}}>
                   {getTaskPresentation(step.result)!.slides.map((slide,index)=><article key={index} style={{padding:12,border:'1px solid var(--border,#59616c)',borderRadius:9,background:'var(--surface,#10151b)'}}>
                     <strong style={{display:'block',marginBottom:8}}>{index+1}. {slide.title}</strong>
                     <ul dir={isAr?'rtl':'ltr'} style={{margin:0,paddingInlineStart:22,lineHeight:1.8}}>{slide.bullets.map((bullet,i)=><li key={i}>{bullet}</li>)}</ul>
                     {slide.notes&&<small style={{display:'block',marginTop:8,color:'var(--text-secondary,#aeb4bd)'}}>{isAr?'ملاحظات المتحدث: ':'Speaker notes: '}{slide.notes}</small>}
                   </article>)}
                 </div>
               </div> : getTaskCodeProject(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskCodeProject(step.result)!.title}</strong>
                 <small style={{color:'var(--text-secondary,#aeb4bd)'}}>{getTaskCodeProject(step.result)!.framework} · {getTaskCodeProject(step.result)!.files.length} {isAr?'ملفات':'files'} · {isAr?'نقطة الدخول: ':'Entry: '}{getTaskCodeProject(step.result)!.entryPoint}</small>
                 <div style={{display:'grid',gap:7}}>
                   {getTaskCodeProject(step.result)!.files.map((file)=><details key={file.path} style={{border:'1px solid var(--border,#59616c)',borderRadius:8,padding:8}}>
                     <summary style={{cursor:'pointer',fontWeight:600,overflowWrap:'anywhere'}}>{file.path}</summary>
                     <pre style={{maxHeight:260,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12,padding:8,background:'var(--surface-muted,transparent)',borderRadius:6}}>{file.content}</pre>
                   </details>)}
                 </div>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskCodeProject(getTaskCodeProject(step.result)!,task.id).catch((error)=>setWorkspaceError(readApiError(error,isAr?"تعذر حفظ أو تنزيل حزمة المشروع.":"Could not save or download the project ZIP.")))}><Code2 size={14}/>{isAr?'حفظ وتنزيل المشروع كاملًا (.zip)':'Save & download full project (.zip)'}</button></div>
                 <small style={{color:'var(--text-secondary,#aeb4bd)'}}>{isAr?'أمر البناء: ':'Build command: '}{getTaskCodeProject(step.result)!.buildCommand}{getTaskCodeProject(step.result)!.testCommand ? ' · ' + (isAr?'الاختبار: ':'Test: ') + getTaskCodeProject(step.result)!.testCommand : ''}</small>
                 <small style={{color:'var(--text-secondary,#aeb4bd)'}}>{isAr?'تم تجهيز ملفات المصدر. لم يتم تشغيل البناء أو الاختبارات داخل الخادم؛ راجع README وشغّل الأوامر في بيئة تطوير آمنة.':'Source files are packaged. The hosted pipeline has not run build or tests; review README and run the commands in a trusted development environment.'}</small>
               </div> : getTaskHtmlApp(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{isAr?'معاينة التطبيق':'Application preview'}</strong>
                 <div style={{overflow:'hidden',border:'1px solid var(--border,#59616c)',borderRadius:10,background:'#fff'}}>
                   <iframe title={task.title} sandbox="allow-scripts" srcDoc={getTaskHtmlApp(step.result)!} style={{display:'block',width:'100%',height:430,border:0,background:'#fff'}} />
                 </div>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskHtml({title:task.title,html:getTaskHtmlApp(step.result)!},task.id).catch((error)=>setWorkspaceError(readApiError(error,isAr?"تعذر حفظ أو تنزيل ملف الموقع.":"Could not save or download the website file.")))}><FileText size={14}/>{isAr?'حفظ وتنزيل التطبيق HTML':'Save & download app (.html)'}</button></div>
                 <small style={{color:'var(--text-secondary,#aeb4bd)'}}>{isAr?'ملف HTML مستقل يعمل في المتصفح.':'A standalone HTML file that runs in a browser.'}</small>
               </div> : getTaskSpreadsheet(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskSpreadsheet(step.result)!.title}</strong>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskExcel(getTaskSpreadsheet(step.result)!,task.id).catch((error)=>setWorkspaceError(readApiError(error,isAr?"تعذر حفظ أو تنزيل ملف Excel.":"Could not save or download the Excel file.")))}><FileText size={14}/>{isAr?'حفظ وتنزيل ملف Excel (.xlsx)':'Save & download Excel (.xlsx)'}</button></div>
                 {renderTaskWorkbookPreview(getTaskSpreadsheet(step.result)!,isAr)}
               </div> : getTaskWordDocument(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskWordDocument(step.result)!.title}</strong>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskWord(getTaskWordDocument(step.result)!,task.id).catch((error)=>setWorkspaceError(readApiError(error,isAr?"تعذر حفظ أو تنزيل ملف Word.":"Could not save or download the Word file.")))}><FileText size={14}/>{isAr?'حفظ وتنزيل مستند Word (.docx)':'Save & download Word (.docx)'}</button></div>
                 <div style={{padding:12,border:'1px solid var(--border,#59616c)',borderRadius:9,background:'var(--surface,#10151b)'}}>
                   {getTaskWordDocument(step.result)!.paragraphs.map((p,i)=><p key={i} style={{margin:'5px 0',lineHeight:1.8}}>{p}</p>)}
                   <div style={{overflowX:'auto'}}><table dir={isAr?'rtl':'ltr'} style={{borderCollapse:'collapse',minWidth:480,width:'100%',fontSize:12}}><thead><tr>{getTaskWordDocument(step.result)!.columns.map((column,i)=><th key={i} style={{padding:8,border:'1px solid var(--border,#59616c)',background:'rgba(190,160,100,.13)',textAlign:'start'}}>{column}</th>)}</tr></thead><tbody>{getTaskWordDocument(step.result)!.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} style={{padding:8,border:'1px solid var(--border,#59616c)'}}>{cell}</td>)}</tr>)}</tbody></table></div>
                 </div>
               </div> : <pre style={{margin:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:12,lineHeight:1.8,color:'var(--text-primary,#e5e7eb)'}}>{step.result}</pre>}
             </div>}
             {step.comments && step.comments.length > 0 && <div style={{display:'grid',gap:8,marginTop:12}}><strong style={{fontSize:12}}>{isAr?'سجل التعليقات والتعديلات':'Comments & change log'}</strong>{step.comments.map((note)=><div key={note.id} style={{padding:'9px 11px',borderRadius:8,border:'1px solid var(--border,#59616c)',background:'var(--surface,#10151b)'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:5}}><small style={{fontWeight:700}}>{note.author==='user'?(isAr?'أنت':'You'):note.author==='system'?(isAr?'تقرير النظام':'System report'):(isAr?'العمدة':'AL OMDA')}</small><small style={{opacity:.65}}>{dateLabel(note.createdAt,language)}</small></div><div style={{fontSize:12,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{note.text}</div></div>)}</div>}
             <div style={{display:'grid',gap:7,marginTop:12}}><label className="form-label">{isAr?'تعليق أو تحديث على المرحلة':'Comment or progress update'}</label><textarea className="step-edit" rows={2} maxLength={2000} value={commentDrafts[step.id] ?? ''} onChange={(event)=>setCommentDrafts((prev)=>({...prev,[step.id]:event.target.value}))} placeholder={isAr?'مثال: أنجزت الجزء الأول، وهذه البيانات تحتاج تعديل...':'Example: I completed the first part; please revise these details...'} aria-label={isAr?'تعليق على المرحلة':'Step comment'}/><div className="step-actions"><button type="button" className="button button-quiet button-small" disabled={!(commentDrafts[step.id] ?? '').trim() || !authUser || (step.comments?.length ?? 0) >= 50} onClick={()=>void addStepComment(task,step.id)}><MessageSquareText size={13}/>{isAr?'إضافة التعليق':'Add comment'}</button></div></div>
             {stepCommentErrors[step.id] && <div className="notice-bar notice-error" role="alert" style={{marginTop:8}}>{stepCommentErrors[step.id]}</div>}
             {step.revisionHistory && step.revisionHistory.length > 0 && <div style={{display:'grid',gap:8,marginTop:12}}><strong style={{fontSize:12}}>{isAr?'سجل النسخ السابقة':'Previous versions'}</strong>{step.revisionHistory.map((revision,revisionIndex)=><details key={revision.revisionRequestedAt+revisionIndex} style={{padding:9,border:'1px solid var(--border,#59616c)',borderRadius:8}}><summary style={{cursor:'pointer',fontSize:12}}>{isAr?'النسخة السابقة':'Previous version'} · {dateLabel(revision.executedAt ?? revision.revisionRequestedAt,language)}</summary><p style={{fontSize:12,whiteSpace:'pre-wrap',lineHeight:1.7}}>{revision.note}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:12,maxHeight:260,overflow:'auto'}}>{revision.result}</pre></details>)}</div>}
             {step.result && <div className="step-actions" style={{marginTop:10}}><button type="button" className="button button-danger button-small" disabled={!!executingStepId || !authUser || !(commentDrafts[step.id] ?? '').trim()} onClick={()=>void requestStepRevision(task,step)}><RefreshCw size={13}/>{isAr?'طلب تعديل وإعادة تنفيذ':'Request revision & rerun'}</button></div>}
             {step.executionStatus === 'failed' && <div className="notice-bar notice-error" role="alert" style={{marginTop:10}}>{isAr?'فشل التنفيذ: ':'Execution failed: '}{step.executionError || (isAr?'حاول التنفيذ مرة أخرى.':'Try executing this step again.')}</div>}
             {step.state === 'approved' && !step.result && <div className="step-actions" style={{marginTop:10}}>
               <button type="button" className="button button-primary button-small" disabled={!!executingStepId || !authUser} onClick={()=>void executeStep(task,step)}>
                 <Sparkles size={13}/>{executingStepId===step.id?(isAr?'جارٍ التنفيذ...':'Executing...'):(isAr?'نفّذ الخطوة بالذكاء الاصطناعي':'Execute step with AI')}
               </button>
             </div>}
             {executionError && <div className="notice-bar notice-error" role="alert" style={{marginTop:9}}>{executionError}</div>}
             {isCurrent && task.status === 'review' && <div className="step-actions">
              {editId === step.id ? <><button className="button button-quiet button-small" onClick={() => { if (editText.trim() && editOutput.trim() && editComplete.trim()) changeStep(task,step.id,{text:editText.trim(),output:editOutput.trim(),complete:editComplete.trim()}); setEditId(null); }}>{t('save')}</button><button className="button button-quiet button-small" onClick={() => setEditId(null)}>{isAr?'إلغاء':'Cancel'}</button></> :
                <button className="button button-quiet button-small" onClick={() => { const guidance=getStepGuidance(task.specialty,index,language); setEditId(step.id); setEditText(step.text); setEditOutput(step.output ?? guidance.output); setEditComplete(step.complete ?? guidance.complete); }}><Edit3 size={12}/>{t('edit')}</button>}
              <button className="button button-primary button-small" disabled={editId === step.id} onClick={() => approveStep(task,step.id)}><Check size={12}/>{t('approve')}</button>
              <button className="button button-danger button-small" disabled={editId === step.id} onClick={() => rejectStep(task,step.id)}><X size={12}/>{t('reject')}</button>
            </div>}
          </div>
        </div>;
      })}
      {task.status === 'approved' && <div className="notice-bar" style={{marginTop:10}}><CheckCheck size={15}/><span>{t('allApproved')} {task.steps.every((step)=>Boolean(step.result)) ? (isAr?' تم تنفيذ كل المراحل وحفظ مخرجاتها.':' All stages have executed and their outputs are saved.') : (isAr?' توجد مراحل معتمدة تحتاج إلى تنفيذ أو إعادة محاولة.':' Approved stages remain to be executed or retried.')}</span></div>}
      {task.status !== 'paused' && task.status !== 'stopped' && task.steps.some((step)=>!step.result) && <div className="step-actions" style={{borderTop:'1px solid #2b3038',paddingTop:14,marginTop:12}}><button type="button" className="button button-primary" disabled={!!executingStepId || !authUser} onClick={()=>void approveAndRunRemaining(task)}><Sparkles size={14}/>{executingStepId ? (isAr?'جارٍ تنفيذ المشروع...':'Running project...') : t('approveAll')}</button><small className="section-meta">{isAr?'يعتمد كل مرحلة بالترتيب ثم ينفذها ويحفظ مخرجها قبل الانتقال إلى التالية. يتوقف عند أول خطأ أو مرحلة غير مكتملة.':'Approves and executes each stage in order, saving its deliverable before continuing. Stops at the first error or incomplete stage.'}</small></div>}
      {task.status === 'stopped' && <div className="notice-bar" style={{marginTop:10}}><StopCircle size={15}/><span>{t('stopped')}</span></div>}
      {task.status !== 'approved' && task.status !== 'stopped' && <div className="step-actions" style={{borderTop:'1px solid #2b3038',paddingTop:14,marginTop:8}}>
        <button className="button button-quiet button-small" onClick={() => patchTask(task.id,(prev)=>({...prev,status:prev.status === 'paused' ? 'review' : 'paused'}))}>
          {task.status === 'paused' ? <Play size={13}/> : <Pause size={13}/>} {task.status === 'paused' ? t('resume') : t('pause')}
        </button>
        <button className="button button-danger button-small" onClick={() => { if (window.confirm(t('confirmStop'))) patchTask(task.id,(prev)=>({...prev,status:'stopped'})); }}><StopCircle size={13}/>{t('stop')}</button>
      </div>}
    </section>;
  };

  const dashboardPage = () => {
    const dashboardTasks = tasks.filter((task) => !task.demo);
    const active = dashboardTasks.filter((task) => task.status === 'review' || task.status === 'paused').length;
    const approved = dashboardTasks.filter((task) => task.status === 'approved').length;
    const stopped = dashboardTasks.filter((task) => task.status === 'stopped').length;
    const total = dashboardTasks.length;
    const statusRows = [
      { label:isAr?'بانتظار المراجعة':'Needs review', value:dashboardTasks.filter(task=>task.status==='review').length, color:'var(--omda-accent)' },
      { label:isAr?'متوقفة مؤقتًا':'Paused', value:dashboardTasks.filter(task=>task.status==='paused').length, color:'var(--omda-accent-2)' },
      { label:isAr?'معتمدة':'Approved', value:approved, color:'#27d6b1' },
      { label:isAr?'متوقفة':'Stopped', value:stopped, color:'#ec6ca8' },
    ];
    const maxStatus = Math.max(1,...statusRows.map(row=>row.value));
    const specialtyRows = specialties.map(item=>({id:item.id,label:label(item.id),value:dashboardTasks.filter(task=>task.specialty===item.id).length,icon:item.icon})).sort((x,y)=>y.value-x.value);
    const maxSpecialty = Math.max(1,...specialtyRows.map(row=>row.value));
    const trend = [0,1,2,3,4,5,6].map((offset)=>dashboardTasks.filter(task=>{
      const date=new Date(task.createdAt); const now=new Date();
      return date.getMonth()===new Date(now.getFullYear(),now.getMonth()-offset,1).getMonth() && date.getFullYear()===new Date(now.getFullYear(),now.getMonth()-offset,1).getFullYear();
    }).length);
    const trendMax=Math.max(1,...trend);
    const trendPoints=trend.slice().reverse().map((value,index)=>`${24+index*44},${92-(value/trendMax)*72}`).join(' ');
    return <div className="page-enter dashboard-overview" id="dashboard-overview">
      <div className="dashboard-toolbar">
        <div><div className="eyebrow">{isAr?'مساحة العمل':'WORKSPACE'}</div><h1 className="page-title">{t('dashboard')}</h1><p className="page-subtitle">{t('hello')} {name} · {isAr?'نظرة عامة على نشاط العمدة':'Your AL OMDA activity at a glance'}</p></div>
        <div className="dashboard-toolbar-actions"><Link href={navigationHref("/ai")} className="button button-primary"><Bot size={15}/>{isAr?'ابدأ محادثة':'Start chat'}</Link><Link href={focusedHref("/workbench","request-input")} className="button button-quiet" data-testid="button-new-request"><Plus size={15}/>{t('newRequest')}</Link></div>
      </div>
      <section className="dashboard-pulse" aria-label={isAr?'ملخص حالة مساحة العمل':'Workspace status summary'}>
        <div className="dashboard-pulse-copy"><span className="eyebrow">{isAr?'حالة مساحة العمل':'WORKSPACE PULSE'}</span><strong>{active>0?(isAr?'لديك مهام تحتاج انتباهك':'Some tasks need your attention'):(isAr?'مساحة عملك تحت السيطرة':'Your workspace is up to date')}</strong><p>{isAr?'تابع المهام وارجع مباشرة إلى الخطوة التالية.':'Keep your work moving and jump straight to the next step.'}</p></div>
        <div className="dashboard-pulse-metrics"><div><strong>{active}</strong><span>{isAr?'تحتاج متابعة':'Needs attention'}</span></div><div><strong>{approved}</strong><span>{isAr?'معتمدة':'Approved'}</span></div><div><strong>{total}</strong><span>{isAr?'كل المهام':'All tasks'}</span></div></div>
        <Link href={active>0?focusedHref('/history?status=review','history-list'):focusedHref('/workbench','request-input')} className="button button-quiet dashboard-pulse-action">{active>0?(isAr?'راجع المهام':'Review tasks'):(isAr?'ابدأ مهمة':'Start a task')}<ArrowLeft size={14}/></Link>
      </section>
      <section className="app-launcher-section" aria-labelledby="app-launcher-title">
        <div className="app-launcher-heading">
          <div>
            <span className="eyebrow">{isAr?'مساحة التطبيقات':'APP LAUNCHER'}</span>
            <h2 id="app-launcher-title">{isAr?'كل أدواتك في مكان واحد':'Everything you need, one place'}</h2>
            <p>{isAr?'وصول سريع ومنظم إلى الوظائف الأساسية، مع فصل أدوات المتابعة والحساب.':'A clear shortcut grid for core work, analytics, and account tools.'}</p>
          </div>
          <span className="app-launcher-count">{isAr?(appLauncherGroups.reduce((n,g)=>n+g.items.length,0)+' أدوات'):(String(appLauncherGroups.reduce((n,g)=>n+g.items.length,0))+' TOOLS')}</span>
        </div>
        {appLauncherGroups.map(group=><div key={group.id} className="app-launcher-group">
          <div className="app-launcher-group-title">
            <strong>{isAr?group.titleAr:group.titleEn}</strong>
            <span>{isAr?group.subtitleAr:group.subtitleEn}</span>
          </div>
          <div className="app-launcher-grid">
            {group.items.map((item,index)=>{const Icon=item.icon;return <Link key={group.id+':'+index} href={navigationHref(item.path)} onClick={()=>{if(item.path==='/workbench'){setSelectedTaskId(null);setRequest('');}}} className="app-launcher-tile">
              <span className="app-launcher-icon"><Icon size={20} strokeWidth={1.8}/></span>
              <span className="app-launcher-copy"><strong>{isAr?item.ar:item.en}</strong><small>{isAr?item.subtitleAr:item.subtitleEn}</small></span>
              <ArrowUpLeft size={14} className="app-launcher-arrow"/>
            </Link>})}
          </div>
        </div>)}
      </section>
      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>{isAr?'ملخص الأداء':'Performance overview'}</h2><p>{isAr?'مؤشرات مهامك وخططك في مكان واحد':'Your tasks and plans in one place'}</p></div><span className="dashboard-period"><Activity size={13}/>{isAr?'كل الوقت':'All time'}</span></div>
        <div className="stats-grid dashboard-kpis">
          {[{label:isAr?'مهام تحتاج متابعة':'Needs attention',value:active,foot:isAr?'بانتظار المراجعة أو الاستكمال':'Review or continuation needed',icon:Activity,href:focusedHref('/history?status=review','history-list'),tone:'cyan'},{label:t('approvedPlans'),value:approved,foot:isAr?'خطط وافقت عليها':'Plans you approved',icon:BadgeCheck,href:focusedHref('/history?status=approved','history-list'),tone:'teal'},{label:isAr?'قوالب تخصص متاحة':'Specialty templates',value:specialties.length,foot:isAr?'قوالب التخصصات المتاحة':'Available specialty templates',icon:Bot,href:focusedHref('/agents','agent-marketplace-grid'),tone:'violet'},{label:t('totalTasks'),value:total,foot:isAr?'إجمالي المهام المسجلة':'All recorded tasks',icon:FileText,href:focusedHref('/history','history-list'),tone:'pink'}].map((stat,index)=><Link href={stat.href} className={`panel stat-card stat-card-link dashboard-kpi ${stat.tone}`} key={stat.label} data-testid={`stat-card-${index}`}><div className="stat-card-top"><span className="stat-label">{stat.label}</span><span className="dashboard-kpi-icon"><stat.icon size={17}/></span></div><div className="stat-value"><span>{stat.value}</span></div><div className="stat-foot">{stat.foot}</div></Link>)}
        </div>
      </section>
      <div className="dashboard-analytics-grid">
        <section className="panel dashboard-chart-card"><div className="section-head"><div><h2 className="section-title">{isAr?'مسار المهام':'Task pipeline'}</h2><p className="dashboard-card-subtitle">{isAr?'توزيع المهام حسب حالتها':'Tasks by current status'}</p></div><span className="dashboard-chart-menu">•••</span></div><div className="pipeline-chart" role="img" aria-label={isAr?'رسم يوضح أعداد المهام حسب الحالة':'Chart of task counts by status'}>{statusRows.map((row,index)=><div className="pipeline-column" key={row.label}><span className="pipeline-value">{row.value}</span><div className="pipeline-track"><span style={{height:`${Math.max(5,row.value/maxStatus*100)}%`,background:row.color}}/></div><small>{row.label}</small></div>)}</div></section>
        <section className="panel dashboard-chart-card"><div className="section-head"><div><h2 className="section-title">{isAr?'نشاط المهام':'Task activity'}</h2><p className="dashboard-card-subtitle">{isAr?'المهام المسجلة خلال الأشهر الماضية':'Tasks created over recent months'}</p></div><span className="dashboard-chart-menu">•••</span></div><div className="activity-chart" role="img" aria-label={isAr?'منحنى نشاط المهام':'Task activity trend'}><div className="activity-chart-scale"><span>{trendMax}</span><span>{Math.ceil(trendMax/2)}</span><span>0</span></div><svg viewBox="0 0 288 112" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="omdaTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--omda-accent)" stopOpacity=".32"/><stop offset="100%" stopColor="var(--omda-accent)" stopOpacity="0"/></linearGradient></defs><path d={`M ${trendPoints.replaceAll(' ',', ')} L 288,112 L 24,112 Z`} fill="url(#omdaTrendFill)"/><polyline points={trendPoints} fill="none" stroke="var(--omda-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/></svg><div className="activity-chart-labels">{[6,5,4,3,2,1,0].map(offset=><span key={offset}>{new Date(new Date().getFullYear(),new Date().getMonth()-offset,1).toLocaleDateString(language==='ar'?'ar':'en',{month:'short'})}</span>)}</div></div></section>
        <section className="panel dashboard-chart-card"><div className="section-head"><div><h2 className="section-title">{isAr?'المهام حسب التخصص':'Tasks by specialty'}</h2><p className="dashboard-card-subtitle">{isAr?'توزيع العمل على الوكلاء':'Workload across specialists'}</p></div><span className="dashboard-chart-menu">•••</span></div><div className="specialty-chart-list">{specialtyRows.map((row,index)=><div className="specialty-chart-row" key={row.id}><div className="specialty-chart-label"><span>{row.label}</span><strong>{row.value}</strong></div><div className="specialty-chart-track"><span style={{width:`${row.value/maxSpecialty*100}%`}} data-tone={index%4}/></div></div>)}</div></section>
      </div>
      <section className="panel dashboard-history-panel">
        <div className="dashboard-section-heading"><div><h2>{isAr?'سجل المهام':'Task history'}</h2><p>{isAr?'آخر المهام التي عملت عليها مع العمدة':'Your latest work with AL OMDA'}</p></div><Link href={focusedHref("/history","history-list")} className="button button-quiet">{isAr?'عرض الكل':'View all'} <ArrowLeft size={14}/></Link></div>
        <div className="dashboard-table-wrap"><table className="dashboard-task-table"><thead><tr><th>{isAr?'المهمة':'Task'}</th><th>{isAr?'التخصص':'Specialty'}</th><th>{isAr?'تاريخ الإنشاء':'Created'}</th><th>{isAr?'التقدم':'Progress'}</th><th>{isAr?'الحالة':'Status'}</th></tr></thead><tbody>{dashboardTasks.slice(0,6).map(task=><tr key={task.id}><td><Link href={focusedHref(`/history/${task.id}`,"task-plan")} className="dashboard-task-name"><span className="task-icon">{taskIcon(task.specialty,15)}</span><strong>{task.title}</strong></Link></td><td>{label(task.specialty)}</td><td>{dateLabel(task.createdAt,language)}</td><td><span className="dashboard-progress-cell"><span><i style={{width:`${task.steps.length?count(task)/task.steps.length*100:0}%`}}/></span>{count(task)}/{task.steps.length}</span></td><td>{statusBadge(task.status)}</td></tr>)}</tbody></table>{dashboardTasks.length===0&&<div className="dashboard-empty">{isAr?'لا توجد مهام بعد. ابدأ محادثة جديدة لإنشاء أول مهمة.':'No tasks yet. Start a chat to create your first task.'}</div>}</div>
      </section>
      <div className="notice-bar dashboard-security-note"><ShieldCheck size={15} style={{flex:'none'}}/><span>{authUser?t('authConfigured'):t('demoNotice')}</span></div>
    </div>;
  };

  useEffect(() => {
    try {
      if (localAgentSessionId) localStorage.setItem("al-omda-agent-session", localAgentSessionId);
      else localStorage.removeItem("al-omda-agent-session");
    } catch { /* Session ID persistence is optional when browser storage is unavailable. */ }
  }, [localAgentSessionId]);

  const withLocalRuntimeTimeout = async <T,>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 8000): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(isAr ? "انتهت مهلة الاتصال بالوكيل المحلي." : "Local runtime request timed out.");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };
  const callLocalAgentRuntime = async (endpoint: string, method: "GET" | "POST" | "DELETE" = "GET", body?: Record<string, unknown>) => {
    const base = getLocalAgentOrigin(localAgentUrl, isAr ? "عنوان الوكيل المحلي يجب أن يكون localhost أو 127.0.0.1." : "Local runtime URL must use localhost or 127.0.0.1.");
    if (!localAgentToken.trim()) throw new Error(isAr ? "أدخل مفتاح الاتصال المحلي." : "Enter the local runtime token.");
    return withLocalRuntimeTimeout(async (signal) => {
      const response = await fetch(base + endpoint, {
        method,
        headers: { authorization: "Bearer " + localAgentToken.trim(), ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Local agent runtime request failed.");
      return result;
    });
  };
  const streamLocalAgent = async (
    action: "run" | "resume" | "continue" | "delegate",
    body: Record<string, unknown>,
    onEvent: (event: { type: string; text?: string; status?: string; role?: string; agentCount?: number }) => void,
  ) => {
    const base = getLocalAgentOrigin(localAgentUrl, isAr ? "عنوان الوكيل المحلي يجب أن يكون localhost أو 127.0.0.1." : "Local runtime URL must use localhost or 127.0.0.1.");
    if (!localAgentToken.trim()) throw new Error(isAr ? "أدخل مفتاح الاتصال المحلي." : "Enter the local runtime token.");
    const response = await fetch(base + "/v1/agent/stream", {
      method: "POST",
      headers: { authorization: "Bearer " + localAgentToken.trim(), "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    return await readAgentEventStream(response, onEvent);
  };
  const checkLocalAgent = async () => {
    const checkedUrl = localAgentUrl.trim();
    setLocalAgentBusy(true); setLocalAgentStatus("checking"); setLocalAgentMessage("");
    try {
      const healthUrl = new URL(checkedUrl);
      if (healthUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(healthUrl.hostname)) throw new Error(isAr ? "استخدم عنوان الجهاز المحلي فقط." : "Use a localhost runtime URL only.");
      const health = await withLocalRuntimeTimeout(async (signal) => {
        const response = await fetch(healthUrl.origin + "/health", { signal });
        if (!response.ok) throw new Error("Local runtime is not responding.");
        return response.json();
      });
      const tools = await callLocalAgentRuntime("/v1/tools");
      setLocalAgentStatus("ready");
      setLocalAgentMessage((isAr ? "متصل · " : "Connected · ") + String(tools.tools?.length || 0) + (isAr ? " أداة متاحة" : " tools available") + " · " + String(health.execution || "disabled"));
    } catch (error) {
      setLocalAgentStatus("error");
      setLocalAgentMessage(error instanceof Error ? error.message : (isAr ? "تعذر الاتصال بالوكيل المحلي." : "Could not connect to local runtime."));
    } finally { setLocalAgentBusy(false); }
  };
  const runLocalAgent = async () => {
    if (!localAgentGoal.trim() || localAgentBusy) return;
    setLocalAgentBusy(true); setLocalAgentStatus("running"); setLocalAgentMessage("");
    try {
      let streamedText = "";
      const startedAt = Date.now();
      const result = await streamLocalAgent("run", { goal: localAgentGoal.trim() }, (event) => {
        if (event.type === "token" && event.text) {
          streamedText += event.text;
          const seconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
          const estimated = Math.round((streamedText.length / 4) / seconds);
          setLocalAgentMessage(streamedText + "\n\n" + (isAr ? "سرعة مباشرة تقريبية: " : "Live estimate: ") + estimated + " tok/s");
        } else if (event.type === "status" && event.status === "using_tools" && !streamedText) {
          setLocalAgentMessage(isAr ? "الوكيل يجهّز الأدوات وينفّذ الخطوات..." : "Agent is selecting tools and executing steps...");
        }
      });
      setLocalAgentSessionId(String(result.sessionId || ""));
      setLocalAgentPending(Array.isArray(result.pending) ? result.pending : []);
      const speed = Number((result.usage as any)?.averageTokensPerSecond || 0);
      const message = String(result.message || (result.status === "approval_required" ? (isAr ? "الوكيل محتاج موافقتك على إجراءات." : "The agent needs your approval for actions.") : streamedText));
      setLocalAgentMessage(message + (speed > 0 ? " · " + speed + " tok/s avg" : ""));
      setLocalAgentStatus(result.status === "approval_required" ? "approval" : result.status === "completed" || result.status === "limit_reached" ? "ready" : "error");
    } catch (error) {
      setLocalAgentStatus("error"); setLocalAgentMessage(error instanceof Error ? error.message : "Agent run failed.");
    } finally { setLocalAgentBusy(false); }
  };
  const runLocalAgentDelegation = async () => {
    const tasks = [
      { role: delegateRoleOne.trim() || "Specialist 1", goal: delegateGoalOne.trim(), mode: delegateModeOne },
      { role: delegateRoleTwo.trim() || "Specialist 2", goal: delegateGoalTwo.trim(), mode: delegateModeTwo },
    ];
    if (tasks.some((task) => !task.goal) || delegateBusy || !localAgentToken.trim()) return;
    setDelegateBusy(true); setDelegateError(""); setDelegateResults([]);
    try {
      const result = await streamLocalAgent("delegate", { tasks }, (event) => {
        if (event.type === "status" && event.status === "delegating") {
          setLocalAgentMessage(isAr ? "جارٍ تشغيل " + (event.agentCount || 2) + " وكلاء متخصصين بالتوازي..." : "Launching " + (event.agentCount || 2) + " specialist agents in parallel...");
        } else if (event.type === "status" && event.status === "specialist_started") {
          setLocalAgentMessage((isAr ? "بدأ الوكيل: " : "Started specialist: ") + (event.role || ""));
        } else if (event.type === "status" && event.status === "specialist_completed") {
          setLocalAgentMessage((isAr ? "اكتمل تحليل: " : "Completed review: ") + (event.role || ""));
        }
      });
      const agents = Array.isArray(result.agents) ? result.agents.map((item: any) => ({
        role: String(item.role || "Specialist"),
        mode: item.mode === "proposal" ? "proposal" as const : "read_only" as const,
        result: String(item.result || ""),
        proposalDirectory: typeof item.proposalDirectory === "string" ? item.proposalDirectory : undefined,
        proposalFiles: Array.isArray(item.proposalFiles) ? item.proposalFiles.map((file: any) => ({ path: String(file.path || ""), bytes: Number(file.bytes || 0) })) : [],
        error: typeof item.error === "string" ? item.error : undefined,
        turns: typeof item.turns === "number" ? item.turns : undefined,
        evidence: Array.isArray(item.evidence) ? item.evidence.map((entry: any) => ({ tool: String(entry.tool || "tool"), summary: String(entry.summary || "") })) : [],
      })) : [];
      setDelegateResults(agents);
      if (result.sessionId) setLocalAgentSessionId(String(result.sessionId));
      setLocalAgentMessage(isAr ? "اكتمل تشغيل الوكلاء. أي ملفات مقترحة محفوظة في مساحات معزولة ولم تُطبّق على المشروع." : "Delegation completed. Any proposed files remain isolated and were not applied to the project.");
    } catch (error) {
      setDelegateError(error instanceof Error ? error.message : (isAr ? "فشل تشغيل الوكلاء المتوازيين." : "Parallel delegation failed."));
    } finally { setDelegateBusy(false); }
  };

  const resumeLocalAgent = async () => {
    if (!localAgentSessionId || localAgentBusy) return;
    setLocalAgentBusy(true); setLocalAgentStatus("running"); setLocalAgentMessage("");
    try {
      let streamedText = "";
      const startedAt = Date.now();
      const result = await streamLocalAgent("resume", { sessionId: localAgentSessionId }, (event) => {
        if (event.type === "token" && event.text) {
          streamedText += event.text;
          const seconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
          setLocalAgentMessage(streamedText + "\n\n" + (isAr ? "سرعة مباشرة تقريبية: " : "Live estimate: ") + Math.round((streamedText.length / 4) / seconds) + " tok/s");
        }
      });
      setLocalAgentPending(Array.isArray(result.pending) ? result.pending : []);
      const speed = Number((result.usage as any)?.averageTokensPerSecond || 0);
      const message = String(result.message || (result.status === "approval_required" ? (isAr ? "الجلسة المحفوظة تنتظر موافقتك." : "Saved session is waiting for your approval.") : streamedText));
      setLocalAgentMessage(message + (speed > 0 ? " · " + speed + " tok/s avg" : ""));
      setLocalAgentStatus(result.status === "approval_required" ? "approval" : result.status === "completed" || result.status === "limit_reached" ? "ready" : "error");
    } catch (error) {
      setLocalAgentStatus("error"); setLocalAgentMessage(error instanceof Error ? error.message : "Could not resume saved agent session.");
    } finally { setLocalAgentBusy(false); }
  };
  const continueLocalAgent = async (approve: boolean) => {
    if (!localAgentSessionId || localAgentBusy) return;
    setLocalAgentBusy(true); setLocalAgentStatus("running");
    try {
      let streamedText = "";
      const startedAt = Date.now();
      const result = await streamLocalAgent("continue", {
        sessionId: localAgentSessionId,
        approvedCallIds: approve ? localAgentPending.map((item) => item.id) : [],
      }, (event) => {
        if (event.type === "token" && event.text) {
          streamedText += event.text;
          const seconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
          setLocalAgentMessage(streamedText + "\n\n" + (isAr ? "سرعة مباشرة تقريبية: " : "Live estimate: ") + Math.round((streamedText.length / 4) / seconds) + " tok/s");
        }
      });
      setLocalAgentPending(Array.isArray(result.pending) ? result.pending : []);
      const speed = Number((result.usage as any)?.averageTokensPerSecond || 0);
      const message = String(result.message || (result.status === "approval_required" ? (isAr ? "هناك إجراء آخر ينتظر موافقتك." : "Another action needs your approval.") : streamedText));
      setLocalAgentMessage(message + (speed > 0 ? " · " + speed + " tok/s avg" : ""));
      setLocalAgentStatus(result.status === "approval_required" ? "approval" : result.status === "completed" || result.status === "limit_reached" ? "ready" : "error");
    } catch (error) {
      setLocalAgentStatus("error"); setLocalAgentMessage(error instanceof Error ? error.message : "Could not resume agent session.");
    } finally { setLocalAgentBusy(false); }
  };

  const loadLocalModelHealth = async () => {
    const requestId = ++modelProviderRequestRef.current;
    setModelHealthBusy(true);
    setModelHealthError("");
    try {
      const [inventory, health] = await Promise.all([
        callLocalAgentRuntime("/v1/models/providers"),
        callLocalAgentRuntime("/v1/models/health"),
      ]);
      if (requestId !== modelProviderRequestRef.current) return;
      const providers = parseModelProviderInfo(inventory.providers);
      setLocalModelProviders(providers);
      setLocalModelHealth(parseModelProviderHealth(health.providers));
      if (!providers.length) setModelProvidersError(isAr ? "لم يتم إعداد أي مزود موديلات بعد." : "No model providers are configured yet.");
      else setModelProvidersError("");
    } catch (error) {
      if (requestId !== modelProviderRequestRef.current) return;
      setModelHealthError(error instanceof Error ? error.message : (isAr ? "تعذر فحص مزودي الموديلات." : "Could not inspect model providers."));
    } finally {
      if (requestId === modelProviderRequestRef.current) setModelHealthBusy(false);
    }
  };

  const loadDesktopWorkspace = async () => {
    setDesktopWorkspaceBusy(true); setDesktopWorkspaceError("");
    try { setDesktopWorkspace(await callLocalAgentRuntime("/v1/desktop/workspace") as typeof desktopWorkspace); }
    catch (error) { setDesktopWorkspaceError(error instanceof Error ? error.message : (isAr ? "تعذر تحميل مساحة سطح المكتب." : "Could not load Desktop Workspace.")); }
    finally { setDesktopWorkspaceBusy(false); }
  };

  const loadBrowserWorkspace = async () => {
    setBrowserWorkspaceBusy(true); setBrowserWorkspaceError("");
    try { setBrowserWorkspace(await callLocalAgentRuntime("/v1/browser/workspace") as typeof browserWorkspace); }
    catch (error) { setBrowserWorkspaceError(error instanceof Error ? error.message : (isAr ? "تعذر تحميل مساحة المتصفح." : "Could not load Browser Workspace.")); }
    finally { setBrowserWorkspaceBusy(false); }
  };
  const saveBrowserWorkspace = async (next: { allowedHosts: string[] }) => {
    setBrowserWorkspaceBusy(true); setBrowserWorkspaceError("");
    try {
      const result = await callLocalAgentRuntime("/v1/browser/policy", "POST", next);
      setBrowserWorkspace((current) => current ? { ...current, policy: result.policy } : current);
    } catch (error) { setBrowserWorkspaceError(error instanceof Error ? error.message : (isAr ? "تعذر حفظ صلاحيات المتصفح." : "Could not save browser permissions.")); }
    finally { setBrowserWorkspaceBusy(false); }
  };
  const addBrowserSite = async () => {
    const host = browserSiteInput.trim().toLowerCase();
    if (!host || !browserWorkspace) return;
    await saveBrowserWorkspace({ ...browserWorkspace.policy, allowedHosts: [...browserWorkspace.policy.allowedHosts, host] });
    setBrowserSiteInput("");
  };
  const removeBrowserSite = async (host: string) => {
    if (!browserWorkspace) return;
    await saveBrowserWorkspace({ ...browserWorkspace.policy, allowedHosts: browserWorkspace.policy.allowedHosts.filter((item) => item !== host) });
  };

  const loadHttpFlowRoles = async () => {
    setHttpFlowBusy(true); setHttpFlowError("");
    try {
      const result = await callLocalAgentRuntime("/v1/http/roles");
      const roles = Array.isArray(result.roles) ? result.roles.filter((item: unknown): item is string => typeof item === "string") : [];
      setHttpFlowAvailableRoles(roles);
      setHttpFlowSelectedRoles((current) => current.filter((role) => roles.includes(role)).length >= 2
        ? current.filter((role) => roles.includes(role))
        : roles.slice(0, 2));
      if (!roles.length) setHttpFlowError(isAr ? "لم يتم العثور على أدوار. جهّز ملف .omda/http-roles.json أولًا." : "No roles found. Configure .omda/http-roles.json first.");
    } catch (error) {
      setHttpFlowError(error instanceof Error ? error.message : (isAr ? "تعذر تحميل الأدوار." : "Could not load HTTP roles."));
    } finally { setHttpFlowBusy(false); }
  };
  const loadHttpFlowHistory = async () => {
    setHttpFlowHistoryBusy(true); setHttpFlowHistoryError("");
    try {
      const result = await callLocalAgentRuntime("/v1/http/history?limit=100");
      setHttpFlowHistory(Array.isArray(result.records) ? result.records : []);
    } catch (error) {
      setHttpFlowHistoryError(error instanceof Error ? error.message : (isAr ? "تعذر تحميل سجل HTTPFlow." : "Could not load HTTPFlow history."));
    } finally { setHttpFlowHistoryBusy(false); }
  };
  const exportHttpFlowHistory = () => {
    if (!httpFlowHistory.length) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records: httpFlowHistory }, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "omda-httpflow-history.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
  const clearHttpFlowHistory = async () => {
    if (!window.confirm(isAr ? "هل تريد مسح سجل HTTPFlow المحفوظ؟" : "Clear the saved HTTPFlow audit history?")) return;
    setHttpFlowHistoryBusy(true); setHttpFlowHistoryError("");
    try {
      await callLocalAgentRuntime("/v1/http/history", "DELETE");
      setHttpFlowHistory([]);
    } catch (error) {
      setHttpFlowHistoryError(error instanceof Error ? error.message : (isAr ? "تعذر مسح السجل." : "Could not clear history."));
    } finally { setHttpFlowHistoryBusy(false); }
  };
  const runHttpFlowComparison = async () => {
    if (!httpFlowUrl.trim() || httpFlowSelectedRoles.length < 2 || httpFlowBusy) return;
    setHttpFlowBusy(true); setHttpFlowError(""); setHttpFlowResult(null);
    try {
      const result = await callLocalAgentRuntime("/v1/http/compare", "POST", {
        url: httpFlowUrl.trim(), method: httpFlowMethod, roles: httpFlowSelectedRoles,
      });
      setHttpFlowResult(result);
      await loadHttpFlowHistory();
      if (result.historySaved === false) setHttpFlowHistoryError(isAr ? "نجحت المقارنة، لكن تعذر حفظها في السجل." : "Comparison succeeded, but it could not be saved to history.");
    } catch (error) {
      setHttpFlowError(error instanceof Error ? error.message : (isAr ? "فشلت مقارنة HTTP." : "HTTP comparison failed."));
    } finally { setHttpFlowBusy(false); }
  };

  const agentsPage = () => <div className="page-enter agent-marketplace-page">
    {pageHeading(t('marketplace'),t('marketplace'),t('marketplaceSub'))}
    <details className="panel panel-pad agent-guide-panel">
      <summary className="profile-accordion-summary"><div className="section-head"><div><span className="eyebrow">{isAr?'دليل الاستخدام':'GETTING STARTED'}</span><h2 className="section-title">{isAr?'تشغيل الوكلاء خطوة بخطوة':'How to use and run agents'}</h2><p className="section-meta">{isAr?'اختر الطريقة المناسبة: تخصص جاهز داخل مساحة العمل، أو وكيل محلي يتصل بمشروعك على الكمبيوتر.':'Choose a ready-made specialty in the workbench, or connect the local runtime to a project on your computer.'}</p></div><Bot size={20}/></div></summary>
      <div className="agent-guide-steps">
        <div><span className="agent-guide-number">1</span><div><strong>{isAr?'استخدام أحد التخصصات الستة':'Use one of the six specialties'}</strong><p>{isAr?'اضغط «استخدم الوكيل» أسفل التخصص. هتنتقل لمساحة العمل والتخصص متحدد تلقائيًا.':'Select “Use agent” on a specialty card. The workbench opens with that specialty selected.'}</p></div></div>
        <div><span className="agent-guide-number">2</span><div><strong>{isAr?'اكتب المطلوب وراجع الخطة':'Describe the task and review the plan'}</strong><p>{isAr?'اكتب المهمة في مساحة العمل واضغط إنشاء الخطة. راجع الخطوات قبل الموافقة. التخصصات دي قوالب لتوجيه الطلب وليست برامج مستقلة يتم تنزيلها.':'Describe the task in the workbench and generate a plan. Review it before approval. These specialties guide a request; they are not separate downloadable programs.'}</p></div></div>
        <div><span className="agent-guide-number">3</span><div><strong>{isAr?'تشغيل الوكيل المحلي الحقيقي':'Connect the actual local agent runtime'}</strong><p>{isAr?'لو عايز الوكيل يفحص ملفات مشروعك ويستخدم أدوات الكمبيوتر، شغّل الـ Runtime على نفس الكمبيوتر، وبعدها أدخل عنوانه ومفتاح الاتصال بالأسفل واختبر الاتصال.':'To let the agent inspect project files and use computer tools, run the runtime on the same computer, then enter its URL and token below and test the connection.'}</p></div></div>
      </div>
      <div className="agent-guide-warning"><ShieldCheck size={17}/><span>{isAr?'مهم: تشغيل الـ Runtime يحتاج كمبيوتر عليه Node.js 22 وpnpm 9. تشغيله على الكمبيوتر وربط التطبيق المفتوح على الهاتف عبر localhost غير مدعوم حاليًا؛ لازم تفتح التطبيق على نفس الكمبيوتر. الربط الآمن عن بُعد لم يُنفذ بعد.':'Important: the runtime requires a computer with Node.js 22 and pnpm 9. A runtime on a desktop cannot be reached from the phone app through localhost; open the app on the same computer. Secure remote pairing is not implemented yet.'}</span></div>
      <details className="agent-guide-code">
        <summary>{isAr?'أوامر التشغيل على Windows (PowerShell)':'Windows setup commands (PowerShell)'}</summary>
        <p className="section-meta">{isAr?'ثبّت Node.js 22 وpnpm 9 أولًا، ثم نفّذ الأوامر من PowerShell. ستحتاج صلاحية الوصول إلى مستودع GitHub الخاص.':'Install Node.js 22 and pnpm 9 first, then run these in PowerShell. You need Git and internet access to clone the public repository.'}</p>
        <pre><code>{windowsAgentSetup}</code></pre>
        <button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup(windowsAgentSetup)}><Code2 size={14}/>{isAr?'نسخ أوامر Windows':'Copy Windows commands'}</button>
      </details>
      <details className="agent-guide-code">
        <summary>{isAr?'أوامر التشغيل على macOS / Linux':'macOS / Linux setup commands'}</summary>
        <p className="section-meta">{isAr?'ثبّت Node.js 22 وpnpm 9 أولًا، ثم نفّذ الأوامر من Terminal.':'Install Node.js 22 and pnpm 9 first, then run these in Terminal.'}</p>
        <pre><code>{linuxMacAgentSetup}</code></pre>
        <button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup(linuxMacAgentSetup)}><Code2 size={14}/>{isAr?'نسخ أوامر Mac / Linux':'Copy Mac / Linux commands'}</button>
      </details>
      <div className="agent-guide-next"><strong>{isAr?'بعد تشغيل الأوامر':'After starting the runtime'}</strong><ol>
        <li>{isAr?'افتح التطبيق على نفس الكمبيوتر. عنوان التشغيل الافتراضي هو http://127.0.0.1:4318.':'Open the app on that same computer. The default runtime URL is http://127.0.0.1:4318.'}</li>
        <li>{isAr?'انسخ قيمة Your token من نافذة الأوامر والصقها في خانة مفتاح الاتصال في بطاقة الوكيل المحلي.':'Copy the “Your token” value from the terminal and paste it into the Local runtime token field.'}</li>
        <li>{isAr?'اضغط اختبار الاتصال، ثم اكتب المهمة واضغط ابدأ تنفيذ المهمة.':'Select Test connection, enter a task, then choose Run agent task.'}</li>
        <li>{isAr?'أي كتابة ملفات أو أوامر أو استدعاء MCP هيتوقف لحد ما توافق عليها.':'File writes, terminal commands, and MCP calls pause until you approve them.'}</li>
      </ol></div>
      <details className="agent-guide-code agent-guide-terminal">
        <summary>{isAr?'تشغيل الأوامر داخل Docker (موصى به)':'Run commands inside Docker (recommended)'}</summary>
        <p className="section-meta">{isAr?'ده الاختيار الأفضل من تشغيل الأوامر مباشرة على الكمبيوتر. ثبّت Docker Desktop وشغّله، ونفّذ الأوامر من مجلد المشروع بعد تنزيله. الحاوية بدون إنترنت وبحدود للذاكرة والمعالج والعمليات.':'This is safer than running commands directly on your computer. Install and start Docker Desktop, then run these from the cloned project folder. The command container has no network and has CPU, memory, and process limits.'}</p>
        <div className="agent-guide-terminal-row"><strong>Windows PowerShell</strong><pre><code>docker build -t al-omda-agent-sandbox:node22 -f scripts/docker/agent-sandbox.Dockerfile .{"\n"}$env:OMDA_AGENT_SANDBOX_IMAGE = "al-omda-agent-sandbox:node22"{"\n"}$env:OMDA_AGENT_EXECUTION = "container"</code></pre><button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup('docker build -t al-omda-agent-sandbox:node22 -f scripts/docker/agent-sandbox.Dockerfile .\n$env:OMDA_AGENT_SANDBOX_IMAGE = "al-omda-agent-sandbox:node22"\n$env:OMDA_AGENT_EXECUTION = "container"')}>{isAr?'نسخ أوامر Docker':'Copy Docker commands'}</button></div>
        <div className="agent-guide-terminal-row"><strong>macOS / Linux</strong><pre><code>docker build -t al-omda-agent-sandbox:node22 -f scripts/docker/agent-sandbox.Dockerfile .{"\n"}export OMDA_AGENT_SANDBOX_IMAGE="al-omda-agent-sandbox:node22"{"\n"}export OMDA_AGENT_EXECUTION="container"</code></pre><button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup('docker build -t al-omda-agent-sandbox:node22 -f scripts/docker/agent-sandbox.Dockerfile .\nexport OMDA_AGENT_SANDBOX_IMAGE="al-omda-agent-sandbox:node22"\nexport OMDA_AGENT_EXECUTION="container"')}>{isAr?'نسخ أوامر Docker':'Copy Docker commands'}</button></div>
        <p className="section-meta">{isAr?'ابنِ الصورة مرة واحدة قبل تشغيل الـ Runtime. التنفيذ يستخدم الصورة المحلية فقط ولا ينزّل صورًا تلقائيًا. مساحة المشروع فقط هي القابلة للكتابة؛ الوصول للإنترنت من داخل الحاوية معطّل.':'Build the image once before starting the runtime. Execution uses only the local image and never pulls images automatically. Only the project workspace is writable; container network access is disabled.'}</p>
        <div className="agent-guide-warning"><ShieldCheck size={17}/><span>{isAr?'العزل بالحاوية أقوى من تشغيل أوامر المضيف، لكنه مش ضمان ضد ثغرات نواة النظام أو Docker. استخدم Docker موثوقًا ويفضل Rootless، ولا تشغّل ملفات غير موثوقة على جهاز حساس. كل أمر ما زال يحتاج موافقتك.':'Container isolation is stronger than host execution, but it cannot protect against host-kernel or Docker vulnerabilities. Use a trusted, preferably rootless Docker engine and do not run untrusted code on a sensitive machine. Every command still requires your approval.'}</span></div>
      </details>
      <details className="agent-guide-code agent-guide-terminal">
        <summary>{isAr?'تفعيل تشغيل أوامر الكمبيوتر (اختياري ومتقدم)':'Enable computer terminal commands (optional, advanced)'}</summary>
        <p className="section-meta">{isAr?'التشغيل الآمن الافتراضي لا يسمح بتنفيذ أوامر Terminal. لو محتاج تفعّلها، أضف السطر المناسب في نفس نافذة الأوامر قبل تشغيل الـ Runtime أو أوقفه وأعد تشغيله بعد التغيير.':'The safe default does not allow terminal execution. If you need it, add the matching line in the same terminal before starting the runtime, or restart the runtime after changing it.'}</p>
        <div className="agent-guide-terminal-row"><strong>Windows PowerShell</strong><pre><code>$env:OMDA_AGENT_EXECUTION = "host"</code></pre><button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup('$env:OMDA_AGENT_EXECUTION = "host"')}>{isAr?'نسخ الأمر':'Copy command'}</button></div>
        <div className="agent-guide-terminal-row"><strong>macOS / Linux</strong><pre><code>export OMDA_AGENT_EXECUTION="host"</code></pre><button type="button" className="button button-quiet button-small" onClick={()=>void copyAgentSetup('export OMDA_AGENT_EXECUTION="host"')}>{isAr?'نسخ الأمر':'Copy command'}</button></div>
        <div className="agent-guide-warning"><ShieldCheck size={17}/><span>{isAr?'تحذير أمان: ده مش Sandbox لنظام التشغيل. الأوامر المسموح بها تشتغل بصلاحيات حساب الكمبيوتر نفسه وقد تصل لملفاتك. فعّلها فقط على مشروع موثوق أو جهاز/حساب تجريبي، وراجع كل طلب موافقة قبل تنفيذه. لا تفتح خدمة Runtime للإنترنت.':'Security warning: this is not an OS sandbox. Allowed commands run with your computer account permissions and may access your files. Enable only for trusted projects or a disposable device/account, review every approval, and never expose the runtime to the public internet.'}</span></div>
      </details>
      {agentGuideNotice&&<p className="agent-guide-notice" role="status">{agentGuideNotice}</p>}
    </details>
    <details className="panel panel-pad agent-advanced-tools">
      <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'إعدادات متقدمة':'ADVANCED'}</span><h2>{isAr?'ربط الوكلاء والأدوات المتقدمة':'Agent runtime & advanced tools'}</h2><p>{isAr?'إعدادات الاتصال والتشغيل والمتصفح ومزودي النماذج للمستخدمين المتقدمين.':'Runtime, browser, HTTP, and model-provider settings for advanced users.'}</p></div><Settings2 size={18}/></div></summary>
      <div className="agent-advanced-tools-content">
    <section className="panel panel-pad" id="local-agent-runtime" style={{marginBottom:20}}>
      <div className="section-head">
        <div><span className="eyebrow">LOCAL EXECUTION</span><h2 className="section-title">{isAr?'الوكيل الذكي المحلي':'Local AI Agent'}</h2><p className="section-meta">{isAr?'وصّل بيئة التنفيذ على جهازك ليقرأ المشروع وينفذ المهام بموافقتك.':'Connect the runtime on your computer to inspect projects and execute approved tasks.'}</p></div>
        <span className="status-chip"><span className={localAgentStatus==='ready'?'online-dot':localAgentStatus==='error'?'offline-dot':'online-dot'}/>{localAgentStatus==='ready'?(isAr?'متصل':'Connected'):localAgentStatus==='checking'?(isAr?'جارٍ الاتصال':'Connecting'):localAgentStatus==='running'?(isAr?'يعمل':'Running'):localAgentStatus==='approval'?(isAr?'موافقة مطلوبة':'Approval required'):localAgentStatus==='error'?(isAr?'غير متصل':'Offline'):(isAr?'غير موصل':'Not connected')}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,250px),1fr))',gap:12,marginTop:14}}>
        <label className="field-group"><span className="form-label">{isAr?'عنوان التشغيل المحلي':'Local runtime URL'}</span><input className="field" type="url" value={localAgentUrl} disabled={localAgentBusy} onChange={event=>{setLocalAgentUrl(event.target.value);setLocalAgentStatus("idle");setLocalAgentMessage("");}} placeholder="http://127.0.0.1:4318"/></label>
        <label className="field-group"><span className="form-label">{isAr?'مفتاح الاتصال المحلي':'Local runtime token'}</span><input className="field" type="password" autoComplete="off" value={localAgentToken} disabled={localAgentBusy} onChange={event=>{setLocalAgentToken(event.target.value);setLocalAgentStatus("idle");setLocalAgentMessage("");}} placeholder={isAr?'أدخل المفتاح من إعدادات التشغيل':'Paste OMDA_AGENT_TOKEN'}/></label>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginTop:10}}>
        <button type="button" className="button button-quiet button-small" onClick={checkLocalAgent} disabled={localAgentBusy || !localAgentToken.trim()}>{isAr?'اختبار الاتصال':'Test connection'}</button>
        {localAgentSessionId&&<button type="button" className="button button-quiet button-small" onClick={resumeLocalAgent} disabled={localAgentBusy||!localAgentToken.trim()}>{isAr?'استكمال آخر جلسة محفوظة':'Resume saved session'}</button>}
        <span className="section-meta">{isAr?'الموديل المحلي يُضبط من إعدادات LM Studio أو مزود OpenAI-compatible.':'Configure the local model in LM Studio or another OpenAI-compatible provider.'}</span>
      </div>
      <div className="field-group" style={{marginTop:18}}>
        <label className="form-label" htmlFor="local-agent-goal">{isAr?'المهمة التي تريد من الوكيل تنفيذها':'Task for the agent'}</label>
        <textarea id="local-agent-goal" className="field" rows={4} value={localAgentGoal} onChange={event=>setLocalAgentGoal(event.target.value)} placeholder={isAr?'مثال: افحص ملفات المشروع، شغّل الاختبارات، وحدد الأخطاء قبل تعديل أي ملف.':'Example: Inspect this project, run its tests, and identify bugs before changing any files.'}/>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <button type="button" className="button button-primary" onClick={runLocalAgent} disabled={localAgentBusy || localAgentStatus!=='ready' || !localAgentGoal.trim()}><Bot size={15}/>{localAgentBusy?(isAr?'جارٍ التنفيذ...':'Working...'):(isAr?'ابدأ تنفيذ المهمة':'Run agent task')}<ArrowLeft size={13}/></button>
        {localAgentMessage&&<div className="section-meta" role="status" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:240,overflow:"auto",flex:"1 1 280px"}}>{localAgentMessage}</div>}
      </div>
      {localAgentSessionId&&<p className="section-meta" style={{marginTop:8}}>{isAr?'رقم الجلسة المحفوظة: ':'Saved session: '}{localAgentSessionId}</p>}
      {localAgentPending.length>0&&<div className="panel panel-pad" style={{marginTop:16,borderColor:'rgba(190,155,91,.45)'}}>
        <h3 className="section-title">{isAr?'إجراءات تنتظر موافقتك':'Actions awaiting your approval'}</h3>
        {localAgentPending.map(item=><div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <strong>{item.tool}</strong><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12,marginTop:6}}>{JSON.stringify(item.arguments,null,2)}</pre>
        </div>)}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
          <button type="button" className="button button-primary button-small" onClick={()=>continueLocalAgent(true)} disabled={localAgentBusy}>{isAr?'موافقة على الإجراءات المعروضة':'Approve displayed actions'}</button>
          <button type="button" className="button button-quiet button-small" onClick={()=>continueLocalAgent(false)} disabled={localAgentBusy}>{isAr?'رفض الإجراءات':'Deny actions'}</button>
        </div>
      </div>}
      <div className="panel panel-pad" style={{marginTop:18}}>
        <div className="section-head">
          <div><span className="eyebrow">MULTI-AGENT</span><h3 className="section-title">{isAr?'تشغيل وكيلين بالتوازي':'Parallel specialist review'}</h3><p className="section-meta">{isAr?'قسّم المهمة بين متخصصين. يمكنك السماح لكل وكيل بإنشاء مسودات داخل مساحة معزولة؛ لا يمكنه تعديل ملفات المشروع أو تشغيل الأوامر.':'Split work between two specialists. Each can be read-only or create draft files in an isolated workspace; neither can edit project files or run commands.'}</p></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,250px),1fr))',gap:12,marginTop:12}}>
          <div className="field-group">
            <label className="form-label">{isAr?'دور الوكيل الأول':'First specialist role'}</label>
            <input className="field" value={delegateRoleOne} onChange={event=>setDelegateRoleOne(event.target.value)} maxLength={80}/>
            <label className="form-label" style={{marginTop:8}}>{isAr?'مهمته':'Its task'}</label>
            <textarea className="field" rows={3} value={delegateGoalOne} onChange={event=>setDelegateGoalOne(event.target.value)} placeholder={isAr?'مثال: راجع بنية الكود واكتشف الأخطاء.':'Example: Review the code structure and identify defects.'}/>
            <label className="form-label" style={{marginTop:8}}>{isAr?'وضع الوكيل':'Agent mode'}</label>
            <select className="field" value={delegateModeOne} onChange={event=>setDelegateModeOne(event.target.value as "read_only"|"proposal")}><option value="read_only">{isAr?'قراءة وتحليل فقط':'Read-only research'}</option><option value="proposal">{isAr?'إنشاء مسودات معزولة':'Draft isolated proposals'}</option></select>

          </div>
          <div className="field-group">
            <label className="form-label">{isAr?'دور الوكيل الثاني':'Second specialist role'}</label>
            <input className="field" value={delegateRoleTwo} onChange={event=>setDelegateRoleTwo(event.target.value)} maxLength={80}/>
            <label className="form-label" style={{marginTop:8}}>{isAr?'مهمته':'Its task'}</label>
            <textarea className="field" rows={3} value={delegateGoalTwo} onChange={event=>setDelegateGoalTwo(event.target.value)} placeholder={isAr?'مثال: راجع الأمان وحدد المخاطر.':'Example: Review security and identify risks.'}/>
            <label className="form-label" style={{marginTop:8}}>{isAr?'وضع الوكيل':'Agent mode'}</label>
            <select className="field" value={delegateModeTwo} onChange={event=>setDelegateModeTwo(event.target.value as "read_only"|"proposal")}><option value="read_only">{isAr?'قراءة وتحليل فقط':'Read-only research'}</option><option value="proposal">{isAr?'إنشاء مسودات معزولة':'Draft isolated proposals'}</option></select>

          </div>
        </div>
        <button type="button" className="button button-primary button-small" style={{marginTop:12}} onClick={runLocalAgentDelegation} disabled={delegateBusy||localAgentBusy||localAgentStatus!=='ready'||!delegateGoalOne.trim()||!delegateGoalTwo.trim()}>{delegateBusy?(isAr?'جارٍ تشغيل الوكلاء...':'Running specialists...'):(isAr?'ابدأ التحليل المتوازي':'Run parallel review')}</button>
        {delegateError&&<p className="section-meta" role="alert" style={{color:'var(--danger,#d66)'}}>{delegateError}</p>}
        {delegateResults.length>0&&<div style={{display:'grid',gap:10,marginTop:14}}>
          {delegateResults.map((item,index)=><div key={item.role+index} style={{border:'1px solid var(--border)',borderRadius:12,padding:12}}>
            <strong>{item.role}</strong>{typeof item.turns==='number'&&<span className="section-meta"> · {item.turns} {isAr?'جولات':'turns'}</span>}
            <p className="section-meta" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:8}}>{item.result}</p>
            {item.mode==="proposal"&&<div className="section-meta" style={{marginTop:8}}>{isAr?'مساحة المسودات: ':'Proposal workspace: '}{item.proposalDirectory||'—'}{item.proposalFiles&&item.proposalFiles.length>0&&<ul style={{margin:'6px 0',paddingInlineStart:20}}>{item.proposalFiles.map(file=><li key={file.path}>{file.path} · {file.bytes} bytes</li>)}</ul>}</div>}
            {item.error&&<p className="section-meta" role="alert" style={{color:'var(--danger,#d66)'}}>{item.error}</p>}
            {item.evidence&&item.evidence.length>0&&<details style={{marginTop:10}}><summary className="section-meta">{isAr?'الأدلة والأدوات المستخدمة':'Evidence and tools used'} ({item.evidence.length})</summary>
              {item.evidence.map((entry,evidenceIndex)=><div key={entry.tool+evidenceIndex} style={{padding:'7px 0',borderTop:'1px solid var(--border)'}}><strong className="section-meta">{entry.tool}</strong><p className="section-meta" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:4}}>{entry.summary}</p></div>)}
            </details>}
          </div>)}
        </div>}
      </div>
      <p className="section-meta" style={{marginTop:14}}>{isAr?'تنبيه أمان: لا تشغّل أوامر الطرفية إلا داخل مشروع تثق به. كل تعديل أو أمر طرفية يحتاج موافقتك.':'Security: only run terminal commands in projects you trust. Every file write or terminal command requires your approval.'}</p>
    </section>
    <section className="panel panel-pad" id="desktop-workspace" style={{marginBottom:20}}>
      <div className="section-head">
        <div><span className="eyebrow">DESKTOP WORKSPACE</span><h2 className="section-title">{isAr?'مساحة سطح المكتب والتحكم المحلي':'Desktop Workspace & local control'}</h2><p className="section-meta">{isAr?'اكتشاف أدوات التحكم في التطبيقات والنوافذ على جهازك المحلي. كل إجراء يتطلب موافقتك، كما يجب منح صلاحيات نظام التشغيل يدويًا.':'Discover local app and window control tools. Every action requires your approval, and operating-system permissions must be granted manually.'}</p></div>
        <button type="button" className="button button-quiet button-small" onClick={loadDesktopWorkspace} disabled={desktopWorkspaceBusy||!localAgentToken.trim()}><RefreshCw size={14}/>{desktopWorkspaceBusy?(isAr?'جارٍ التحديث...':'Refreshing...'):(isAr?'تحديث':'Refresh')}</button>
      </div>
      {!desktopWorkspace&&<p className="section-meta" style={{marginTop:12}}>{isAr?'اضغط تحديث بعد إعداد computer-use وإعادة تشغيل الوكيل المحلي.':'Refresh after configuring computer-use and restarting the local runtime.'}</p>}
      {desktopWorkspace&&<>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><span className="status-chip"><span className={desktopWorkspace.connected?'online-dot':'offline-dot'}/>{desktopWorkspace.connected?(isAr?'أدوات سطح المكتب متصلة':'Desktop tools connected'):(desktopWorkspace.configured?(isAr?'الخدمة غير متصلة':'Service not connected'):(isAr?'computer-use غير مُعد':'computer-use not configured'))}</span><span className="status-chip">{desktopWorkspace.tools.length} {isAr?'أداة':'tools'}</span></div>
        {desktopWorkspace.connectionError&&<p className="section-meta" role="alert" style={{color:'var(--danger,#d66)',marginTop:10}}>{desktopWorkspace.connectionError}</p>}
        {desktopWorkspace.tools.length>0&&<details style={{marginTop:12}}><summary className="section-meta">{isAr?'أدوات التحكم المتاحة':'Available control tools'} ({desktopWorkspace.tools.length})</summary>{desktopWorkspace.tools.map(tool=><div key={tool.name} style={{padding:'7px 0',borderTop:'1px solid var(--border)'}}><strong className="section-meta">{tool.name}</strong>{tool.description&&<p className="section-meta">{tool.description}</p>}</div>)}</details>}
        <p className="section-meta" style={{marginTop:12}}>{isAr?'هذه اللوحة لا تمنح صلاحيات نظام التشغيل تلقائيًا ولا تنفذ تحكمًا عن بُعد. شغّل الوكيل على الكمبيوتر نفسه وامنح الصلاحيات المطلوبة من إعدادات النظام.':'This panel does not grant OS permissions or enable remote control by itself. Run the agent on the target computer and grant requested permissions in system settings.'}</p>
      </>}
      {desktopWorkspaceError&&<div className="notice-bar notice-error" role="alert" style={{marginTop:12}}>{desktopWorkspaceError}</div>}
    </section>
    <section className="panel panel-pad" id="browser-workspace" style={{marginBottom:20}}>
      <div className="section-head">
        <div><span className="eyebrow">BROWSER WORKSPACE</span><h2 className="section-title">{isAr?'مساحة المتصفح وصلاحيات المواقع':'Browser Workspace & site permissions'}</h2><p className="section-meta">{isAr?'إدارة قائمة المواقع المسموح بها واكتشاف أدوات Playwright المحلية. كل إجراء متصفح يظل خاضعًا لموافقة منفصلة.':'Manage exact allowed hostnames and inspect local Playwright tools. Every browser action still requires separate approval.'}</p></div>
        <button type="button" className="button button-quiet button-small" onClick={loadBrowserWorkspace} disabled={browserWorkspaceBusy||!localAgentToken.trim()}><RefreshCw size={14}/>{browserWorkspaceBusy?(isAr?'جارٍ التحديث...':'Refreshing...'):(isAr?'تحديث':'Refresh')}</button>
      </div>
      {!browserWorkspace&&<p className="section-meta" style={{marginTop:12}}>{isAr?'اضغط تحديث بعد توصيل الوكيل المحلي لعرض إعدادات المتصفح.':'Refresh after connecting the local runtime to load browser settings.'}</p>}
      {browserWorkspace&&<>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><span className="status-chip"><span className={browserWorkspace.connected?'online-dot':'offline-dot'}/>{browserWorkspace.connected?(isAr?'أدوات المتصفح متصلة':'Browser tools connected'):(browserWorkspace.configured?(isAr?'المتصفح غير متصل':'Browser not connected'):(isAr?'Playwright غير مُعد':'Playwright not configured'))}</span><span className="status-chip">{browserWorkspace.tools.length} {isAr?'أداة':'tools'}</span></div>
        <div style={{marginTop:14}}><label className="field-group"><span className="form-label">{isAr?'إضافة نطاق مسموح':'Add allowed hostname'}</span><div style={{display:'flex',gap:6}}><input className="field" value={browserSiteInput} onChange={event=>setBrowserSiteInput(event.target.value)} placeholder="docs.example.com"/><button type="button" className="button button-primary button-small" onClick={()=>void addBrowserSite()} disabled={browserWorkspaceBusy||!browserSiteInput.trim()}>{isAr?'إضافة':'Add'}</button></div></label></div>
        <div style={{marginTop:12}}><strong className="section-meta">{isAr?'المواقع المسموح بها':'Allowed sites'}</strong>{browserWorkspace.policy.allowedHosts.length?<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{browserWorkspace.policy.allowedHosts.map(host=><span key={host} className="status-chip"><Globe size={13}/>{host}<button type="button" aria-label={(isAr?'إزالة ':'Remove ')+host} onClick={()=>void removeBrowserSite(host)} disabled={browserWorkspaceBusy} style={{border:0,background:'transparent',color:'inherit',cursor:'pointer'}}>×</button></span>)}</div>:<p className="section-meta" style={{marginTop:6}}>{isAr?'لا توجد مواقع مسموح بها. التنقل محظور حتى تضيف نطاقًا.':'No sites approved. Navigation is blocked until you add a hostname.'}</p>}</div>
        {browserWorkspace.connectionError&&<p className="section-meta" role="alert" style={{color:'var(--danger,#d66)',marginTop:10}}>{browserWorkspace.connectionError}</p>}
        {browserWorkspace.tools.length>0&&<details style={{marginTop:12}}><summary className="section-meta">{isAr?'أدوات المتصفح المتاحة':'Available browser tools'} ({browserWorkspace.tools.length})</summary>{browserWorkspace.tools.map(tool=><div key={tool.name} style={{padding:'7px 0',borderTop:'1px solid var(--border)'}}><strong className="section-meta">{tool.name}</strong>{tool.description&&<p className="section-meta">{tool.description}</p>}</div>)}</details>}
        <p className="section-meta" style={{marginTop:12}}>{isAr?'تنبيه: فحص النطاق يقيّد عناوين URL المباشرة المرسلة لأداة المتصفح. الروابط التي تفتحها الصفحة نفسها قد تنتقل لنطاق آخر؛ لذلك تظل كل أداة بموافقة منفصلة ولا تعتبر هذه الميزة عزلًا كاملًا للمتصفح.':'Note: hostname checks gate direct URLs passed to browser tools. A page can still navigate through its own links; every tool remains separately approval-gated, and this is not full browser sandboxing.'}</p>
      </>}
      {browserWorkspaceError&&<div className="notice-bar notice-error" role="alert" style={{marginTop:12}}>{browserWorkspaceError}</div>}
    </section>
    <section className="panel panel-pad" id="http-flow-tools" style={{marginBottom:20}}>
      <div className="section-head">
        <div><span className="eyebrow">HTTPFLOW</span><h2 className="section-title">{isAr?'مقارنة الاستجابات والصلاحيات':'HTTP response & role diff'}</h2><p className="section-meta">{isAr?'قارن نفس المسار بين الزائر والمستخدم والمدير باستخدام بيانات الاعتماد المحلية.':'Compare the same endpoint across anonymous, user, and admin roles using local credentials.'}</p></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="button button-quiet button-small" onClick={loadHttpFlowRoles} disabled={httpFlowBusy||!localAgentToken.trim()}>{httpFlowBusy?(isAr?'جارٍ التحميل...':'Loading...'):(isAr?'تحميل الأدوار':'Load roles')}</button>
          <button type="button" className="button button-quiet button-small" onClick={loadHttpFlowHistory} disabled={httpFlowHistoryBusy||!localAgentToken.trim()}>{httpFlowHistoryBusy?(isAr?'جارٍ التحميل...':'Loading...'):(isAr?'سجل المقارنات':'History')}</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 120px',gap:10,marginTop:12}}>
        <label className="field-group"><span className="form-label">{isAr?'عنوان endpoint المصرح به':'Authorized endpoint URL'}</span><input className="field" type="url" value={httpFlowUrl} onChange={event=>setHttpFlowUrl(event.target.value)} placeholder="https://your-authorized-domain.example/api/me"/></label>
        <label className="field-group"><span className="form-label">{isAr?'الطريقة':'Method'}</span><select className="field" value={httpFlowMethod} onChange={event=>setHttpFlowMethod(event.target.value as "GET"|"HEAD"|"OPTIONS")}><option value="GET">GET</option><option value="HEAD">HEAD</option><option value="OPTIONS">OPTIONS</option></select></label>
      </div>
      {httpFlowAvailableRoles.length>0&&<div className="field-group" style={{marginTop:10}}><span className="form-label">{isAr?'الأدوار المراد مقارنتها':'Roles to compare'}</span><div style={{display:'flex',gap:14,flexWrap:'wrap'}}>{httpFlowAvailableRoles.map(role=><label key={role} style={{display:'inline-flex',alignItems:'center',gap:7,fontSize:13}}><input type="checkbox" checked={httpFlowSelectedRoles.includes(role)} onChange={event=>setHttpFlowSelectedRoles(current=>event.target.checked?[...current,role]:current.filter(item=>item!==role))}/>{role}</label>)}</div></div>}
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:12}}><button type="button" className="button button-primary button-small" onClick={runHttpFlowComparison} disabled={httpFlowBusy||!localAgentToken.trim()||!httpFlowUrl.trim()||httpFlowSelectedRoles.length<2}>{httpFlowBusy?(isAr?'جارٍ المقارنة...':'Comparing...'):(isAr?'قارن الاستجابات':'Compare responses')}</button><span className="section-meta">{isAr?'الطلبات تستخدم GET أو HEAD أو OPTIONS فقط، ويجب أن يكون النطاق ضمن قائمة السماح المحلية.':'Requests are limited to GET, HEAD, or OPTIONS and the host must be in the local allowlist.'}</span></div>
      {httpFlowError&&<div className="notice-bar notice-error" role="alert" style={{marginTop:12}}>{httpFlowError}</div>}
      {httpFlowResult&&<div style={{display:'grid',gap:14,marginTop:16}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{(httpFlowResult.comparison?.statuses||[]).map((item:any)=><span key={item.role} className="status-chip"><strong>{item.role}</strong>&nbsp; {item.status}</span>)}<span className="status-chip">{httpFlowResult.comparison?.sameBody?(isAr?'المحتوى متطابق':'Bodies match'):(isAr?'اختلاف في المحتوى':'Body differs')}</span></div>
        {!httpFlowResult.comparison?.sameBody&&<div className="panel panel-pad"><h3 className="section-title">{isAr?'أول اختلاف في المحتوى':'First body difference'}</h3><p className="section-meta">{isAr?'موضع الاختلاف: ':'Difference offset: '}{httpFlowResult.comparison?.bodyDiff?.firstDifferenceAt}</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:10}}>{(httpFlowResult.comparison?.bodyDiff?.snippets||[]).map((item:any)=><div key={item.role}><strong>{item.role} · {item.length} {isAr?'حرف':'chars'}</strong><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:180,overflow:'auto',fontSize:12,marginTop:6}}>{item.excerpt}</pre></div>)}</div></div>}
        {(httpFlowResult.comparison?.headerDifferences||[]).length>0&&<div className="panel panel-pad"><h3 className="section-title">{isAr?'اختلافات الترويسات':'Header differences'}</h3>{httpFlowResult.comparison.headerDifferences.map((item:any)=><div key={item.header} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}><strong>{item.header}</strong>{item.values.map((entry:any)=><div key={entry.role} className="section-meta">{entry.role}: {entry.value}</div>)}</div>)}</div>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:10}}>{(httpFlowResult.responses||[]).map((response:any)=><div className="panel panel-pad" key={response.role}><div className="section-head"><strong>{response.role}</strong><span className="status-chip">{response.status}</span></div><p className="section-meta">{response.durationMs} ms · {response.body.length} {isAr?'حرف':'chars'}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:240,overflow:'auto',fontSize:11,marginTop:8}}>{response.body||'(empty response)'}</pre></div>)}</div>
      </div>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginTop:16}}>
        <button type="button" className="button button-quiet button-small" onClick={loadHttpFlowHistory} disabled={httpFlowHistoryBusy||!localAgentToken.trim()}>{isAr?'تحديث السجل':'Refresh history'}</button>
        <button type="button" className="button button-quiet button-small" onClick={exportHttpFlowHistory} disabled={!httpFlowHistory.length}>{isAr?'تصدير JSON':'Export JSON'}</button>
        <button type="button" className="button button-quiet button-small" onClick={clearHttpFlowHistory} disabled={httpFlowHistoryBusy||!httpFlowHistory.length||!localAgentToken.trim()}>{isAr?'مسح السجل':'Clear history'}</button>
        <span className="section-meta">{isAr?'يُحفظ ملخص آمن لآخر 100 مقارنة، دون تخزين نصوص الاستجابات أو قيم الترويسات أو معاملات الرابط.':'Stores up to 100 sanitized summaries; response bodies, header values, and URL query strings are not persisted.'}</span>
      </div>
      {httpFlowHistoryError&&<div className="notice-bar notice-error" role="alert" style={{marginTop:10}}>{httpFlowHistoryError}</div>}
      {httpFlowHistory.length>0&&<div style={{display:'grid',gap:10,marginTop:12}}>
        {httpFlowHistory.map(record=><div className="panel panel-pad" key={record.id}>
          <div className="section-head"><strong style={{overflowWrap:'anywhere'}}>{record.method} · {record.target}</strong><span className="status-chip">{record.comparison.sameBody?(isAr?'المحتوى متطابق':'Bodies match'):(isAr?'اختلاف':'Different')}</span></div>
          <p className="section-meta">{new Date(record.createdAt).toLocaleString(isAr?'ar':'en')} · {record.roles.join(' / ')}</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{record.responses.map(response=><span className="status-chip" key={response.role}>{response.role}: {response.status} · {response.durationMs} ms · {response.bodyLength} {isAr?'حرف':'chars'}</span>)}</div>
          {record.comparison.changedHeaders.length>0&&<p className="section-meta" style={{marginTop:8}}>{isAr?'الترويسات المختلفة: ':'Changed headers: '}{record.comparison.changedHeaders.join(', ')}</p>}
        </div>)}
      </div>}
    </section>
    <section className="panel panel-pad" id="model-router" style={{marginBottom:20}}>
      <div className="section-head"><div><span className="eyebrow">MODEL ROUTER</span><h2 className="section-title">{isAr?'مزودو الموديلات':'Model providers'}</h2><p className="section-meta">{isAr?'المزود الأساسي والإضافي والاحتياطي. مفاتيح الدخول تبقى في بيئة Runtime المحلية.':'Primary, additional, and fallback providers. API keys stay in the local runtime environment.'}</p></div><button type="button" className="button button-quiet button-small" onClick={loadLocalModelHealth} disabled={!localAgentToken.trim()||modelHealthBusy}>{modelHealthBusy?(isAr?'جارٍ الفحص…':'Checking…'):(isAr?'فحص المزودين':'Test providers')}</button></div>
      {modelProvidersError&&<p className="section-meta" role="status">{modelProvidersError}</p>}
      {modelHealthError&&<p className="section-meta" role="alert">{modelHealthError}</p>}
      {localModelProviders.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,230px),1fr))',gap:10,marginTop:12}}>{localModelProviders.map((provider)=>{const health=localModelHealth.find((item)=>item.name===provider.name);return <div className="panel panel-pad" key={provider.name}><div className="section-head"><strong>{provider.name}</strong><span className="status-chip">{providerStatusLabel(health,isAr)}</span></div><p className="section-meta" style={{overflowWrap:'anywhere'}}>{provider.model}</p><small className="muted">{provider.hasApiKey?(isAr?'مفتاح متاح':'API key available'):(isAr?'بدون مفتاح':'No API key')} · {provider.kind}</small><p className="section-meta">{isAr?'الأولوية':'Priority'}: {provider.priority ?? 0} · {(provider.purposes || ['all']).join(', ')}</p>{health&&<><p className="section-meta">{isAr?'زمن الاستجابة':'Latency'}: {health.latencyMs} ms · HTTP {health.status ?? '—'}</p>{health.discoveredModels.length>0&&<p className="section-meta" style={{overflowWrap:'anywhere'}}>{isAr?'النماذج المكتشفة':'Discovered models'}: {health.discoveredModels.join(', ')}</p>}</>}</div>})}</div>}
      <p className="section-meta" style={{marginTop:10}}>{isAr?'لإضافة مزود جديد، عدّل .omda/models.json وفق المثال .omda/models.example.json ثم حدّث القائمة.':'Add providers in .omda/models.json using .omda/models.example.json, then refresh this list.'}</p>
      <p className="section-meta" style={{marginTop:10}}>{isAr?'فحص الصحة يختبر واجهة /models ووجود اسم النموذج فقط؛ لا يضمن نجاح توليد رد فعلي.':'Health checks inspect the /models endpoint and model listing only; they do not guarantee a successful completion.'}</p>
    </section>
      </div>
    </details>
    <div className="notice-bar"><ShieldCheck size={15} style={{flex:'none'}}/><span>{t('controlText')}</span></div>
    <section className="marketplace-intro" aria-label={isAr?'نظرة عامة على التخصصات':'Specialty directory overview'}>
      <div className="marketplace-intro-mark"><Bot size={25}/></div>
      <div className="marketplace-intro-copy"><span className="eyebrow">{isAr?'شبكة المتخصصين':'SPECIALIST NETWORK'}</span><h2>{isAr?'اختار العقل المناسب لمهمتك':'Find the right specialist for the job'}</h2><p>{isAr?'كل تخصص يوجّه طلبك بخطة مناسبة، وتقدر تراجع الخطة قبل الموافقة على أي خطوة.':'Each specialty shapes a focused plan. Review the plan before approving any step.'}</p></div>
      <Link href={focusedHref("/workbench","request-input")} className="button button-primary">{isAr?'افتح مساحة العمل':'Open workbench'}<ArrowLeft size={14}/></Link>
    </section>
    <section className="agent-marketplace-toolbar" aria-label={isAr?'تصفية التخصصات':'Specialty filters'}>
      <div className="agent-marketplace-summary">
        <div><span className="eyebrow">{isAr?'دليل التخصصات':'SPECIALTY DIRECTORY'}</span><strong>{specialties.length.toLocaleString(isAr?'ar':'en')} <span>{isAr?'تخصصات':'specialties'}</span></strong><p>{isAr?'اختار التخصص الأقرب لمهمتك، وتابع إنجازاته من هنا.':'Choose the specialty closest to your task and track its activity here.'}</p></div>
        <div className="agent-marketplace-total"><strong>{tasks.length.toLocaleString(isAr?'ar':'en')}</strong><span>{isAr?'إجمالي المهام':'total tasks'}</span></div>
      </div>
      <div className="agent-marketplace-filter-head"><span className="form-label">{isAr?'تصفية حسب التخصص':'Filter by specialty'}</span><span className="section-meta" role="status">{specialties.filter(({id})=>filter==='all'||filter===id).length} {isAr?'نتائج':'results'}</span></div>
      <div className="filter-row" role="group" aria-label={isAr?'التخصصات':'Specialties'}><button type="button" className={`filter-pill ${filter==='all'?'active':''}`} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{t('all')}</button>{specialties.map(({id})=><button type="button" key={id} className={`filter-pill ${filter===id?'active':''}`} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label(id)}</button>)}</div>
    </section>
    <div className="market-grid" id="agent-marketplace-grid" aria-live="polite">{specialties.filter(({id})=>filter==='all'||filter===id).map(({id,icon:Icon},index)=><article className="panel agent-card" key={id} data-testid={`agent-card-${id}`}>
      <div className="agent-top"><span className="agent-symbol"><Icon size={20}/></span><span className="section-meta">0{index+1} / 06</span></div>
      <h3>{label(id)}</h3><p>{t(specialtyDesc(id))}</p><div className="agent-card-stats"><span>{tasks.filter(task=>task.specialty===id).length} {isAr?'مهمة مسجلة':'recorded tasks'}</span><span>{tasks.filter(task=>task.specialty===id&&(task.status==='review'||task.status==='paused')).length} {isAr?'تحتاج متابعة':'need attention'}</span></div><div className="agent-footer"><span className="agent-tag">{t(specialtyLabel(id))}</span><Link href={focusedHref(`/workbench?specialty=${id}`,"request-input")} className="button button-quiet button-small" onClick={()=>setSelectedSpecialty(id)}>{t('useAgent')}<ArrowLeft size={12}/></Link></div>
    </article>)}</div>
  </div>;

  const professionalSpecialtyPage = (route:string) => {
    const info = professionalSpecialtyPages[route as keyof typeof professionalSpecialtyPages];
    if (!info) return notFoundPage(isAr?"التخصص غير موجود":"Specialty not found",isAr?"هذا التخصص غير متاح.":"This specialty is unavailable.","/agents",isAr?"شبكة الوكلاء":"Agent network");
    const Icon = info.icon;
    const startTask = () => {
      setSelectedSpecialty(info.workbenchSpecialty);
      setRequest(isAr ? info.promptAr : info.promptEn);
      setLocation("/workbench");
    };
    return <div className="page-enter">
      {pageHeading(isAr?"التخصصات المهنية":"PROFESSIONAL SPECIALTIES",isAr?info.ar:info.en,isAr?info.subtitleAr:info.subtitleEn)}
      <section className="panel panel-pad" style={{marginTop:16,maxWidth:980}}>
        <div className="section-head" style={{alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span className="agent-icon"><Icon size={24}/></span>
            <div><span className="eyebrow">{isAr?"مساحة تخصص":"SPECIALTY WORKSPACE"}</span><h2 className="section-title">{isAr?info.ar:info.en}</h2></div>
          </div>
          <span className="status-chip">{isAr?"جاهز لبدء طلب":"Ready for a request"}</span>
        </div>
        <p className="page-subtitle" style={{lineHeight:1.9,marginTop:16}}>{isAr?info.subtitleAr:info.subtitleEn}</p>
        <div className="notice-bar" style={{marginTop:16}}><ShieldCheck size={16}/><span>{isAr?"يُنشئ العمدة خطة عمل لمراجعتك. المخرجات المتخصصة تظل مساعدة معلوماتية وتحتاج مراجعة واعتماد المختص عند اللزوم؛ لا تُعرض هذه الصفحة كخدمة مهنية مرخصة.":"AL OMDA creates a plan for your review. Specialist outputs are informational assistance and require qualified review where appropriate; this page is not a licensed professional service."}</span></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:20}}>
          <button type="button" className="button button-primary" onClick={startTask}><Plus size={15}/>{isAr?"ابدأ مهمة في هذا التخصص":"Start a task in this specialty"}</button>
          <Link href="/agents" className="button button-secondary">{isAr?"العودة لشبكة الوكلاء":"Back to agent network"}</Link>
        </div>
      </section>
    </div>;
  };

  const workbenchPage = () => {
    const active = currentTask && (currentTask.status === 'review' || currentTask.status === 'paused' || currentTask.status === 'approved') ? currentTask : null;
    const workflowStage = planGenerating ? 1 : active?.status === 'approved' ? 2 : active ? 1 : 0;
    return <div className="page-enter">
      {pageHeading(t('workbenchTag'),t('workbench'),t('workbenchSub'),<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><button type="button" className="button button-primary button-small" onClick={()=>{setSelectedTaskId(null);setRequest('');setLocation(focusedHref('/workbench','request-input'));}} data-testid="button-new-project"><Plus size={14}/>{isAr?'مشروع جديد':'New project'}</button><span className="status-chip"><LockKeyhole size={12}/>{t('privacy')}</span></div>)}
      <ol className="workbench-flow" aria-label={isAr?'مراحل تنفيذ المهمة':'Task workflow'}>
        <li className="workbench-flow-step" data-stage={workflowStage===0?'current':workflowStage>0?'complete':'upcoming'}><span>01</span><div><strong>{isAr?'اكتب الطلب':'Describe'}</strong><small>{isAr?'حدد المطلوب والتخصص':'Set the goal and specialty'}</small></div></li>
        <li className="workbench-flow-step" data-stage={workflowStage===1?'current':workflowStage>1?'complete':'upcoming'}><span>02</span><div><strong>{isAr?'راجع الخطة':'Review plan'}</strong><small>{isAr?'افحص الخطوات والمخرجات':'Check steps and deliverables'}</small></div></li>
        <li className="workbench-flow-step" data-stage={workflowStage===2?'current':'upcoming'}><span>03</span><div><strong>{isAr?'وافق وتابع':'Approve & track'}</strong><small>{isAr?'احتفظ بالتحكم في التنفيذ':'Stay in control of execution'}</small></div></li>
      </ol>
      <section className="workbench-context" aria-label={isAr?'سياق مساحة العمل':'Workbench context'}>
        <div className="workbench-context-icon"><ShieldCheck size={18}/></div>
        <div><strong>{active?(isAr?'أنت تتابع مهمة محفوظة':'You are continuing a saved task'):(isAr?'ابدأ بطلب واضح ومحدد':'Start with a clear, specific request')}</strong><p>{active?active.title:(isAr?'حدد الهدف والتخصص، وبعدها راجع الخطة قبل اعتمادها.':'Set the goal and specialty, then review the proposed plan before approving it.')}</p></div>
        {active&&<Link href={focusedHref('/history/'+active.id,"task-plan")} className="button button-quiet button-small">{isAr?'تفاصيل المهمة':'Task details'}<ArrowLeft size={13}/></Link>}
      </section>
      <div className="workbench-layout">
        <form className="panel request-card" onSubmit={createPlan}>
          <div className="section-head"><h2 className="section-title">{t('request')}</h2><span className="status-chip"><Sparkles size={12}/>{isAr?'خطة فعلية بالذكاء الاصطناعي':'AI-generated plan'}</span></div>
          <div className="workbench-context" role="note" style={{marginBottom:14}}>
            <div className="workbench-context-icon"><Sparkles size={18}/></div>
            <div><strong>{isAr?'كيف يعمل مسار المشروع؟':'How the project workflow works'}</strong><p>{isAr?'اكتب الهدف والميزات والملفات المطلوبة والمنصة أو الموعد إن وجد. سيحلل العمدة طلبك وينشئ خطة فعلية باستخدام مزود الذكاء الاصطناعي المتصل. بعد مراجعتك واعتمادك، ينفذ كل مرحلة ويحفظ مخرجها داخل المشروع. لن يُنشأ ملف نهائي قبل اعتماد مرحلته وتنفيذها بنجاح.':'Describe the goal, features, required files, platform, and any deadline. AL OMDA will generate a real plan using the configured AI provider. After you review and approve it, each stage is executed and its deliverable is saved to the project. No final file is created until its stage is approved and successfully executed.'}</p></div>
          </div>
          <div className="field-group"><label className="form-label" htmlFor="request-input">{t('requestLabel')}</label><textarea id="request-input" className="field" placeholder={t('requestPlaceholder')} value={request} onChange={(event)=>setRequest(event.target.value)} data-testid="input-request"/></div>
          <div className="field-group"><div className="form-label">{t('chooseSpecialty')}</div><div className="select-grid">{specialties.map(({id,icon:Icon})=><button type="button" key={id} className={`select-specialty ${selectedSpecialty===id?'selected':''}`} onClick={()=>setSelectedSpecialty(id)} data-testid={`select-specialty-${id}`}><Icon size={14}/>{label(id)}</button>)}</div></div>
          <div className="notice-bar" style={{marginBottom:17}}><ShieldCheck size={14}/><span>{t('planDisclaimer')}</span></div>
          <button type="submit" className="button button-primary" disabled={!request.trim() || planGenerating} data-testid="button-propose-plan"><Sparkles size={15}/>{planGenerating ? (isAr ? 'جارٍ إنشاء الخطة...' : 'Generating plan...') : t('generatePlan')}<Send size={13}/></button>
          {(workspaceLoadError || workspaceError) && <div className="notice-bar notice-error" role="alert" style={{marginTop:12}}>{workspaceLoadError || workspaceError}</div>}
        </form>
        {active ? renderPlan(active) : <section className="panel plan-empty"><div><span className="empty-mark"><MessageSquareText size={22}/></span><h3>{t('planEmptyTitle')}</h3><p>{t('planEmptyText')}</p></div></section>}
      </div>
      {active && <div className="notice-bar" style={{marginTop:15}}><span>{t('taskPlan')}: <strong>{active.title}</strong> · {statusLabel(active.status)}</span><Link href={focusedHref(`/history/${active.id}`,"task-plan")} className="section-meta">{t('detail')}</Link></div>}
    </div>;
  };

  const handleDeleteTask = async (task:Task) => {
    const confirmed = window.confirm(isAr ? `هل أنت متأكد من حذف مشروع «${task.title}»؟ لا يمكن التراجع عن الحذف.` : `Delete “${task.title}”? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingTaskId(task.id);
    setWorkspaceError('');
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method:'DELETE', credentials:'same-origin', headers:{'x-requested-with':'XMLHttpRequest'} });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : (isAr ? 'تعذر حذف المشروع.' : 'Could not delete project.'));
      setSaved(prev=>({...prev,tasks:prev.tasks.filter(item=>item.id!==task.id)}));
      if (selectedTaskId===task.id) setSelectedTaskId(null);
      if (path===`/history/${task.id}`) setLocation(focusedHref('/history','history-list'));
    } catch(error) {
      window.alert(error instanceof Error ? error.message : (isAr ? 'تعذر حذف المشروع.' : 'Could not delete project.'));
    } finally { setDeletingTaskId(null); }
  };

  const escapeReportHtml = (value:unknown) => String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
  const buildTaskReportHtml = (task:Task) => {
    const direction = isAr ? 'rtl' : 'ltr';
    const title = escapeReportHtml(task.title);
    const rows = task.steps.map((step,index)=>`
      <section class="step">
        <h2>${isAr?'الخطوة':'Step'} ${index+1}: ${escapeReportHtml(step.text)}</h2>
        <p><strong>${isAr?'الحالة':'Status'}:</strong> ${escapeReportHtml(step.state==='approved'?(isAr?'معتمدة':'Approved'):step.state==='rejected'?(isAr?'مرفوضة':'Rejected'):(isAr?'بانتظار المراجعة':'Pending review'))}</p>
        <p><strong>${isAr?'المخرج المتوقع':'Expected output'}:</strong> ${escapeReportHtml(step.output || '—')}</p>
        <p><strong>${isAr?'معيار الاكتمال':'Completion check'}:</strong> ${escapeReportHtml(step.complete || '—')}</p>
        ${step.result ? `<h3>${isAr?'المخرج المنفذ':'Executed deliverable'}</h3><pre>${escapeReportHtml(step.result)}</pre><p class="muted">${isAr?'تاريخ التنفيذ':'Executed at'}: ${escapeReportHtml(step.executedAt || '—')}</p>` : ''}
        ${step.executionStatus==='failed' ? `<p class="failure"><strong>${isAr?'فشل التنفيذ':'Execution failed'}:</strong> ${escapeReportHtml(step.executionError || '—')}</p>` : ''}
      </section>`).join('');
    return `<!doctype html><html lang="${isAr?'ar':'en'}" dir="${direction}"><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:Arial,Tahoma,sans-serif;color:#20242a;line-height:1.8;margin:32px;direction:${direction}}
      h1{font-size:24px;border-bottom:2px solid #b89a61;padding-bottom:12px}
      h2{font-size:17px;color:#6d552b;margin-bottom:8px}h3{font-size:15px;margin-bottom:4px}
      .meta{color:#555;font-size:12px;margin-bottom:22px}.step{break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:12px;border:1px solid #ddd;font:13px/1.7 Arial,Tahoma,sans-serif}
      .muted{color:#666;font-size:11px}.failure{color:#a32626;background:#fff2f2;padding:8px}
      @media print{body{margin:15mm}.step{break-inside:avoid}}
    </style></head><body><h1>${title}</h1>
      <p class="meta">${isAr?'التخصص':'Specialty'}: ${escapeReportHtml(label(task.specialty))} · ${isAr?'الحالة':'Status'}: ${escapeReportHtml(statusLabel(task.status))} · ${isAr?'تاريخ الإنشاء':'Created'}: ${escapeReportHtml(task.createdAt)}</p>
      <h2>${isAr?'الطلب الأصلي':'Original request'}</h2><p>${escapeReportHtml(task.request)}</p>
      <h2>${isAr?'خطة المشروع ونتائج التنفيذ':'Project plan and execution results'}</h2>${rows}
      <p class="muted">AL OMDA AI · ${new Date().toISOString()}</p></body></html>`;
  };
  const reportFileBase = (task:Task) => 'al-omda-' + task.id.replace(/[^a-zA-Z0-9_-]/g,'-');
  const downloadReportBlob = (blob:Blob, filename:string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const loadReportLibrary = async (url:string) => import(/* @vite-ignore */ url);
  const reportParagraphs = (task:Task) => {
    const lines:{text:string;kind:'title'|'heading'|'body'}[] = [
      {text:task.title,kind:'title'},
      {text:(isAr?'التخصص: ':'Specialty: ')+label(task.specialty)+' · '+(isAr?'الحالة: ':'Status: ')+statusLabel(task.status)+' · '+(isAr?'تاريخ الإنشاء: ':'Created: ')+task.createdAt,kind:'body'},
      {text:isAr?'الطلب الأصلي':'Original request',kind:'heading'},
      {text:task.request,kind:'body'},
      {text:isAr?'خطة المشروع ونتائج التنفيذ':'Project plan and execution results',kind:'heading'},
    ];
    task.steps.forEach((step,index)=>{
      lines.push({text:(isAr?'الخطوة ':'Step ')+(index+1)+': '+step.text,kind:'heading'});
      lines.push({text:(isAr?'الحالة: ':'Status: ')+(step.state==='approved'?(isAr?'معتمدة':'Approved'):step.state==='rejected'?(isAr?'مرفوضة':'Rejected'):(isAr?'بانتظار المراجعة':'Pending review')),kind:'body'});
      lines.push({text:(isAr?'المخرج المتوقع: ':'Expected output: ')+(step.output||'—'),kind:'body'});
      lines.push({text:(isAr?'معيار الاكتمال: ':'Completion check: ')+(step.complete||'—'),kind:'body'});
      if(step.result) lines.push({text:(isAr?'نتيجة التنفيذ: ':'Execution result: ')+'\\n'+step.result,kind:'body'});
      if(step.executedAt) lines.push({text:(isAr?'تاريخ التنفيذ: ':'Executed at: ')+step.executedAt,kind:'body'});
      if(step.executionStatus==='failed') lines.push({text:(isAr?'سبب الفشل: ':'Failure reason: ')+(step.executionError||'—'),kind:'body'});
    });
    return lines;
  };
  const exportTaskWord = async (task:Task) => {
    try {
      const lib = await loadReportLibrary('https://esm.sh/docx@9.5.1');
      const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType} = lib;
      const children = reportParagraphs(task).map(line=>new Paragraph({
        heading:line.kind==='title'?HeadingLevel.TITLE:line.kind==='heading'?HeadingLevel.HEADING_2:undefined,
        alignment:isAr?AlignmentType.RIGHT:AlignmentType.LEFT,
        bidirectional:isAr,
        children:[new TextRun({text:line.text,bold:line.kind!=='body',font:'Arial'})],
        spacing:{after:line.kind==='heading'?140:90},
      }));
      const doc = new Document({sections:[{properties:{},children}]});
      const blob = await Packer.toBlob(doc);
      downloadReportBlob(blob,reportFileBase(task)+'.docx');
    } catch(error) {
      console.error('DOCX export failed',error);
      window.alert(isAr?'تعذر إنشاء ملف DOCX. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.':'Could not create the DOCX file. Check your internet connection and try again.');
    }
  };
  const exportTaskPdf = async (task:Task) => {
    let container:HTMLDivElement|undefined;
    try {
      const lib = await loadReportLibrary('https://esm.sh/html2pdf.js@0.10.3');
      const html2pdf = lib.default ?? lib;
      container=document.createElement('div');
      container.style.cssText='position:fixed;left:-10000px;top:0;width:780px;background:#fff;color:#20242a;padding:36px;font-family:Arial,Tahoma,sans-serif;line-height:1.8;direction:'+(isAr?'rtl':'ltr');
      container.innerHTML=buildTaskReportHtml(task).replace(/^<!doctype html>[\s\S]*?<body>/i,'').replace(/<\/body>[\s\S]*$/i,'');
      document.body.appendChild(container);
      await html2pdf().set({margin:10,filename:reportFileBase(task)+'.pdf',image:{type:'jpeg',quality:0.96},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(container).save();
    } catch(error) {
      console.error('PDF export failed',error);
      window.alert(isAr?'تعذر إنشاء PDF مباشرة. يمكنك استخدام خيار الطباعة ثم حفظ PDF.':'Direct PDF export failed. You can use Print and choose Save as PDF.');
    } finally { container?.remove(); }
  };
  const exportTaskPowerPoint = async (task:Task) => {
    try {
      const lib = await loadReportLibrary('https://esm.sh/pptxgenjs@3.12.0');
      const PptxGenJS = lib.default ?? lib;
      const pptx = new PptxGenJS();
      pptx.layout='LAYOUT_WIDE'; pptx.author='AL OMDA AI'; pptx.subject=task.request; pptx.title=task.title;
      pptx.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:isAr?'ar-SA':'en-US'};
      const addSlide=(title:string,body:string)=>{
        const page=pptx.addSlide(); page.background={color:'101114'};
        page.addText(title,{x:0.65,y:0.45,w:12,h:0.7,fontFace:'Arial',fontSize:25,bold:true,color:'D6B978',align:isAr?'right':'left',rtlMode:isAr});
        page.addText(body,{x:0.75,y:1.45,w:11.8,h:5.3,fontFace:'Arial',fontSize:17,color:'F1F1EF',margin:0.12,fit:'shrink',valign:'top',align:isAr?'right':'left',rtlMode:isAr,paraSpaceAfterPt:12});
        page.addText('AL OMDA AI',{x:0.7,y:7.05,w:12,h:0.2,fontSize:8,color:'8E9299',align:'center'});
      };
      addSlide(isAr?'ملخص المشروع':'Project overview',task.title+'\\n\\n'+(isAr?'الطلب: ':'Request: ')+task.request+'\\n\\n'+(isAr?'التخصص: ':'Specialty: ')+label(task.specialty)+' · '+(isAr?'الحالة: ':'Status: ')+statusLabel(task.status));
      task.steps.forEach((step,index)=>{
        const body=[(isAr?'الحالة: ':'Status: ')+(step.state==='approved'?(isAr?'معتمدة':'Approved'):step.state==='rejected'?(isAr?'مرفوضة':'Rejected'):(isAr?'بانتظار المراجعة':'Pending review')),(isAr?'المخرج المتوقع: ':'Expected output: ')+(step.output||'—'),(isAr?'معيار الاكتمال: ':'Completion check: ')+(step.complete||'—'),step.result?((isAr?'نتيجة التنفيذ: ':'Execution result: ')+'\\n'+step.result):'',step.executionStatus==='failed'?((isAr?'سبب الفشل: ':'Failure reason: ')+(step.executionError||'—')):''].filter(Boolean).join('\\n\\n');
        addSlide((isAr?'الخطوة ':'Step ')+(index+1)+': '+step.text,body);
      });
      await pptx.writeFile({fileName:reportFileBase(task)+'.pptx'});
    } catch(error) {
      console.error('PowerPoint export failed',error);
      window.alert(isAr?'تعذر إنشاء ملف PowerPoint. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.':'Could not create the PowerPoint file. Check your internet connection and try again.');
    }
  };
  const exportTaskExcel = async (task:Task) => {
    try {
      const lib = await loadReportLibrary('https://esm.sh/xlsx@0.18.5');
      const XLSX = lib.default ?? lib;
      const rows = [
        [isAr?'اسم المشروع':'Project',task.title],
        [isAr?'الطلب الأصلي':'Original request',task.request],
        [isAr?'التخصص':'Specialty',label(task.specialty)],
        [isAr?'الحالة':'Status',statusLabel(task.status)],
        [],
        [isAr?'رقم الخطوة':'Step','',isAr?'الخطوة':'Description',isAr?'الحالة':'Status',isAr?'المخرج المتوقع':'Expected output',isAr?'معيار الاكتمال':'Completion check',isAr?'نتيجة التنفيذ':'Execution result',isAr?'حالة التنفيذ':'Execution status',isAr?'سبب الفشل':'Failure reason'],
        ...task.steps.map((step,index)=>[index+1,'',step.text,step.state,step.output||'',step.complete||'',step.result||'',step.executionStatus||'',step.executionError||''])
      ];
      const sheet=XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols']=[{wch:14},{wch:4},{wch:42},{wch:18},{wch:38},{wch:38},{wch:55},{wch:18},{wch:45}];
      const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,isAr?'تقرير المشروع':'Project report');
      XLSX.writeFile(book,reportFileBase(task)+'.xlsx');
    } catch(error) {
      console.error('XLSX export failed',error);
      window.alert(isAr?'تعذر إنشاء ملف Excel. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.':'Could not create the Excel file. Check your internet connection and try again.');
    }
  };
  const printTaskReport = (task:Task) => {
    const reportWindow = window.open('','_blank');
    if (!reportWindow) { window.alert(isAr?'اسمح بفتح النوافذ المنبثقة لطباعة التقرير.':'Allow pop-ups to print the report.'); return; }
    reportWindow.document.open();
    reportWindow.document.write(buildTaskReportHtml(task));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const exportTasksSheet = (items:Task[]) => {
    const headers = isAr
      ? ['اسم المشروع','الطلب الأصلي','التخصص','حالة المشروع','رقم الخطوة','الخطوة','حالة الخطوة','المخرج المتوقع','معيار الاكتمال','نتيجة التنفيذ','حالة التنفيذ','سبب الفشل','تاريخ الإنشاء']
      : ['Project','Original request','Specialty','Project status','Step number','Step','Step status','Expected output','Completion check','Execution result','Execution status','Failure reason','Created at'];
    const rows = items.flatMap((task) => task.steps.length
      ? task.steps.map((step,index) => [
          task.title,
          task.request,
          label(task.specialty),
          statusLabel(task.status),
          index + 1,
          step.text,
          step.state === 'approved' ? (isAr ? 'معتمدة' : 'Approved') : step.state === 'rejected' ? (isAr ? 'مرفوضة' : 'Rejected') : (isAr ? 'بانتظار المراجعة' : 'Pending review'),
          step.output ?? '',
          step.complete ?? '',
          step.result ?? '',
          step.executionStatus ?? '',
          step.executionError ?? '',
          task.createdAt,
        ])
      : [[task.title,task.request,label(task.specialty),statusLabel(task.status),'','','','','','','','',task.createdAt]]);
    const escapeCell = (value:unknown) => '"' + String(value ?? '').replace(/"/g,'""') + '"';
    const csv = [headers,...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF',csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'al-omda-projects-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the object URL alive long enough for iOS Safari and other browsers
    // to start consuming the generated CSV download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const historyPage = () => {
    const filtered = tasks.filter((task)=>
      (historyStatusFilter === 'all' || (historyStatusFilter === 'review' ? task.status === 'review' || task.status === 'paused' : task.status === historyStatusFilter)) &&
      `${task.title} ${task.request} ${label(task.specialty)}`.toLowerCase().includes(query.toLowerCase())
    );
    return <div className="page-enter">
      {pageHeading(t('history'),t('history'),t('historySub'),<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="button button-quiet" onClick={()=>exportTasksSheet(filtered)} disabled={!filtered.length} aria-label={isAr?'تصدير المشاريع الظاهرة إلى ملف CSV':'Export visible projects to CSV'} data-testid="button-export-tasks"><FileText size={14}/>{isAr?'تصدير الجدول':'Export sheet'}</button><button type="button" className="button button-primary" onClick={()=>setLocation(focusedHref('/workbench','request-input'))} data-testid="button-create-task"><Plus size={15}/>{t('newTask')}</button></div>)}
      <section className="history-toolbar" aria-label={isAr?'أدوات تصفية المهام':'Task filters'}>
        <div className="history-search-wrap">
          <div className="field-group history-search-field"><label className="form-label" htmlFor="history-search">{isAr?'ابحث في مشاريعك':'Find a project'}</label><div className="history-search-control"><Search size={16} aria-hidden="true"/><input id="history-search" className="field" placeholder={t('searchTasks')} value={query} onChange={(event)=>setQuery(event.target.value)} data-testid="input-search-tasks"/></div></div>
          <div className="history-results-count" role="status"><strong>{filtered.length}</strong><span>{isAr?'مشروع':'projects'}</span></div>
        </div>
        <nav className="history-filter-list" aria-label={isAr?'تصفية حسب الحالة':'Filter by status'}>
          {[{key:'all',href:focusedHref('/history','history-list'),label:isAr?'كل المشاريع':'All projects',count:tasks.length},{key:'review',href:focusedHref('/history?status=review','history-list'),label:isAr?'تحتاج متابعة':'Needs review',count:tasks.filter(task=>task.status==='review'||task.status==='paused').length},{key:'approved',href:focusedHref('/history?status=approved','history-list'),label:isAr?'معتمدة':'Approved',count:tasks.filter(task=>task.status==='approved').length},{key:'stopped',href:focusedHref('/history?status=stopped','history-list'),label:isAr?'متوقفة':'Stopped',count:tasks.filter(task=>task.status==='stopped').length}].map(filter=><button key={filter.key} type="button" onClick={()=>{setHistoryStatusFilter(filter.key as 'all'|'review'|'approved'|'stopped');setLocation(filter.href);}} aria-pressed={historyStatusFilter===filter.key} aria-current={historyStatusFilter===filter.key?'page':undefined} className={'history-filter-chip '+(historyStatusFilter===filter.key?'active':'')} data-testid={'history-filter-'+filter.key}><span>{filter.label}</span><strong>{filter.count}</strong></button>)}
        </nav>
      </section>
      <div className="history-list-heading"><div><strong>{isAr?'مشاريعك':'Your projects'}</strong><span>{isAr?'تعرض مهامك وحالتها الحالية':'Your saved tasks and their current status'}</span></div><span className="history-list-total">{filtered.length} {isAr?'نتيجة':'results'}</span></div>
      <div className="history-layout" id="history-list">{filtered.map((task)=><div className="panel history-item history-item-manage" key={task.id} data-testid={`history-task-${task.id}`}>
        <Link href={focusedHref(`/history/${task.id}`,"task-plan")} className="history-item-open">
          <span className="task-icon">{taskIcon(task.specialty)}</span><span className="task-main"><strong>{task.title}</strong><small>{label(task.specialty)} · {dateLabel(task.createdAt,language)} · {count(task)}/{task.steps.length} {t('approvedCount')}{task.demo?` · ${t('demoTask')}`:''}</small></span>{statusBadge(task.status)}<ArrowLeft size={15} className="muted"/>
        </Link>
        <button type="button" className="button button-danger button-small task-delete-button" onClick={()=>void handleDeleteTask(task)} disabled={deletingTaskId===task.id} aria-label={isAr?'حذف المشروع':'Delete project'} title={isAr?'حذف المشروع':'Delete project'}><Trash2 size={14}/>{deletingTaskId===task.id?(isAr?'جارٍ الحذف':'Deleting…'):(isAr?'حذف':'Delete')}</button>
      </div>)}
      {filtered.length===0 && <div className="panel plan-empty"><div><span className="empty-mark"><History size={21}/></span><h3>{tasks.length ? t('noTasks') : t('emptyHistory')}</h3><p>{tasks.length ? t('noTasks') : t('emptyHistoryText')}</p>{!tasks.length&&<Link href={focusedHref("/workbench","request-input")} className="button button-primary" style={{marginTop:16}}>{t('toWorkbench')}</Link>}</div></div>}</div>
    </div>;
  };

  const projectsPage = () => {
    const projects = tasks.filter(task=>!task.demo)
      .filter(task=>historyStatusFilter==='all'||(historyStatusFilter==='review'?(task.status==='review'||task.status==='paused'):task.status===historyStatusFilter))
      .filter(task=>projectCategoryFilter==='all'||task.specialty===projectCategoryFilter)
      .filter(task=>`${task.title} ${task.request} ${label(task.specialty)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const categories:Array<{id:'all'|Specialty;name:string}> = [{id:'all',name:isAr?'الكل':'All'},...specialties.map(item=>({id:item.id,name:label(item.id)}))];
    return <div className="page-enter" id="projects-list">
      {pageHeading(isAr?'مساحة العمل':'WORKSPACE',isAr?'المشاريع':'Projects',isAr?'كل مشاريعك المحفوظة وحالات تنفيذها في مكان واحد.':'All saved projects and their execution status in one place.',<Link href={focusedHref('/workbench','request-input')} className="button button-primary"><Plus size={14}/>{isAr?'مشروع جديد':'New project'}</Link>)}
      <section className="history-toolbar" aria-label={isAr?'أدوات تصفية المشاريع':'Project filters'}>
        <div className="history-search-wrap">
          <div className="field-group history-search-field"><label className="form-label" htmlFor="projects-search">{isAr?'ابحث في المشاريع':'Search projects'}</label><div className="history-search-control"><Search size={16}/><input id="projects-search" className="field" placeholder={isAr?'اسم المشروع أو وصفه...':'Project name or description...'} value={query} onChange={event=>setQuery(event.target.value)}/></div></div>
          <div className="history-results-count"><strong>{projects.length}</strong><span>{isAr?'مشروع':'projects'}</span></div>
          <div style={{display:'flex',gap:5}}>
            <button type="button" className={'button button-small '+(projectViewMode==='grid'?'button-primary':'button-quiet')} onClick={()=>setProjectViewMode('grid')} aria-pressed={projectViewMode==='grid'}>{isAr?'شبكة':'Grid'}</button>
            <button type="button" className={'button button-small '+(projectViewMode==='list'?'button-primary':'button-quiet')} onClick={()=>setProjectViewMode('list')} aria-pressed={projectViewMode==='list'}>{isAr?'قائمة':'List'}</button>
          </div>
        </div>
        <nav className="history-filter-list" aria-label={isAr?'تصفية حسب التخصص':'Filter by specialty'}>
          {categories.map(category=><button key={category.id} type="button" className={'history-filter-chip'+(projectCategoryFilter===category.id?' active':'')} aria-pressed={projectCategoryFilter===category.id} onClick={()=>setProjectCategoryFilter(category.id)}>{category.name}</button>)}
        </nav>
        <nav className="history-filter-list" aria-label={isAr?'تصفية حسب الحالة':'Filter by status'}>
          {[{key:'all',name:isAr?'كل الحالات':'All statuses'},{key:'review',name:isAr?'تحتاج مراجعة':'Needs review'},{key:'approved',name:isAr?'معتمدة':'Approved'},{key:'stopped',name:isAr?'متوقفة':'Stopped'}].map(filter=><button key={filter.key} type="button" className={'history-filter-chip'+(historyStatusFilter===filter.key?' active':'')} aria-pressed={historyStatusFilter===filter.key} onClick={()=>setHistoryStatusFilter(filter.key as 'all'|'review'|'approved'|'stopped')}>{filter.name}</button>)}
        </nav>
      </section>
      {projects.length>0?<div className={projectViewMode==='grid'?'dashboard-grid':'history-layout'} style={projectViewMode==='grid'?{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))'}:undefined}>
        {projects.map(task=><article className="panel panel-pad" key={task.id}>
          <div className="section-head"><span className="task-icon">{taskIcon(task.specialty,18)}</span>{statusBadge(task.status)}</div>
          <h2 className="section-title" style={{fontSize:14,margin:'8px 0'}}>{task.title}</h2>
          <p className="page-subtitle" style={{minHeight:42}}>{task.request.slice(0,150)}{task.request.length>150?'…':''}</p>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:17}}><span className="section-meta">{label(task.specialty)}</span><strong style={{fontSize:11}}>{task.steps.length?Math.round(executionCount(task)/task.steps.length*100):0}%</strong></div>
          <div className="task-detail-progress-track" style={{marginTop:8}}><span style={{width:(task.steps.length?executionCount(task)/task.steps.length*100:0)+'%'}}/></div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:15}}><span className="section-meta">{dateLabel(task.createdAt,language)}</span><Link href={focusedHref('/history/'+task.id,'task-plan')} className="button button-quiet button-small">{isAr?'فتح المشروع':'Open project'} <ArrowLeft size={13}/></Link></div>
        </article>)}
      </div>:<div className="panel plan-empty"><div><span className="empty-mark"><BriefcaseBusiness size={21}/></span><h3>{isAr?'لا توجد مشاريع مطابقة':'No matching projects'}</h3><p>{isAr?'أنشئ مشروعًا جديدًا أو غيّر عوامل التصفية.':'Create a project or adjust the filters.'}</p><Link href={focusedHref('/workbench','request-input')} className="button button-primary" style={{marginTop:16}}><Plus size={14}/>{isAr?'مشروع جديد':'New project'}</Link></div></div>}
    </div>;
  };

  const pipelinePage = () => {
    const activeTasks = tasks.filter((task) => !task.demo);
    const columns: Array<{ id:string; title:string; tasks:Task[] }> = [
      { id:'review', title:isAr?'بانتظار المراجعة':'Needs review', tasks:activeTasks.filter(task=>task.status==='review') },
      { id:'in-progress', title:isAr?'قيد التنفيذ':'In progress', tasks:activeTasks.filter(task=>task.status==='approved' && !task.steps.every(step=>step.executionStatus==='succeeded' && Boolean(step.result))) },
      { id:'completed', title:isAr?'مكتملة':'Completed', tasks:activeTasks.filter(task=>task.status==='approved' && task.steps.length>0 && task.steps.every(step=>step.executionStatus==='succeeded' && Boolean(step.result))) },
      { id:'paused', title:isAr?'متوقفة أو معلّقة':'Paused or stopped', tasks:activeTasks.filter(task=>task.status==='paused' || task.status==='stopped') },
    ];
    return <div className="page-enter" id="pipeline-board">
      {pageHeading(isAr?'مسار العمل':'WORKSPACE PIPELINE',isAr?'مسار المشاريع':'Project pipeline',isAr?'تابع انتقال كل مشروع بين المراجعة والتنفيذ والاكتمال.':'Track each saved project from review through execution and completion.',<Link href={focusedHref('/workbench','request-input')} className="button button-primary"><Plus size={14}/>{isAr?'مشروع جديد':'New project'}</Link>)}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,230px),1fr))',gap:12,alignItems:'start'}}>
        {columns.map(column=><section className="panel panel-pad" key={column.id} aria-label={column.title}>
          <div className="section-head"><h2 className="section-title">{column.title}</h2><span className="section-meta">{column.tasks.length}</span></div>
          <div style={{display:'grid',gap:9}}>
            {column.tasks.map(task=><Link key={task.id} href={focusedHref('/history/'+task.id,'task-plan')} className="panel" style={{display:'block',padding:13,textDecoration:'none',color:'inherit'}}>
              <strong style={{display:'block',fontSize:12,marginBottom:7}}>{task.title}</strong>
              <span className="section-meta">{label(task.specialty)} · {executionCount(task)}/{task.steps.length} {isAr?'خطوات منفذة':'completed steps'}</span>
              <div className="task-detail-progress-track" style={{marginTop:11}}><span style={{width:(task.steps.length?count(task)/task.steps.length*100:0)+'%'}}/></div>
            </Link>)}
            {column.tasks.length===0&&<div className="plan-empty" style={{padding:18,textAlign:'center'}}><span className="section-meta">{isAr?'لا توجد مشاريع هنا':'No projects in this stage'}</span></div>}
          </div>
        </section>)}
      </div>
    </div>;
  };

  const assetsPage = () => <WorkspaceAssets language={language} projects={tasks.filter(task=>!task.demo).map(task=>({id:task.id,title:task.title}))} />;

  const taskDetailPage = (task:Task) => {
    const successfulExecutions = task.steps.filter((step)=>step.executionStatus === 'succeeded' && Boolean(step.result)).length;
    const failedExecutions = task.steps.filter((step)=>step.executionStatus === 'failed').length;
    const unexecutedSteps = task.steps.filter((step)=>step.state === 'approved' && !step.result && step.executionStatus !== 'failed').length;
    const executionTotal = successfulExecutions + failedExecutions;
    const successShare = executionTotal ? successfulExecutions / executionTotal * 100 : 0;
    const failureShare = executionTotal ? failedExecutions / executionTotal * 100 : 0;
    const marketTrend = successfulExecutions > failedExecutions ? 'up' : failedExecutions > successfulExecutions ? 'down' : 'flat';
    const TrendIcon = marketTrend === 'up' ? TrendingUp : marketTrend === 'down' ? TrendingDown : Minus;
    const trendLabel = marketTrend === 'up' ? (isAr?'نجاحات أكثر':'More successful runs') : marketTrend === 'down' ? (isAr?'إخفاقات أكثر':'More failed runs') : (isAr?'نتائج متساوية':'Even results');
    return <div className="page-enter">
      {pageHeading(t('detail'),task.title,`${label(task.specialty)} · ${dateLabel(task.createdAt,language)}`,<Link href={focusedHref("/history","history-list")} className="button button-quiet"><ArrowRight size={14}/>{t('backHistory')}</Link>)}
      <section className="task-detail-overview" aria-label={isAr?'ملخص تقدم المهمة':'Task progress overview'}>
        <div className="task-detail-progress-copy"><span className="eyebrow">{isAr?'تقدم الخطة':'PLAN PROGRESS'}</span><strong>{count(task)} <small>/ {task.steps.length} {isAr?'خطوات معتمدة':'steps approved'}</small></strong><p>{isAr?'تابع حالة كل خطوة ومخرجات التنفيذ المسجلة.':'Track each step and its recorded execution results.'}</p></div>
        <div className="task-detail-progress-track" role="progressbar" aria-valuenow={task.steps.length?Math.round(count(task)/task.steps.length*100):0} aria-valuemin={0} aria-valuemax={100}><span style={{width:(task.steps.length?count(task)/task.steps.length*100:0)+'%'}}/></div>
        <div className="task-detail-progress-meta">{statusBadge(task.status)}<span>{successfulExecutions} {isAr?'ناجحة':'successful'}</span><span>{failedExecutions} {isAr?'فاشلة':'failed'}</span></div>
      </section>
      <div className="history-detail">
        <div>{renderPlan(task)}</div>
        <aside className="project-tracking">
          <section className="panel panel-pad">
            <div className="section-head"><h2 className="section-title">{isAr?'مؤشرات المشروع':'Project indicators'}</h2>{statusBadge(task.status)}</div>
            <div className="market-trend-board">
              <div className={`market-main-trend ${marketTrend}`}>
                <div className="market-trend-heading"><small>{isAr?'توازن نتائج التنفيذ':'Execution outcome balance'}</small><span className="market-live-dot"/></div>
                <div className="market-trend-main"><TrendIcon size={34} strokeWidth={2.6}/><strong>{trendLabel}</strong></div>
                <div className="market-sparkline" role="img" aria-label={isAr?'نسب نجاح وإخفاق التنفيذ':'Execution success and failure proportions'}>
                  {executionTotal > 0 ? <>
                    <span style={{width:successShare + '%',background:'#50e3a4'}}/>
                    <span style={{width:failureShare + '%',background:'#ff687b'}}/>
                  </> : <span style={{width:'100%',background:'rgba(241,199,111,.35)'}}/>}
                </div>
              </div>
              <div className="market-signals">
                <div className="market-signal up"><TrendingUp size={23}/><span><small>{isAr?'التنفيذات الناجحة':'Successful runs'}</small><strong>{successfulExecutions}</strong></span></div>
                <div className={`market-signal ${failedExecutions>0?'down':'flat'}`}>{failedExecutions>0?<TrendingDown size={23}/>:<Minus size={23}/>}<span><small>{isAr?'التنفيذات الفاشلة':'Failed runs'}</small><strong>{failedExecutions}</strong></span></div>
                <div className="market-signal flat"><Activity size={23}/><span><small>{isAr?'بانتظار التنفيذ':'Awaiting execution'}</small><strong>{unexecutedSteps}</strong></span></div>
              </div>
            </div>
            <div className="setting-row"><div><strong>{isAr?'حالة التنفيذ الفعلي':'Actual execution'}</strong><small>{isAr?`نجح ${successfulExecutions} · فشل ${failedExecutions} · متبقٍ ${unexecutedSteps}`:`${successfulExecutions} succeeded · ${failedExecutions} failed · ${unexecutedSteps} awaiting`}</small></div><span className={`status-chip ${failedExecutions>0?'stopped':successfulExecutions>0?'approved':'paused'}`}>{successfulExecutions+failedExecutions>0?(isAr?'مسجل':'Tracked'):(isAr?'لم يبدأ':'Not started')}</span></div>
            <div className="notice-bar" style={{marginTop:14}}><ShieldCheck size={15}/><span>{isAr?'السهم يعكس نتائج تشغيل خطوات الذكاء الاصطناعي المسجلة فقط، ولا يعني اجتياز اختبارات خارجية أو اكتمال المشروع بالكامل.':'The trend reflects recorded AI step runs only; it does not certify external tests or full project completion.'}</span></div>
          </section>
          <section className="panel panel-pad">
            <div className="section-head"><h2 className="section-title">{t('taskRequest')}</h2></div>
            <p style={{color:'#b7b7b1',fontSize:11,lineHeight:1.9,margin:'0 0 18px',overflowWrap:'anywhere'}}>{task.request}</p>
            <div className="setting-row"><div><strong>{t('created')}</strong><small>{dateLabel(task.createdAt,language)}</small></div></div>
            <div className="setting-row"><div><strong>{t('planIsDemo')}</strong><small>{task.demo?t('demoTask'):t('userTask')}</small></div></div>
            <div className="notice-bar" style={{marginTop:15}}><ShieldCheck size={15}/><span>{t('noExecution')}</span></div>
          </section>
        </aside>
      </div>
    </div>;
  };

  const accentOptions = [
    {id:'blue',name:isAr?'أزرق':'Blue',color:'#78a9ff'},
    {id:'violet',name:isAr?'بنفسجي':'Violet',color:'#a78bfa'},
    {id:'cyan',name:isAr?'سماوي':'Cyan',color:'#67d8ef'},
    {id:'teal',name:isAr?'فيروزي':'Teal',color:'#62d6c2'},
    {id:'pink',name:isAr?'وردي':'Pink',color:'#f29ac7'},
    {id:'amber',name:isAr?'ذهبي':'Amber',color:'#e9c27b'},
    {id:'lime',name:isAr?'أخضر':'Lime',color:'#b7df8a'},
  ];
  const wallpaperOptions = [
    {id:'midnight',name:isAr?'ليل داكن':'Midnight',background:'linear-gradient(135deg,#080b12,#151b2a 55%,#101923)'},
    {id:'ocean',name:isAr?'محيط':'Ocean',background:'linear-gradient(135deg,#061c2b,#0d4052 55%,#10243d)'},
    {id:'aurora',name:isAr?'الشفق':'Aurora',background:'linear-gradient(135deg,#10152c,#26334a 48%,#183d3b)'},
    {id:'purple',name:isAr?'بنفسجي':'Purple',background:'linear-gradient(135deg,#171126,#302044 55%,#17243a)'},
    {id:'forest',name:isAr?'غابة':'Forest',background:'linear-gradient(135deg,#0b1b17,#1c3930 55%,#15242a)'},
    {id:'sunset',name:isAr?'غروب':'Sunset',background:'linear-gradient(135deg,#24151a,#49302d 55%,#1c2432)'},
    {id:'graphite',name:isAr?'جرافيت':'Graphite',background:'linear-gradient(135deg,#111315,#292d32 55%,#171b20)'},
  ];
  const profilePage = () => <div className="page-enter profile-settings-page">
    {pageHeading(t('profile'),isAr?'مركز حسابك':'Your account center',isAr?'بياناتك الشخصية وإعدادات التطبيق والتحكم في تجربتك كلها في مكان واحد.':'Your personal details, app preferences, and account controls in one place.')}
    <section className="profile-welcome" aria-label={isAr?'ملخص الحساب':'Account overview'}>
      <div className="profile-welcome-identity">
        <div className="profile-welcome-avatar">{authUser && avatarPath ? <img src={'/api/storage/avatar?v='+avatarVersion} alt={t('avatar')}/> : <span>{profileName.trim().charAt(0)||'ع'}</span>}</div>
        <div className="profile-welcome-copy">
          <span className="eyebrow">{isAr?'مساحتك الشخصية':'YOUR PERSONAL SPACE'}</span>
          <h2>{isAr?'أهلاً بك، ': 'Welcome, '}{profileName.trim() || defaultDisplayName}</h2>
          <p>{isAr?'كل تفاصيل حسابك ونشاطك وإعدادات تجربتك في مكان واحد.':'Your account details, activity, and experience settings in one place.'}</p>
          <span className={'profile-account-state '+(authUser?'is-connected':'is-local')}><i/>{authUser?(isAr?'الحساب متصل':'Account connected'):(isAr?'تستخدم العمدة كزائر':'Using AL OMDA locally')}</span>
        </div>
      </div>
      <div className="profile-welcome-stats">
        <div><strong>{tasks.length}</strong><span>{isAr?'إجمالي المهام':'Total tasks'}</span></div>
        <div><strong>{tasks.filter(item=>item.status==='approved').length}</strong><span>{isAr?'مهام معتمدة':'Approved'}</span></div>
        <div><strong>{tasks.filter(item=>item.status==='review').length}</strong><span>{isAr?'تحتاج مراجعة':'In review'}</span></div>
      </div>
    </section>
    <div className="profile-settings-layout">
              <section className="panel panel-pad profile-main-card profile-account-profile-card profile-account-first" id="profile-account-card">
          <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'الحساب والأمان':'ACCOUNT & SECURITY'}</span><h2>{isAr?'حالة الحساب':'Account status'}</h2><p>{isAr?'إدارة جلسة الدخول والوصول إلى بياناتك.':'Manage your sign-in and account access.'}</p></div><LockKeyhole size={18}/></div>
          {authLoading && <p className="account-copy" role="status">{t('authChecking')}</p>}
          {!authLoading && !authUser && <>
            <p className="account-copy">{authStatus==='configured' ? t('authConfigured') : (isAr ? 'نموذج الدخول وإنشاء الحساب متاح، لكن خدمة الحسابات غير جاهزة حاليًا.' : 'The sign-in and sign-up form is available, but the account service is not ready yet.')}</p>
            {authStatus==='unconfigured' && <div className="notice-bar" role="status"><ShieldCheck size={15}/><span>{t('authUnavailable')}</span></div>}
            {authStatus==='offline' && <div className="notice-bar notice-error" role="alert"><ShieldCheck size={15}/><span>{authError||t('apiUnavailable')}</span></div>}
            <form className="account-form" onSubmit={handleAuthSubmit}>
              <div className="field-group"><label className="form-label" htmlFor="auth-email">{t('email')}</label><input id="auth-email" name="email" type="email" className="field" autoComplete="email" required maxLength={254} value={authEmail} onChange={(event)=>setAuthEmail(event.target.value)} data-testid="input-auth-email" placeholder="name@example.com"/></div>
              <div className="field-group"><label className="form-label" htmlFor="auth-password">{t('password')}</label><input id="auth-password" name="password" type="password" className="field" autoComplete={authMode==='login'?'current-password':'new-password'} required minLength={8} maxLength={128} value={authPassword} onChange={(event)=>setAuthPassword(event.target.value)} data-testid="input-auth-password" placeholder={isAr?'8 أحرف على الأقل':'At least 8 characters'}/></div>
              {authError&&<div className="notice-bar notice-error" role="alert">{authError}</div>}
              <button className="button button-primary" type="submit" disabled={authWorking || authStatus!=='configured'} data-testid="button-auth-submit"><LockKeyhole size={14}/>{authWorking?t('authWorking'):authMode==='login'?(isAr?'تسجيل الدخول':t('signIn')):(isAr?'إنشاء حساب':t('signUp'))}</button>
            </form>
            <div className="account-mode-switch" role="group" aria-label={isAr?'اختيار نوع الحساب':'Choose account action'}>
              <button type="button" className={'account-mode-button'+(authMode==='login'?' is-active':'')} aria-pressed={authMode==='login'} onClick={()=>{setAuthMode('login');setAuthError('');setAuthNotice('');}} data-testid="button-auth-login-mode">{isAr?'تسجيل الدخول':t('signIn')}</button>
              <button type="button" className={'account-mode-button'+(authMode==='signup'?' is-active':'')} aria-pressed={authMode==='signup'} onClick={()=>{setAuthMode('signup');setAuthError('');setAuthNotice('');}} data-testid="button-auth-signup-mode">{isAr?'إنشاء حساب جديد':t('signUp')}</button>
            </div>
          </>}
          {!authLoading && authUser && <div className="account-signed-in"><div className="account-email"><span className="online-dot"/><span>{t('signedInAs')} <strong>{authUser.email}</strong></span></div><p className="account-copy">{t('authConfigured')}</p><button type="button" className="button button-danger button-small" onClick={()=>void handleSignOut()} disabled={authWorking}>{t('signOut')}</button></div>}
          {authNotice&&<div className="notice-bar account-message" role="status">{authNotice}</div>}{(workspaceLoadError||workspaceError)&&<div className="notice-bar notice-error account-message" role="alert">{workspaceLoadError||workspaceError}</div>}
        
        <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'البيانات الشخصية':'PERSONAL INFORMATION'}</span><h2>{isAr?'بيانات الملف الشخصي':'Profile information'}</h2><p>{isAr?'حدّث بياناتك التي تظهر داخل مساحة عمل العمدة.':'Update the details shown across your workspace.'}</p></div><UserRound size={19}/></div>
        <div className="profile-summary profile-summary-large">{authUser && avatarPath ? <img className="profile-avatar profile-avatar-image" src={'/api/storage/avatar?v='+avatarVersion} alt={t('avatar')} data-testid="img-profile-avatar"/> : <div className="profile-avatar">{profileName.trim().charAt(0)||'ع'}</div>}<div><h2>{profileName.trim() || defaultDisplayName}</h2><span>{authUser?.email || (isAr?'حساب محلي على هذا الجهاز':'Local account on this device')}</span></div></div>
        <div className="profile-fields-grid">
          <div className="field-group"><label className="form-label" htmlFor="profile-name">{t('displayName')}</label><input id="profile-name" className="field" value={profileName} maxLength={100} onChange={(event)=>setProfileName(event.target.value)} placeholder={t('updateName')} data-testid="input-profile-name"/></div>
          <div className="field-group"><label className="form-label" htmlFor="profile-org">{t('organization')}</label><input id="profile-org" className="field" value={profileOrg} onChange={(event)=>setProfileOrg(event.target.value)} placeholder={t('updateOrg')} data-testid="input-profile-org"/></div>
        </div>
        <div className="profile-actions-row"><button className="button button-primary" onClick={()=>void handleSaveProfile()} data-testid="button-save-profile"><Check size={14}/>{savedToast?t('saved'):t('saveProfile')}</button>{authUser && <label className={'button button-quiet '+(avatarWorking?'disabled':'')} htmlFor="avatar-file"><UserRound size={14}/>{avatarWorking?t('authWorking'):t('uploadAvatar')}</label>}</div>
        {authUser && <><input id="avatar-file" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} disabled={avatarWorking} data-testid="input-avatar-file"/><small className="account-hint">{t('avatarHint')}</small></>}
      </section>
              <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'إعدادات التطبيق':'APP SETTINGS'}</span><h2>{isAr?'تفضيلات التطبيق':'Application preferences'}</h2><p>{isAr?'إعدادات اللغة وتقليل الحركة.':'Your language and reduced-motion preferences.'}</p></div><Settings2 size={18}/></div></summary>
          <div className="setting-row"><div><strong>{t('language')}</strong><small>{t('languageDesc')}</small></div><button className="button button-quiet button-small" onClick={toggleLanguage}>{isAr?'العربية':'English'} <ChevronDown size={12}/></button></div>
          <div className="setting-row"><div><strong>{isAr?"تقليل الحركة والمؤثرات":"Reduce motion"}</strong><small>{isAr?"إيقاف حركات الخلفيات والوميض والانتقالات لتجربة أهدأ.":"Reduce animated backgrounds, button glow, and transitions."}</small></div><button type="button" role="switch" aria-checked={Boolean(saved.reduceMotion)} className={"toggle "+(saved.reduceMotion?"on":"")} onClick={()=>setSaved((prev)=>({...prev,reduceMotion:!prev.reduceMotion}))} aria-label={isAr?"تقليل الحركة":"Reduce motion"}/></div>
        </details>

      
      <div className="profile-settings-side">
        <section className="panel panel-pad profile-features-card">
          <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'ابدأ من هنا':'GET STARTED'}</span><h2>{t('discoverFeatures')}</h2><p>{t('discoverFeaturesText')}</p></div><Compass size={18}/></div>
          <div className="profile-feature-grid">
            <Link href={navigationHref("/ai")} className="profile-feature-link"><Bot size={19}/><span><strong>{t('featureChat')}</strong><small>{t('featureChatText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href={focusedHref("/agents","agent-marketplace-grid")} className="profile-feature-link"><Compass size={19}/><span><strong>{t('featureAgents')}</strong><small>{t('featureAgentsText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href={focusedHref("/workbench","request-input")} className="profile-feature-link"><BriefcaseBusiness size={19}/><span><strong>{t('featureWorkbench')}</strong><small>{t('featureWorkbenchText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href={focusedHref("/history","history-list")} className="profile-feature-link"><History size={19}/><span><strong>{t('featureHistory')}</strong><small>{t('featureHistoryText')}</small></span><ArrowUpLeft size={14}/></Link>
            
          </div>
        </section>


        <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'الخصوصية والتحكم':'PRIVACY & CONTROL'}</span><h2>{isAr?'كيف يعمل حسابك':'How your account works'}</h2><p>{isAr?'معلومات واضحة عن حفظ البيانات وصلاحيات التطبيق.':'Clear information about data storage and app permissions.'}</p></div><ShieldCheck size={18}/></div></summary>
          {[isAr?'بيانات الملف والمهام المرتبطة بحسابك تُحفظ في مساحة حسابك عند تسجيل الدخول.':'Profile details and tasks are saved to your account when signed in.',isAr?'تفضيلات المظهر واللغة والتنبيهات تُحفظ على هذا الجهاز.':'Appearance, language, and notification preferences are saved on this device.',isAr?'لا يتم تنفيذ إجراءات خارجية دون موافقتك.':'No external action is taken without your approval.'].map((item,index)=><div className="setting-row profile-trust-row" key={index}><span className="specialty-icon"><Check size={14}/></span><strong>{item}</strong></div>)}
        </details>
      </div>
    </div>
  </div>;

  const notFoundPage = (title:string, description:string, href:string, action:string) => (
    <div className="page-enter">
      <section className="panel panel-pad plan-empty">
        <div>
          <span className="empty-mark"><FileText size={21}/></span>
          <h3>{title}</h3>
          <p>{description}</p>
          <Link href={href} className="button button-primary" style={{marginTop:16}}>{action}</Link>
        </div>
      </section>
    </div>
  );

  let page:ReactNode;
  if (detailMatch && currentTask) page = taskDetailPage(currentTask);
  else if (detailMatch) page = notFoundPage(
    isAr ? 'المشروع غير موجود' : 'Project not found',
    isAr ? 'المشروع المطلوب غير موجود أو تم حذفه.' : 'The requested project does not exist or has been deleted.',
    '/history',
    isAr ? 'العودة إلى سجل المهام' : 'Back to task history',
  );
  else if (path === '/ai/usage') page = <AIChatPage language={language} signedIn={Boolean(authUser)} />;
  else if (path === '/ai') page = <AIChatPage language={language} signedIn={Boolean(authUser)} />;
  else if (path === '/agents') page = agentsPage();
  else if (path === '/tools/seo') page = <SeoAuditWorkspace language={language} />;
  else if (path in professionalSpecialtyPages) page = professionalSpecialtyPage(path);
  else if (path === '/workbench') page = workbenchPage();
  else if (path === '/projects') page = projectsPage();
  else if (path === '/pipeline') page = pipelinePage();
  else if (path === '/assets') page = assetsPage();
  else if (path === '/collaboration/contacts') page = <CollaborationWorkspace key="contact" kind="contact" language={language} />;
  else if (path === '/collaboration/calendar') page = <CollaborationWorkspace key="event" kind="event" language={language} />;
  else if (path === '/collaboration/tickets') page = <CollaborationWorkspace key="ticket" kind="ticket" language={language} />;
  else if (path === '/system/security') page = <AuditLogWorkspace language={language} />;
  else if (path === '/finance/sales-overview') page = <SalesAnalyticsWorkspace language={language} mode="overview" />;
  else if (path === '/finance/sales-distribution') page = <SalesAnalyticsWorkspace language={language} mode="distribution" />;
  else if (path in platformStatusPages) page = platformStatusPage(path);
  else if (path === '/history') page = historyPage();
  else if (path === '/profile') page = profilePage();
  else if (path === '/') page = dashboardPage();
  else page = notFoundPage(
    isAr ? 'الصفحة غير موجودة' : 'Page not found',
    isAr ? 'الرابط الذي فتحته غير موجود داخل التطبيق.' : 'The address you opened is not part of this application.',
    '/',
    isAr ? 'العودة للرئيسية' : 'Back to dashboard',
  );
  const pageTitleKey = path === '/ai/usage' ? 'aiChat' : path === '/ai' ? 'aiChat' : path === '/agents' ? 'agents' : path === '/workbench' ? 'workbench' : path.startsWith('/history') ? 'history' : path === '/profile' ? 'profile' : 'overview';
  const platformTitle = platformStatusPages[path as keyof typeof platformStatusPages];
  const professionalTitle = professionalSpecialtyPages[path as keyof typeof professionalSpecialtyPages];
  const pageTitle = path === '/tools/seo' ? (isAr?'فحص وتحسين SEO':'SEO Audit & Optimization') : professionalTitle ? (isAr?professionalTitle.ar:professionalTitle.en) : platformTitle ? (isAr?platformTitle.ar:platformTitle.en) : path === '/projects' ? (isAr?'المشاريع':'Projects') : path === '/pipeline' ? (isAr?'مسار العمل':'Pipeline') : path === '/assets' ? (isAr?'الأصول والملفات':'Assets') : t(pageTitleKey);
  const shouldSkipRouteTransition = path === '/ai' || path === '/ai/usage';
  return <div className="app-shell" data-chat-active={path === "/ai" || path === "/ai/usage" ? "true" : "false"} data-accent={saved.accent} data-wallpaper={saved.wallpaper} data-density={saved.compact?"compact":"comfortable"} data-reduced-motion={saved.reduceMotion?"true":"false"} dir={isAr?'rtl':'ltr'}>
    <aside className="sidebar">
      <div className="sidebar-brand-area">
        <Link href={focusedHref("/","dashboard-overview")} className="brand-lockup"><img className="brand-lockup-logo" src="/brand/al-omda-lockup.svg" alt={isAr ? "العمدة AL OMDA AI" : "AL OMDA AI"}/></Link>
        <span className="sidebar-workspace-state"><i aria-hidden="true"/>{isAr?'مساحة العمل':'WORKSPACE'}</span>
      </div>
      <div className="sidebar-scroll">
        <label className="sidebar-search"><Search size={14}/><input value={sidebarSearch} onChange={(event)=>setSidebarSearch(event.target.value)} placeholder={isAr?'ابحث هنا...':'Search here...'} aria-label={isAr?'ابحث في أقسام التطبيق':'Search app sections'} data-testid="sidebar-search"/><kbd>⌘K</kbd></label>
        <section className="sidebar-nav-group" aria-label={isAr?'مساحة العمل':'Workspace'}>
          <div className="nav-caption">{isAr?'مساحة العمل':'WORKSPACE'}</div>
          <nav className="nav-stack">
            {[{path:'/',label:isAr?'لوحة التحكم':'Dashboard',icon:LayoutDashboard,target:'dashboard-overview'},{path:'/projects',label:isAr?'المشاريع':'Projects',icon:BriefcaseBusiness,target:'history-list'},{path:'/pipeline',label:isAr?'مسار العمل':'Pipeline',icon:Activity,target:'pipeline-board'},{path:'/assets',label:isAr?'الأصول والملفات':'Assets',icon:FileText,target:'assets-list'},{path:'/workbench',label:isAr?'مشروع جديد':'New Project',icon:Plus,target:'request-input'},{path:'/history',label:isAr?'سجل المهام':'Task History',icon:History,target:'history-list'}].filter(item=>!sidebarSearch.trim()||item.label.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).map(item=>{const Icon=item.icon;const active=item.path==='/'?path==='/':path===item.path;return <Link key={item.path} href={focusedHref(item.path,item.target)} className={'nav-link'+(active?' active':'')} aria-current={active?'page':undefined}><Icon size={17} strokeWidth={1.8}/><span>{item.label}</span></Link>;})}
          </nav>
        </section>
        <section className="sidebar-nav-group" aria-label={isAr?'المالية والتحليلات':'Finance and analytics'}>
          <div className="nav-caption sidebar-group-caption">{isAr?'المالية والتحليلات':'FINANCE & ANALYTICS'}</div>
          <nav className="nav-stack">
            {[
              {path:'/finance/sales-overview',label:isAr?'نظرة عامة على المبيعات':'Sales Overview',icon:TrendingUp},
              {path:'/finance/sales-distribution',label:isAr?'توزيع المبيعات':'Sales Distribution',icon:Globe},
              {path:'/finance/payment-gateways',label:isAr?'بوابات الدفع':'Payment Gateways',icon:Activity},
              {path:'/finance/active-users',label:isAr?'المستخدمون النشطون':'Active Users',icon:Users},
            ].filter(item=>!sidebarSearch.trim()||item.label.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).map(item=>{const Icon=item.icon;const active=path===item.path;return <Link key={item.path} href={item.path} className={'nav-link'+(active?' active':'')} aria-current={active?'page':undefined}><Icon size={17}/><span>{item.label}</span></Link>;})}
          </nav>
        </section>
        <section className="sidebar-nav-group" aria-label={isAr?'التعاون والتطبيقات':'Collaboration and apps'}>
          <div className="nav-caption sidebar-group-caption">{isAr?'التعاون والتطبيقات':'COLLABORATION & APPS'}</div>
          <nav className="nav-stack">
            {[
              {path:'/collaboration/contacts',label:isAr?'جهات الاتصال':'Contacts',icon:UserRound},
              {path:'/ai',label:isAr?'المحادثات':'Chats',icon:MessageSquareText},
              {path:'/collaboration/calendar',label:isAr?'التقويم':'Calendar',icon:History},
              {path:'/collaboration/email',label:isAr?'البريد الإلكتروني':'Email',icon:Send},
              {path:'/collaboration/tickets',label:isAr?'التذاكر والدعم':'Tickets',icon:FileText},
            ].filter(item=>!sidebarSearch.trim()||item.label.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).map(item=>{const Icon=item.icon;const active=item.path==='/ai'?path==='/ai':path===item.path;return <Link key={item.path} href={item.path==='/ai'?navigationHref('/ai'):item.path} className={'nav-link'+(active?' active':'')} aria-current={active?'page':undefined}><Icon size={17}/><span>{item.label}</span></Link>;})}
          </nav>
        </section>
        <section className="sidebar-nav-group" aria-label={isAr?'النظام والإعدادات':'System and settings'}>
          <div className="nav-caption sidebar-group-caption">{isAr?'النظام والإعدادات':'SYSTEM & SETTINGS'}</div>
          <nav className="nav-stack">
            {[
              {path:'/system/security',label:isAr?'الأمان والسجلات':'Security & Logs',icon:ShieldCheck},
              {path:'/profile',label:isAr?'الإعدادات':'Settings',icon:Settings2},
            ].filter(item=>!sidebarSearch.trim()||item.label.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).map(item=>{const Icon=item.icon;const active=path===item.path;return <Link key={item.path} href={item.path==='/profile'?focusedHref('/profile','profile-account-card'):item.path} className={'nav-link'+(active?' active':'')} aria-current={active?'page':undefined}><Icon size={17}/><span>{item.label}</span></Link>;})}
          </nav>
        </section>
        <section className="sidebar-nav-group" aria-label={isAr?'الأنظمة والأدوات':'Specialists and tools'}>
          <div className="nav-caption sidebar-group-caption">{isAr?'الوكلاء والأدوات':'AGENTS & TOOLS'}</div>
          <nav className="nav-stack">
            {[{path:'/agents',label:isAr?'شبكة الوكلاء':'Agent Network',icon:Compass},{path:'/tools/seo',label:isAr?'فحص SEO':'SEO Audit',icon:Search}].filter(item=>!sidebarSearch.trim()||item.label.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).map(item=>{const Icon=item.icon;const active=path===item.path;return <Link key={item.path} href={item.path} className={'nav-link'+(active?' active':'')} aria-current={active?'page':undefined}><Icon size={17}/><span>{item.label}</span></Link>;})}
          </nav>
        </section>
        <section className="sidebar-nav-group sidebar-recent-group" aria-label={isAr?'المهام الأخيرة':'Recent tasks'}>
          <div className="nav-caption sidebar-group-caption">{isAr?'المهام الأخيرة':'RECENT ACTIVITY'}</div>
          <nav className="nav-stack sidebar-recents">{tasks.filter(task=>!sidebarSearch.trim()||task.title.toLocaleLowerCase().includes(sidebarSearch.trim().toLocaleLowerCase())).slice(0,6).map(task=><Link key={task.id} href={focusedHref('/history/'+task.id,"task-plan")} className="nav-link recent-nav-link" aria-label={task.title}><FileText size={15}/><span>{task.title}</span></Link>)}</nav>
        </section>
      </div>
      <div className="sidebar-bottom">
        <div className="control-note"><ShieldCheck size={17} color="#d0ae70"/><strong>{t('control')}</strong><p>{t('controlText')}</p></div>
        <div className="sidebar-account-card">
          <span className="avatar">{name.charAt(0)||'ع'}</span>
          <span className="sidebar-account-copy"><strong>{name}</strong><small>{authUser?.email||org}</small></span>
          <span className={'sidebar-account-status '+(authUser?'connected':'local')} title={authUser?(isAr?'الحساب متصل':'Account connected'):(isAr?'حساب محلي':'Local account')} aria-label={authUser?(isAr?'الحساب متصل':'Account connected'):(isAr?'حساب محلي':'Local account')}/>
        </div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button type="button" className="curtain-trigger icon-button" onClick={()=>setCurtainOpen(true)} aria-label={isAr?'فتح القائمة':'Open menu'} aria-expanded={curtainOpen}><Menu size={18}/></button><div className="crumb">{pageTitle}</div>
        {showWorkspaceHeader && <div className="topbar-workspace-metrics" role="status" aria-live="polite" aria-label={isAr?'مؤشرات مساحة العمل':'Workspace metrics'} title={workspaceLoadError ? (isAr?'تعذر تحميل بيانات مساحة العمل':'Workspace data could not be loaded') : undefined}>
          <span className="topbar-metric"><strong>{workspaceLoadError || !workspaceLoaded ? '—' : workspaceMetrics.total}</strong><small>{isAr?'المهام':'Tasks'}</small></span>
          <span className="topbar-metric"><strong>{workspaceLoadError || !workspaceLoaded ? '—' : workspaceMetrics.needsReview}</strong><small>{isAr?'تحتاج متابعة':'Needs review'}</small></span>
          <span className="topbar-metric"><strong>{workspaceLoadError || !workspaceLoaded ? '—' : workspaceMetrics.approved}</strong><small>{isAr?'معتمدة':'Approved'}</small></span>
          <span className={`topbar-runtime-state ${localAgentStatus}`} title={isAr?'حالة اتصال الوكيل المحلي':'Local runtime connection state'}>
            <i aria-hidden="true"/>{runtimeStatusLabel}
          </span>
        </div>}
        <div className="top-actions">
          {showWorkspaceHeader && <button type="button" className="icon-button" onClick={()=>{setCommandQuery('');setCommandPaletteOpen(true);}} aria-label={isAr?'بحث شامل':'Open global search'} title={isAr?'بحث شامل':'Global search'} data-testid="button-command-palette"><Search size={16}/></button>}
          <button type="button" className="icon-button" onClick={()=>setPageHelpOpen(value=>!value)} aria-label={isAr?"مساعدة الصفحة":"Page help"} title={isAr?"مساعدة الصفحة":"Page help"} aria-expanded={pageHelpOpen} data-testid="button-page-help"><CircleHelp size={16}/></button>
          {showWorkspaceHeader && <div className="topbar-quick-actions">
            <Link href={navigationHref("/ai")} className="button button-quiet topbar-quick-link" aria-label={t('aiChat')}><Bot size={14}/><span>{t('aiChat')}</span></Link>
            <Link href={focusedHref("/workbench","request-input")} className="button button-primary topbar-quick-link" aria-label={t('newRequest')}><Plus size={14}/><span>{t('newRequest')}</span></Link>
          </div>}
          <button type="button" className="lang-button" onClick={toggleLanguage} data-testid="button-language" aria-label={isAr?'تغيير لغة الواجهة إلى الإنجليزية':'Switch interface language to Arabic'}><Languages size={15} strokeWidth={1.8}/><span>{t('languageSwitch')}</span></button>
          <Link href={focusedHref("/profile","profile-account-card")} className="icon-button" aria-label={t('profile')} data-testid="link-profile"><UserRound size={16}/></Link>
        </div></header>
      {pageHelpOpen && <section className="panel panel-pad" role="region" aria-label={isAr?"مساعدة الصفحة الحالية":"Current page help"} style={{margin:"12px 20px 0",display:"grid",gap:8}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><strong>{isAr?"كيف تستخدم هذه الصفحة؟":"How to use this page"}</strong><button type="button" className="icon-button" onClick={()=>setPageHelpOpen(false)} aria-label={isAr?"إغلاق المساعدة":"Close help"}><X size={15}/></button></div><p style={{margin:0,lineHeight:1.8,color:"var(--text-secondary)"}}>{getPageGuidance(path,isAr)}</p></section>}
      <div className="content-wrap">{shouldSkipRouteTransition ? page : <div key={path} className="route-page-transition">{page}</div>}</div>
    </main>
    {commandPaletteOpen&&<div role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCommandPaletteOpen(false);}} style={{position:'fixed',inset:0,zIndex:100,display:'grid',placeItems:'start center',padding:'min(12vh,90px) 16px 24px',background:'rgba(0,0,0,.68)',backdropFilter:'blur(5px)'}}>
      <section role="dialog" aria-modal="true" aria-label={isAr?'البحث الشامل':'Global search'} className="panel" style={{width:'min(680px,100%)',maxHeight:'min(72vh,680px)',overflow:'auto',padding:16,boxShadow:'0 24px 80px rgba(0,0,0,.45)'}} onMouseDown={(event)=>event.stopPropagation()}>
        <div className="history-search-control" style={{marginBottom:12}}><Search size={17}/><input autoFocus className="field" value={commandQuery} onChange={(event)=>setCommandQuery(event.target.value)} placeholder={isAr?'ابحث في الأقسام والمشاريع والملفات والمخرجات...':'Search sections, projects, files, and outputs...'} aria-label={isAr?'ابحث في كل شيء':'Search all available workspace data'} data-testid="input-command-palette"/></div>
        <div className="section-meta" style={{padding:'5px 3px 10px'}}>{isAr?'نتائج من البيانات المتاحة حاليًا':'Results from currently available workspace data'}</div>
        <div style={{display:'grid',gap:6}}>
          {commandNavigationMatches.map(item=><Link key={item.path} href={item.path==='/workbench'?focusedHref(item.path,'request-input'):item.path==='/projects'?focusedHref(item.path,'history-list'):item.path==='/pipeline'?focusedHref(item.path,'pipeline-board'):item.path==='/assets'?focusedHref(item.path,'assets-list'):item.path==='/history'?focusedHref(item.path,'history-list'):item.path==='/profile'?focusedHref(item.path,'profile-account-card'):item.path} onClick={()=>setCommandPaletteOpen(false)} className="nav-link" style={{minHeight:44,border:'1px solid #2a3038',background:'#141820',borderRadius:9,padding:10,textDecoration:'none',color:'inherit'}}>
            <span className="task-icon"><Search size={15}/></span><span className="task-main"><strong>{isAr?item.ar:item.en}</strong><small>{isAr?'فتح القسم':'Open section'}</small></span><ArrowLeft size={14} className="muted"/>
          </Link>)}
          {commandAssetMatches.map(asset=><button key={asset.path} type="button" className="nav-link" onClick={()=>void downloadCommandAsset(asset)} style={{minHeight:48,border:'1px solid #2a3038',background:'#141820',borderRadius:9,padding:10,color:'inherit',textAlign:isAr?'right':'left',cursor:'pointer'}}>
            <span className="task-icon"><FileText size={16}/></span><span className="task-main"><strong>{asset.name}</strong><small>{isAr?'ملف محفوظ · تنزيل':'Saved file · Download'}</small></span><ArrowLeft size={14} className="muted"/>
          </button>)}
          {commandMatches.map((item,index)=><Link key={item.task.id+':'+index} href={focusedHref('/history/'+item.task.id,'task-plan')} onClick={()=>setCommandPaletteOpen(false)} className="nav-link" style={{minHeight:54,border:'1px solid #2a3038',background:'#141820',borderRadius:9,padding:10,textDecoration:'none',color:'inherit'}}>
            <span className="task-icon"><FileText size={16}/></span><span className="task-main"><strong>{item.task.title}</strong><small>{item.detail} · {label(item.task.specialty)}</small></span><ArrowLeft size={14} className="muted"/>
          </Link>)}
          {commandMatches.length===0&&commandNavigationMatches.length===0&&commandAssetMatches.length===0&&<div className="plan-empty" style={{padding:24,textAlign:'center'}}><h3>{isAr?'لا توجد نتائج':'No results found'}</h3><p>{isAr?'جرّب كلمة أخرى من اسم المشروع أو تفاصيل مخرجاته.':'Try another project name or a phrase from its saved outputs.'}</p></div>}
        </div>
        <div className="section-meta" style={{marginTop:12}}>{isAr?'اضغط Esc للإغلاق':'Press Esc to close'} · ⌘K</div>
      </section>
    </div>}
    {curtainOpen&&<div className="curtain-backdrop" role="presentation" onClick={()=>setCurtainOpen(false)}>
      <aside className="app-curtain" role="dialog" aria-modal="true" aria-label={isAr?'قائمة العمدة':'AL OMDA menu'} onClick={event=>event.stopPropagation()}>
        <div className="curtain-head"><Link href={focusedHref("/","dashboard-overview")} className="brand-lockup" onClick={()=>setCurtainOpen(false)}><img className="brand-lockup-logo" src="/brand/al-omda-lockup.svg" alt={isAr ? "العمدة AL OMDA AI" : "AL OMDA AI"}/></Link><button type="button" className="icon-button" onClick={()=>setCurtainOpen(false)} aria-label={isAr?'إغلاق':'Close'}><X size={17}/></button></div>
        <div className="curtain-user"><span className="avatar">{name.charAt(0)||'ع'}</span><span><strong>{name}</strong><small>{authUser?.email||org}</small></span></div>
        <div className="curtain-launcher-groups">
          {appLauncherGroups.map(group=><section key={group.id} className="curtain-launcher-group">
            <div className="curtain-caption">{isAr?group.titleAr:group.titleEn}</div>
            <nav className="curtain-launcher-grid" aria-label={isAr?group.titleAr:group.titleEn}>
              {group.items.map((item,index)=>{const Icon=item.icon;return <Link key={group.id+':'+index} href={navigationHref(item.path)} onClick={()=>{if(item.path==='/workbench'){setSelectedTaskId(null);setRequest('');}setCurtainOpen(false);}} aria-current={path===item.path?'page':undefined} className={'curtain-launcher-item '+(path===item.path?'active':'')}><span className="curtain-launcher-icon"><Icon size={19}/></span><strong>{isAr?item.ar:item.en}</strong></Link>})}
            </nav>
          </section>)}
        </div>
      </aside>
    </div>}
    {path !== '/ai' && path !== '/ai/usage' && <Link href={navigationHref("/ai")} className="mobile-chat-launcher" aria-label={t('aiChat')} data-testid="link-mobile-chat"><Bot size={22} strokeWidth={1.9}/><span>{t('aiChat')}</span></Link>}
    <nav className="mobile-nav" aria-label={t('menu')}>{mobileNavItems.map((item)=>navLink(item,true))}</nav>
  </div>;
}

export default App;
