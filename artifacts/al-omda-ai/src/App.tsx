import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import AIChatPage from './AIChat';
import { readAgentEventStream } from './lib/agent-stream';
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
  Activity, ArrowLeft, ArrowRight, ArrowUpLeft, BadgeCheck, Globe, Monitor, RefreshCw,
  Bot, BriefcaseBusiness, Check, CheckCheck, ChevronDown,
  Code2, Compass, Edit3, FileText, FlaskConical, History, LayoutDashboard,
  LockKeyhole, MessageSquareText, Pause, Play, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, StopCircle, UserRound, WandSparkles,
  X, Menu, Palette, Megaphone, UserRoundCog, Trash2, TrendingUp, TrendingDown, Minus, type LucideIcon,
} from 'lucide-react';

type Language = 'ar' | 'en';
type StepState = 'pending' | 'approved' | 'rejected';
type TaskStatus = 'review' | 'paused' | 'approved' | 'stopped';
type Specialty = 'business' | 'development' | 'design' | 'marketing' | 'research' | 'assistant';
type PlanStep = { id: string; text: string; state: StepState; output?: string; complete?: string; result?: string; executedAt?: string; executionStatus?: "succeeded" | "failed"; executionError?: string };
type Task = { id: string; title: string; request: string; specialty: Specialty; steps: PlanStep[]; status: TaskStatus; createdAt: string; demo?: boolean };

type TaskSpreadsheet = { title: string; columns: string[]; rows: string[][] };
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
async function downloadTaskExcel(data: TaskSpreadsheet): Promise<void> {
  const primary = "https://esm.sh/xlsx@0.18.5";
  const fallback = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
  let module: any;
  try { module = await import(/* @vite-ignore */ primary); }
  catch {
    try { module = await import(/* @vite-ignore */ fallback); }
    catch {
      const escapeCsv = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
      const csv = "\ufeff" + [data.columns, ...data.rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = safeArtifactName(data.title, "AL-OMDA-workbook") + ".csv";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
  }
  const XLSX = module.default ?? module;
  const sheet = XLSX.utils.aoa_to_sheet([data.columns, ...data.rows]);
  sheet["!cols"] = data.columns.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Products");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const safeName = (data.title || "AL-OMDA-workbook").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-workbook";
  const link = document.createElement("a");
  link.href = url; link.download = safeName + ".xlsx"; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
function getTaskHtmlApp(result?: string): string | null {
  return result?.startsWith("ALOMDA_HTML_APP:") ? result.slice("ALOMDA_HTML_APP:".length) : null;
}
function safeArtifactName(value: string, fallback: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || fallback;
}
function downloadTaskHtml(data: { title: string; html: string }): void {
  const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = safeArtifactName(data.title, "AL-OMDA-app") + ".html";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadTaskWord(data: TaskWordDocument): Promise<void> {
  const primary = "https://esm.sh/docx@9.5.1";
  const fallback = "https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm";
  let lib: any;
  try { lib = await import(/* @vite-ignore */ primary); }
  catch {
    try { lib = await import(/* @vite-ignore */ fallback); }
    catch {
      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
      const rtl = /[\u0590-\u08ff]/.test([data.title, ...data.paragraphs].join(" "));
      const paragraphs = data.paragraphs.map((item) => "<p>" + escapeHtml(item).replace(/\n/g, "<br>") + "</p>").join("");
      const table = data.columns.length ? "<table><thead><tr>" + data.columns.map((item) => "<th>" + escapeHtml(item) + "</th>").join("") + "</tr></thead><tbody>" + data.rows.map((row) => "<tr>" + data.columns.map((_, index) => "<td>" + escapeHtml(String(row[index] ?? "")) + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : "";
      const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:Arial,sans-serif;direction:" + (rtl ? "rtl" : "ltr") + ";line-height:1.8}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{border:1px solid #888;padding:7px;text-align:start}th{background:#e8edf5}</style></head><body><h1>" + escapeHtml(data.title) + "</h1>" + paragraphs + table + "</body></html>";
      const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = safeArtifactName(data.title, "AL-OMDA-document") + ".doc";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
  }
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = lib;
  const border = { style: "single", size: 1, color: "B8C2D2" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const para = (value: string, bold = false) => new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text: value, bold, font: "Arial", size: 20 })], spacing: { after: 120 } });
  const children: any[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, children: [new TextRun({ text: data.title, bold: true, size: 32, font: "Arial" })], spacing: { after: 260 } }),
    ...data.paragraphs.map((p) => para(p)),
  ];
  if (data.columns.length > 0) {
    const rows = [
      new TableRow({ tableHeader: true, children: data.columns.map((column) => new TableCell({ shading: { fill: "E8EDF5" }, children: [para(column, true)] })) }),
      ...data.rows.map((row) => new TableRow({ children: data.columns.map((_, index) => new TableCell({ children: [para(String(row[index] ?? ""))] })) })),
    ];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: data.columns.map(() => Math.floor(9000 / data.columns.length)), borders, rows }));
  }
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 800, bottom: 900, left: 800 } } }, children }] }));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = safeArtifactName(data.title, "AL-OMDA-document") + ".docx";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const translations = {
  ar: {
    overview:'الرئيسية', aiChat:'الشات الذكي', usage:'الاستخدام والذاكرة', agents:'سوق الوكلاء', workbench:'مساحة العمل', history:'سجل المهام', profile:'الملف الشخصي',
    workspace:'مساحة العمل', account:'الحساب', control:'أنت صاحب القرار', controlText:'كل خطوة تحتاج موافقتك. لا ينفّذ هذا العرض أي إجراء خارجي.',
    developerTitle:'وحدة المطور', developerSub:'نظرة تقنية على مساحة العمل', dashboard:'لوحة التحكم', welcome:'مساحة عملك، بوضوح كامل.', hello:'مرحباً بك،', hero:'فوّض المهام بثقة. واحتفظ بزمام كل خطوة.', heroText:'اختر اختصاصاً، راجع الخطة المقترحة، ثم قرر بنفسك ما الذي يتقدم.', newRequest:'طلب جديد', activeTasks:'مهام قيد المراجعة', approvedPlans:'خطط معتمدة', specialists:'اختصاصات متاحة', totalTasks:'إجمالي المهام', preview:'عرض تجريبي محلي', recent:'أحدث المهام', seeHistory:'عرض السجل', specialties:'اختصاصات الوكلاء', allSix:'كل الاختصاصات الستة', demoNotice:'هذه بيانات عرض تجريبية. الخطط محاكاة محلية محددة مسبقاً وليست ناتجة عن ذكاء اصطناعي أو تنفيذ حقيقي.',
    marketplace:'سوق الوكلاء', marketplaceSub:'مساعدون متخصصون، تحت إشرافك الكامل.', all:'الكل', available:'متاح الآن', useAgent:'ابدأ بطلب', request:'اطلب مساعدة', workbenchSub:'اكتب ما تحتاجه، ثم راجع الخطة قبل الموافقة.', requestLabel:'ما المهمة التي تريد تفويضها؟', requestPlaceholder:'مثال: أريد خطة إطلاق لخدمة اشتراك موجهة للشركات الصغيرة في السعودية...', chooseSpecialty:'اختر الاختصاص', generatePlan:'اعرض الخطة المقترحة', yourPlan:'الخطة المقترحة', planEmptyTitle:'خطتك تبدأ من هنا', planEmptyText:'اكتب طلبك واختر اختصاصاً. سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لتراجعها قبل التنفيذ.', planDisclaimer:'سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لمراجعتها قبل بدء التنفيذ.', edit:'تعديل', save:'حفظ التعديل', stepDetails:'تفاصيل الخطوة', expectedOutput:'النتيجة المطلوبة', completionCheck:'معيار الاكتمال', approve:'موافقة وتنفيذ', reject:'رفض الخطوة', approvedStep:'تمت الموافقة', rejectedStep:'مرفوضة — عدّلها أو وافق عليها للمتابعة', pendingStep:'بانتظار موافقتك', step:'الخطوة', pause:'إيقاف مؤقت', resume:'استئناف المراجعة', stop:'إيقاف المهمة', paused:'متوقفة مؤقتاً', stopped:'متوقفة', completed:'الخطة معتمدة', reviewStatus:'بانتظار المراجعة', progress:'تقدم الخطة', allApproved:'تمت الموافقة على كل خطوات الخطة.', noExecution:'بعد موافقتك على كل خطوة، ينفّذها العمدة تلقائياً ويحفظ مخرجها هنا.',
    historySub:'كل طلباتك وخططك في مكان واحد.', searchTasks:'ابحث في المهام...', detail:'تفاصيل المهمة', backHistory:'العودة إلى السجل', taskRequest:'الطلب الأصلي', planProgress:'حالة الخطة', created:'تاريخ الإنشاء', demoTask:'مهمة عرض', userTask:'طلبك', noTasks:'لا توجد مهام تطابق بحثك.', profileSub:'تحكم في تفضيلاتك وطريقة عرض مساحة العمل.', discoverFeatures:'اكتشف إمكانيات العمدة', discoverFeaturesText:'افتح أي ميزة للانتقال مباشرة إلى مكان استخدامها.', featureChat:'الشات الذكي', featureChatText:'تحدث مع العمدة واطلب المساعدة.', featureAgents:'سوق الوكلاء', featureAgentsText:'استعرض الاختصاصات وابدأ طلبًا.', featureWorkbench:'مساحة العمل', featureWorkbenchText:'أنشئ طلبًا وراجع خطواته.', featureHistory:'سجل المهام', featureHistoryText:'تابع طلباتك ونتائجها.', featureUsage:'الاستخدام والذاكرة', featureUsageText:'راجع استهلاكك وإعدادات الذاكرة.', accountDetails:'بيانات الحساب', displayName:'الاسم المعروض', organization:'الجهة أو النشاط', language:'لغة الواجهة', languageDesc:'يتم حفظ اختيارك على هذا الجهاز.', notifications:'التنبيهات', notificationDesc:'تنبيهات محلية داخل مساحة العمل.', safeguards:'ضوابط التفويض', safeguard1:'لا شيء يتحرك دون موافقتك.', safeguard2:'كل خطوة مستقلة وتحتاج قراراً واضحاً.', safeguard3:'لا توجد تكاملات أو إجراءات خارجية.', saveProfile:'حفظ الملف', saved:'تم الحفظ', interface:'تفضيلات الواجهة', userName:'مستخدم العمْدة', orgName:'مشروعك', taskCount:'طلب', tasksCount:'طلبات', menu:'القائمة', languageSwitch:'EN', search:'بحث', newTask:'إنشاء طلب جديد', taskPlan:'خطة المهمة', planIsDemo:'عرض محلي', chooseAgent:'اختر وكيلاً متخصصاً', workbenchTag:'مساحة عمل خاضعة لإشرافك', requestCreated:'تم إنشاء خطة المعاينة', emptyHistory:'ابدأ بطلبك الأول', emptyHistoryText:'ستجد خططك هنا مع سجل واضح لكل قرار وموافقة.', toWorkbench:'إنشاء طلب', updateName:'أدخل اسمك', updateOrg:'اسم النشاط أو الفريق', approvedCount:'خطوات معتمدة', pendingCount:'خطوات متبقية', noExternal:'بدون إجراءات خارجية',
    cat_business:'الأعمال', cat_development:'التطوير', cat_design:'التصميم', cat_marketing:'التسويق', cat_research:'البحث', cat_assistant:'المساعد الشخصي',
    desc_business:'خطط واضحة للنمو والعمليات وقرارات العمل.', desc_development:'تفكيك المتطلبات إلى خطوات تقنية قابلة للمراجعة.', desc_design:'تحويل الأفكار إلى موجزات وتجارب مرئية.', desc_marketing:'رسائل وحملات وخطط محتوى عملية.', desc_research:'أسئلة منظمة ومحاور بحث قابلة للتحقق.', desc_assistant:'تنظيم الأولويات والمهام اليومية باهتمام.',
    label_business:'استراتيجية وتشغيل', label_development:'هندسة ومنتج', label_design:'تجربة وهوية', label_marketing:'نمو ومحتوى', label_research:'تحليل واكتشاف', label_assistant:'تنظيم يومي',
    plan1:'تحديد النتيجة المطلوبة ونطاق المهمة', plan2:'تقسيم العمل إلى مخرجات قابلة للمراجعة', plan3:'تجهيز ملخص وتسليم للمراجعة النهائية', plan4:'مراجعة المخاطر والافتراضات معك',
    authAccount:'حساب Supabase', authUnavailable:'إعدادات Supabase غير متاحة حالياً. سيبقى هذا العرض محلياً على هذا الجهاز.', authConfigured:'تسجيل الدخول يحفظ مهامك وملفك في مساحة خاصة بحسابك.', authChecking:'جارٍ التحقق من إعدادات الحساب...', email:'البريد الإلكتروني', password:'كلمة المرور', signIn:'تسجيل الدخول', signUp:'إنشاء حساب', switchToSignUp:'ليس لديك حساب؟ أنشئ حساباً', switchToSignIn:'لديك حساب بالفعل؟ سجّل الدخول', signOut:'تسجيل الخروج', emailConfirmation:'تحقق من بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول.', signedInAs:'تم تسجيل الدخول باسم', avatar:'الصورة الشخصية', uploadAvatar:'رفع صورة', avatarHint:'PNG أو JPEG أو WebP، بحد أقصى 5 ميجابايت. الصورة خاصة بحسابك.', authWorking:'جارٍ حفظ التغييرات...', localOnly:'معاينة محلية فقط', apiUnavailable:'تعذر الاتصال بخادم الحسابات. ما زالت المعاينة المحلية متاحة.', saveTaskFailed:'تعذر حفظ المهمة في Supabase.', profileSaved:'تم حفظ الملف في حسابك.',
    confirmStop:'هل تريد إيقاف هذه المهمة؟', active:'نشط', availableFor:'اختصاص متاح', privacy:'خصوصية وتحكم', assistantLabel:'موجّه AL OMDA', noMore:'هذا العرض لا يتصل بأي خدمة خارجية.', chatWelcome:'أهلاً بك. صف المهمة التي تريد تفويضها، وسأعرض لك تصوراً محلياً لتراجعه.', localResponse:'هذا تصور توضيحي مبني على قالب محلي. لا يتصل بذكاء اصطناعي ولا ينفّذ أي خطوة.',
  },
  en: {
    overview:'Overview', aiChat:'AI Chat', usage:'Usage & memory', agents:'Agent marketplace', workbench:'Workbench', history:'Task history', profile:'Profile',
    workspace:'WORKSPACE', account:'ACCOUNT', control:'You stay in control', controlText:'Every step needs your approval. This preview takes no external action.',
    developerTitle:'Developer console', developerSub:'A technical view of your workspace', dashboard:'Dashboard', welcome:'Your workspace, in full view.', hello:'Welcome back,', hero:'Delegate with confidence. Keep every decision yours.', heroText:'Choose a specialty, review the proposed plan, then decide what moves forward.', newRequest:'New request', activeTasks:'Awaiting review', approvedPlans:'Plans approved', specialists:'Specialties available', totalTasks:'Total tasks', preview:'LOCAL PREVIEW', recent:'Recent tasks', seeHistory:'View history', specialties:'Agent specialties', allSix:'All six specialties', demoNotice:'Seeded demo data. Plans are deterministic local previews—not AI output and not real execution.',
    marketplace:'Agent marketplace', marketplaceSub:'Specialists for focused work, always under your oversight.', all:'All', available:'Available now', useAgent:'Start a request', request:'Request help', workbenchSub:'Describe what you need, then review every proposed step.', requestLabel:'What would you like to delegate?', requestPlaceholder:'Example: Outline a launch plan for a subscription service for small businesses in Riyadh...', chooseSpecialty:'Choose a specialty', generatePlan:'Propose a plan', yourPlan:'Proposed plan', planEmptyTitle:'Your plan starts here', planEmptyText:'Describe your request and choose a specialty. AL OMDA will create a tailored AI plan for your review before execution.', planDisclaimer:'AL OMDA will create a tailored AI plan for your review before execution begins.', edit:'Edit', save:'Save changes', stepDetails:'Step details', expectedOutput:'Expected output', completionCheck:'Completion check', approve:'Approve & run', reject:'Reject step', approvedStep:'Approved', rejectedStep:'Rejected — edit or approve to continue', pendingStep:'Awaiting your approval', step:'Step', pause:'Pause task', resume:'Resume review', stop:'Stop task', paused:'Paused', stopped:'Stopped', completed:'Plan approved', reviewStatus:'Awaiting review', progress:'Plan progress', allApproved:'All proposed steps have been approved.', noExecution:'Once you approve a step, AL OMDA executes it automatically and saves the deliverable here.',
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
  { path:'/', key:'overview', icon:LayoutDashboard }, { path:'/ai', key:'aiChat', icon:Bot }, { path:'/agents', key:'agents', icon:Compass },
  { path:'/workbench', key:'workbench', icon:BriefcaseBusiness }, { path:'/history', key:'history', icon:History },
];
const STORE_KEY = 'al-omda-demo-v1';
const starterTasks: Task[] = [
  { id:'demo-brief', title:'خطة إطلاق خدمة استشارية', request:'إعداد تصور أولي لإطلاق خدمة استشارية رقمية تستهدف الشركات الصغيرة.', specialty:'business', status:'approved', createdAt:'2025-02-20T10:30:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الشريحة المستهدفة والقيمة المقترحة',state:'approved'},{id:'s2',text:'تقسيم الإطلاق إلى مراحل ومخرجات',state:'approved'},{id:'s3',text:'اقتراح مؤشرات متابعة للمراجعة',state:'approved'}] },
  { id:'demo-content', title:'أفكار محتوى للربع القادم', request:'اقتراح محاور محتوى تعرّف الجمهور بخدماتنا دون مبالغة في الوعود.', specialty:'marketing', status:'review', createdAt:'2025-02-19T08:10:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الجمهور ونبرة التواصل المناسبة',state:'approved'},{id:'s2',text:'اقتراح محاور محتوى قابلة للمراجعة',state:'pending'},{id:'s3',text:'ترتيب المحاور في جدول نشر أولي',state:'pending'}] },
  { id:'demo-research', title:'مراجعة تجربة صفحة التسجيل', request:'مراجعة تجربة التسجيل الحالية وتحديد أسئلة البحث التي تساعد على تحسينها.', specialty:'research', status:'paused', createdAt:'2025-02-17T14:05:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الأسئلة والافتراضات التي تحتاج تحققاً',state:'approved'},{id:'s2',text:'اقتراح محاور مراجعة تجربة المستخدم',state:'pending'},{id:'s3',text:'تلخيص النتائج المتوقعة للمراجعة',state:'pending'}] },
];

function readInitial(): { language:Language; tasks:Task[]; name:string; org:string; notices:boolean; accent:string; compact:boolean; wallpaper:string } {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) return { ...{ language:'ar' as Language, tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', notices:true, accent:'blue', compact:false, wallpaper:'midnight' }, ...JSON.parse(stored) };
  } catch { /* use seeded local preview */ }
  return { language:'ar', tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', notices:true, accent:'blue', compact:false, wallpaper:'midnight' };
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

function App() {
  const [location, setLocation] = useLocation();
  const [saved, setSaved] = useState(readInitial);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const { language, tasks, name, org, notices } = saved;
  const t = (key:TranslationKey) => translations[language][key];
  const isAr = language === 'ar';
  const [request, setRequest] = useState('');
  const [planGenerating, setPlanGenerating] = useState(false);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty>('business');
  const [filter, setFilter] = useState<Specialty | 'all'>('all');
  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editComplete, setEditComplete] = useState('');
  const [profileName, setProfileName] = useState(name);
  const [profileOrg, setProfileOrg] = useState(org);
  const [savedToast, setSavedToast] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking'|'unconfigured'|'configured'|'offline'>('checking');
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<ApiAuthUser | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login'|'signup'>('login');
  const [authWorking, setAuthWorking] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarWorking, setAvatarWorking] = useState(false);
  const [localAgentUrl, setLocalAgentUrl] = useState("http://127.0.0.1:4318");
  const [localAgentToken, setLocalAgentToken] = useState("");
  const [localAgentGoal, setLocalAgentGoal] = useState("");
  const [localAgentStatus, setLocalAgentStatus] = useState<"idle" | "checking" | "ready" | "running" | "approval" | "error">("idle");
  const [localAgentMessage, setLocalAgentMessage] = useState("");
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

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.classList.add('dark');
  }, [language]);
  useEffect(() => {
    if (authLoading) return;
    const localSnapshot = authUser
      ? { ...saved, tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك' }
      : saved;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(localSnapshot)); } catch { /* local preview remains usable without storage */ }
  }, [saved, authLoading, authUser]);
  const applyWorkspace = (workspace:ApiWorkspace, email:string) => {
    const remoteName = workspace.profile.displayName.trim() || email;
    const remoteOrg = workspace.profile.organization.trim() || (language === 'ar' ? 'مساحة العمل' : 'Workspace');
    const remoteTasks = workspace.tasks as Task[];
    // Workspace polling runs in the background. Do not replace React state with
    // freshly parsed but identical API data, which needlessly re-renders the whole app.
    setSaved((prev) => {
      const sameTasks = JSON.stringify(prev.tasks) === JSON.stringify(remoteTasks);
      if (prev.name === remoteName && prev.org === remoteOrg && sameTasks) return prev;
      return { ...prev, name:remoteName, org:remoteOrg, tasks:remoteTasks };
    });
    setProfileName((current) => current === remoteName ? current : remoteName);
    setProfileOrg((current) => current === remoteOrg ? current : remoteOrg);
    setAvatarPath((current) => current === workspace.profile.avatarPath ? current : workspace.profile.avatarPath);
  };
  useEffect(() => {
    let cancelled = false;
    const initializeAccount = async () => {
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
        setAuthUser(session.user);
        setSaved((prev) => ({ ...prev, tasks:[], name:session.user!.email, org:language === 'ar' ? 'مساحة العمل' : 'Workspace' }));
        setProfileName(session.user.email);
        setProfileOrg(language === 'ar' ? 'مساحة العمل' : 'Workspace');
        try {
          const workspace = await getWorkspace(apiRequestOptions);
          if (!cancelled) applyWorkspace(workspace, session.user.email);
        } catch (error) {
          if (!cancelled) setWorkspaceError(readApiError(error, t('saveTaskFailed')));
        }
      } catch (error) {
        if (!cancelled) {
          setAuthStatus('offline');
          setAuthError(readApiError(error, t('apiUnavailable')));
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
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
    if (authUser && !current.demo) saveRemoteTask(updated);
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
      setLocation('/workbench?task='+savedTask.id);
    } catch (error) { setWorkspaceError(readApiError(error, isAr ? 'تعذر إنشاء الخطة بالذكاء الاصطناعي.' : 'AI plan generation failed.')); }
    finally { setPlanGenerating(false); }
  };
    const executeStep = async (task:Task, step:PlanStep) => {
    if (executingStepId || step.state !== 'approved' || step.result || !authUser) return;
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
      setSaved(prev=>({...prev,tasks:prev.tasks.map(item=>item.id===task.id?{...item,steps:item.steps.map(current=>current.id===step.id?{...current,result:data.result,executedAt:data.executedAt,executionStatus:"succeeded",executionError:undefined}:current)}:item)}));
    } catch(error) {
      setExecutionError(error instanceof Error ? error.message : (isAr ? 'تعذر تنفيذ الخطوة.' : 'Could not execute this step.'));
      try {
        const workspace = await getWorkspace(apiRequestOptions);
        if (authUser) applyWorkspace(workspace, authUser.email);
      } catch { /* Keep the execution error visible if refresh is unavailable. */ }
    } finally { setExecutingStepId(null); }
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
      setAuthUser(result.user);
      setSaved((prev) => ({ ...prev, tasks:[], name:result.user!.email, org:isAr ? 'مساحة العمل' : 'Workspace' }));
      setProfileName(result.user.email);
      setProfileOrg(isAr ? 'مساحة العمل' : 'Workspace');
      const workspace = await getWorkspace(apiRequestOptions);
      applyWorkspace(workspace, result.user.email);
      setAuthPassword('');
    } catch (error) {
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
    const displayName = profileName.trim() || name;
    const organization = profileOrg.trim() || org;
    setWorkspaceError('');
    if (authUser) {
      try {
        const profile = await apiUpdateProfile({ displayName, organization }, apiRequestOptions);
        setProfileName(profile.displayName);
        setProfileOrg(profile.organization);
        setSaved((prev) => ({ ...prev, name:profile.displayName, org:profile.organization }));
        setAuthNotice(t('profileSaved'));
      } catch (error) {
        setWorkspaceError(readApiError(error, t('saveTaskFailed')));
        return;
      }
    } else {
      setSaved((prev) => ({ ...prev, name:displayName, org:organization }));
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
    if (stepIndex < 0 || task.status !== 'review' || executingStepId) return;
    const firstOpen = task.steps.findIndex((step) => step.state !== 'approved');
    if (stepIndex !== firstOpen) return;
    const steps = task.steps.map((step) => step.id === stepId ? { ...step, state:'approved' as StepState } : step);
    const approvedStep = steps[stepIndex];
    const updatedTask = { ...task, steps, status:steps.every((step) => step.state === 'approved') ? 'approved' as TaskStatus : 'review' as TaskStatus };
    setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? updatedTask : item) }));
    if (authUser && !task.demo) {
      try {
        await saveRemoteTask(updatedTask);
        await executeStep(updatedTask, approvedStep);
      } catch (error) {
        // Revert the optimistic approval if the server did not confirm the save.
        setSaved((prev) => ({ ...prev, tasks:prev.tasks.map((item) => item.id === task.id ? task : item) }));
        try {
          const workspace = await getWorkspace(apiRequestOptions);
          if (authUser) applyWorkspace(workspace, authUser.email);
        } catch { /* Keep the local rollback if the workspace cannot be refreshed. */ }
        setWorkspaceError(readApiError(error, t('saveTaskFailed')));
      }
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
    return <Link key={item.path} href={item.path} onClick={()=>setCurtainOpen(false)} className={`${mobile ? '' : 'nav-link'}${active ? ' active' : ''}`} data-testid={`link-${item.key}`}>
      <Icon size={17} strokeWidth={1.8}/><span>{t(item.key)}</span>
    </Link>;
  };
  const label = (id:Specialty) => t(specialtyKey(id));
  const count = (task:Task) => task.steps.filter((step) => step.state === 'approved').length;

  const pageHeading = (eyebrow:string, title:string, subtitle:string, action?:ReactNode) => <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
  const taskIcon = (id:Specialty, size=17) => {
    const Icon = specialties.find((item) => item.id === id)?.icon ?? Bot;
    return <Icon size={size} strokeWidth={1.7}/>;
  };
  const statusBadge = (status:TaskStatus) => <span className={`status-chip ${status}`}><span>{statusLabel(status)}</span></span>;

  const renderPlan = (task:Task) => {
    const activeIndex = task.steps.findIndex((step) => step.state !== 'approved');
    return <section className="panel plan-card">
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
               {getTaskHtmlApp(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{isAr?'معاينة التطبيق':'Application preview'}</strong>
                 <div style={{overflow:'hidden',border:'1px solid var(--border,#59616c)',borderRadius:10,background:'#fff'}}>
                   <iframe title={task.title} sandbox="allow-scripts" srcDoc={getTaskHtmlApp(step.result)!} style={{display:'block',width:'100%',height:430,border:0,background:'#fff'}} />
                 </div>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>downloadTaskHtml({title:task.title,html:getTaskHtmlApp(step.result)!})}><FileText size={14}/>{isAr?'تحميل التطبيق HTML':'Download app (.html)'}</button></div>
                 <small style={{color:'var(--text-secondary,#aeb4bd)'}}>{isAr?'ملف HTML مستقل يعمل في المتصفح.':'A standalone HTML file that runs in a browser.'}</small>
               </div> : getTaskSpreadsheet(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskSpreadsheet(step.result)!.title}</strong>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskExcel(getTaskSpreadsheet(step.result)!)}><FileText size={14}/>{isAr?'تحميل ملف Excel (.xlsx)':'Download Excel (.xlsx)'}</button></div>
                 <div style={{overflowX:'auto',maxWidth:'100%'}}><table dir={isAr?'rtl':'ltr'} style={{borderCollapse:'collapse',minWidth:560,width:'100%',fontSize:12}}>
                   <thead><tr>{getTaskSpreadsheet(step.result)!.columns.map((column,index)=><th key={index} style={{padding:8,border:'1px solid var(--border,#59616c)',background:'rgba(190,160,100,.13)',textAlign:'start'}}>{column}</th>)}</tr></thead>
                   <tbody>{getTaskSpreadsheet(step.result)!.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={cellIndex} style={{padding:8,border:'1px solid var(--border,#59616c)'}}>{cell}</td>)}</tr>)}</tbody>
                 </table></div>
               </div> : getTaskWordDocument(step.result) ? <div style={{display:'grid',gap:10}}>
                 <strong>{getTaskWordDocument(step.result)!.title}</strong>
                 <div><button type="button" className="button button-primary button-small" onClick={()=>void downloadTaskWord(getTaskWordDocument(step.result)!)}><FileText size={14}/>{isAr?'تحميل مستند Word (.docx)':'Download Word (.docx)'}</button></div>
                 <div style={{padding:12,border:'1px solid var(--border,#59616c)',borderRadius:9,background:'var(--surface,#10151b)'}}>
                   {getTaskWordDocument(step.result)!.paragraphs.map((p,i)=><p key={i} style={{margin:'5px 0',lineHeight:1.8}}>{p}</p>)}
                   <div style={{overflowX:'auto'}}><table dir={isAr?'rtl':'ltr'} style={{borderCollapse:'collapse',minWidth:480,width:'100%',fontSize:12}}><thead><tr>{getTaskWordDocument(step.result)!.columns.map((column,i)=><th key={i} style={{padding:8,border:'1px solid var(--border,#59616c)',background:'rgba(190,160,100,.13)',textAlign:'start'}}>{column}</th>)}</tr></thead><tbody>{getTaskWordDocument(step.result)!.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} style={{padding:8,border:'1px solid var(--border,#59616c)'}}>{cell}</td>)}</tr>)}</tbody></table></div>
                 </div>
               </div> : <pre style={{margin:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:12,lineHeight:1.8,color:'var(--text-primary,#e5e7eb)'}}>{step.result}</pre>}
             </div>}
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
      {task.status === 'approved' && <div className="notice-bar" style={{marginTop:10}}><CheckCheck size={15}/><span>{t('allApproved')} {t('noExecution')}</span></div>}
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
    const active = tasks.filter((task) => task.status === 'review' || task.status === 'paused').length;
    const approved = tasks.filter((task) => task.status === 'approved').length;
    return <div className="page-enter">
      {pageHeading(t('dashboard'),`${t('hello')} ${name}`,t('welcome'))}
      <section className="panel dashboard-hero">
        <div className="hero-copy"><div className="eyebrow">{t('preview')}</div><h2>{t('hero')}</h2><p>{t('heroText')}</p><Link href="/workbench" className="button button-primary" data-testid="button-new-request"><Plus size={15}/>{t('newRequest')}<ArrowLeft size={14}/></Link></div>
        <div className="hero-side"><WandSparkles size={29} strokeWidth={1.2}/></div>
      </section>
      <div className="stats-grid">
        {[{label:t('activeTasks'),value:active,foot:t('reviewStatus'),icon:Activity,href:'/history?status=review'},{label:t('approvedPlans'),value:approved,foot:t('noExecution'),icon:BadgeCheck,href:'/history?status=approved'},{label:t('specialists'),value:6,foot:t('allSix'),icon:Bot,href:'/agents'},{label:t('totalTasks'),value:tasks.length,foot:t('preview'),icon:FileText,href:'/history'}].map((stat,index)=><Link href={stat.href} className="panel stat-card stat-card-link" key={stat.label} data-testid={`stat-card-${index}`} aria-label={stat.label}><div className="stat-label">{stat.label}</div><div className="stat-value"><span>{stat.value}</span><stat.icon size={16} color="#c6a76c"/></div><div className="stat-foot">{stat.foot}</div></Link>)}
      </div>
      <div className="notice-bar" style={{marginBottom:16}}><ShieldCheck size={15} style={{flex:'none'}}/><span>{authUser?t('authConfigured'):t('demoNotice')}</span></div>
      <div className="dashboard-grid">
        <section className="panel panel-pad"><div className="section-head"><h2 className="section-title">{t('recent')}</h2><Link href="/history" className="section-meta">{t('seeHistory')} <ArrowLeft size={12} style={{display:'inline'}}/></Link></div>
          {tasks.slice(0,4).map((task)=><Link href={`/history/${task.id}`} className="task-row" key={task.id} data-testid={`task-row-${task.id}`}>
            <span className="task-icon">{taskIcon(task.specialty)}</span><span className="task-main"><strong>{task.title}</strong><small>{label(task.specialty)} · {dateLabel(task.createdAt,language)}{task.demo ? ` · ${t('demoTask')}` : ''}</small></span>{statusBadge(task.status)}
          </Link>)}
        </section>
        <section className="panel panel-pad"><div className="section-head"><h2 className="section-title">{t('specialties')}</h2><span className="section-meta">06</span></div><div className="specialty-list">{specialties.map(({id,icon:Icon})=><Link href="/agents" className="specialty-row" key={id}><span className="specialty-icon"><Icon size={15}/></span><strong>{label(id)}</strong><small>{t(specialtyLabel(id))}</small></Link>)}</div></section>
      </div>
      <section className="panel developer-console" aria-label={t('developerTitle')}>
        <div className="developer-console-head"><div><div className="eyebrow">{t('developerTitle')}</div><h2 className="section-title">{t('developerSub')}</h2></div><span className="console-lights" aria-hidden="true"><i/><i/><i/></span></div>
        <div className="developer-code" dir="ltr"><span className="code-muted">01</span><code><b>const</b> workspace = <em>"AL OMDA AI"</em>;</code><span className="code-muted">02</span><code><b>const</b> approvalRequired = <strong>true</strong>;</code><span className="code-muted">03</span><code><b>const</b> userInControl = <strong>true</strong>;</code></div>
        <div className="developer-console-foot"><span><i/> {isAr?'واجهة تحت إشراف المستخدم':'USER-GOVERNED WORKSPACE'}</span><span>TSX <span className="code-divider">/</span> CSS</span></div>
      </section>
    </div>;
  };

  useEffect(() => {
    try {
      if (localAgentSessionId) localStorage.setItem("al-omda-agent-session", localAgentSessionId);
      else localStorage.removeItem("al-omda-agent-session");
    } catch { /* Session ID persistence is optional when browser storage is unavailable. */ }
  }, [localAgentSessionId]);

  const callLocalAgentRuntime = async (endpoint: string, method: "GET" | "POST" | "DELETE" = "GET", body?: Record<string, unknown>) => {
    const base = new URL(localAgentUrl.trim());
    if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
      throw new Error(isAr ? "عنوان الوكيل المحلي يجب أن يكون localhost أو 127.0.0.1." : "Local runtime URL must use localhost or 127.0.0.1.");
    }
    if (!localAgentToken.trim()) throw new Error(isAr ? "أدخل مفتاح الاتصال المحلي." : "Enter the local runtime token.");
    const response = await fetch(base.origin + endpoint, {
      method,
      headers: { authorization: "Bearer " + localAgentToken.trim(), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Local agent runtime request failed.");
    return result;
  };
  const streamLocalAgent = async (
    action: "run" | "resume" | "continue" | "delegate",
    body: Record<string, unknown>,
    onEvent: (event: { type: string; text?: string; status?: string; role?: string; agentCount?: number }) => void,
  ) => {
    const base = new URL(localAgentUrl.trim());
    if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error(isAr ? "عنوان الوكيل المحلي يجب أن يكون localhost أو 127.0.0.1." : "Local runtime URL must use localhost or 127.0.0.1.");
    if (!localAgentToken.trim()) throw new Error(isAr ? "أدخل مفتاح الاتصال المحلي." : "Enter the local runtime token.");
    const response = await fetch(base.origin + "/v1/agent/stream", {
      method: "POST",
      headers: { authorization: "Bearer " + localAgentToken.trim(), "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    return await readAgentEventStream(response, onEvent);
  };
  const checkLocalAgent = async () => {
    setLocalAgentBusy(true); setLocalAgentStatus("checking"); setLocalAgentMessage("");
    try {
      const healthUrl = new URL(localAgentUrl.trim());
      if (healthUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(healthUrl.hostname)) throw new Error(isAr ? "استخدم عنوان الجهاز المحلي فقط." : "Use a localhost runtime URL only.");
      const healthResponse = await fetch(healthUrl.origin + "/health");
      if (!healthResponse.ok) throw new Error("Local runtime is not responding.");
      const health = await healthResponse.json();
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

  const loadLocalModelProviders = async () => {
    setModelProvidersError("");
    try {
      const result = await callLocalAgentRuntime("/v1/models/providers");
      const providers = Array.isArray(result.providers) ? result.providers.filter((item: any) => item && typeof item.name === "string" && typeof item.model === "string") : [];
      setLocalModelProviders(providers);
      if (!providers.length) setModelProvidersError(isAr ? "لم يتم إعداد أي مزود موديلات بعد." : "No model providers are configured yet.");
    } catch (error) {
      setModelProvidersError(error instanceof Error ? error.message : (isAr ? "تعذر تحميل مزودي الموديلات." : "Could not load model providers."));
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

  const agentsPage = () => <div className="page-enter">
    {pageHeading(t('marketplace'),t('marketplace'),t('marketplaceSub'))}
    <section className="panel panel-pad" style={{marginBottom:20}}>
      <div className="section-head">
        <div><span className="eyebrow">LOCAL EXECUTION</span><h2 className="section-title">{isAr?'الوكيل الذكي المحلي':'Local AI Agent'}</h2><p className="section-meta">{isAr?'وصّل بيئة التنفيذ على جهازك ليقرأ المشروع وينفذ المهام بموافقتك.':'Connect the runtime on your computer to inspect projects and execute approved tasks.'}</p></div>
        <span className="status-chip"><span className={localAgentStatus==='ready'?'online-dot':localAgentStatus==='error'?'offline-dot':'online-dot'}/>{localAgentStatus==='ready'?(isAr?'متصل':'Connected'):localAgentStatus==='checking'?(isAr?'جارٍ الاتصال':'Connecting'):localAgentStatus==='running'?(isAr?'يعمل':'Running'):localAgentStatus==='approval'?(isAr?'موافقة مطلوبة':'Approval required'):localAgentStatus==='error'?(isAr?'غير متصل':'Offline'):(isAr?'غير موصل':'Not connected')}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,250px),1fr))',gap:12,marginTop:14}}>
        <label className="field-group"><span className="form-label">{isAr?'عنوان التشغيل المحلي':'Local runtime URL'}</span><input className="field" type="url" value={localAgentUrl} onChange={event=>setLocalAgentUrl(event.target.value)} placeholder="http://127.0.0.1:4318"/></label>
        <label className="field-group"><span className="form-label">{isAr?'مفتاح الاتصال المحلي':'Local runtime token'}</span><input className="field" type="password" autoComplete="off" value={localAgentToken} onChange={event=>setLocalAgentToken(event.target.value)} placeholder={isAr?'أدخل المفتاح من إعدادات التشغيل':'Paste OMDA_AGENT_TOKEN'}/></label>
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
    <section className="panel panel-pad" style={{marginBottom:20}}>
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
    <section className="panel panel-pad" style={{marginBottom:20}}>
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
    <section className="panel panel-pad" style={{marginBottom:20}}>
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
    <section className="panel panel-pad" style={{marginBottom:20}}>
      <div className="section-head"><div><span className="eyebrow">MODEL ROUTER</span><h2 className="section-title">{isAr?'مزودو الموديلات':'Model providers'}</h2><p className="section-meta">{isAr?'المزود الأساسي والإضافي والاحتياطي. مفاتيح الدخول تبقى في بيئة Runtime المحلية.':'Primary, additional, and fallback providers. API keys stay in the local runtime environment.'}</p></div><button type="button" className="button button-quiet button-small" onClick={loadLocalModelProviders} disabled={!localAgentToken.trim()}>{isAr?'تحديث القائمة':'Refresh list'}</button></div>
      {modelProvidersError&&<p className="section-meta" role="status">{modelProvidersError}</p>}
      {localModelProviders.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,230px),1fr))',gap:10,marginTop:12}}>{localModelProviders.map((provider)=><div className="panel panel-pad" key={provider.name}><div className="section-head"><strong>{provider.name}</strong><span className="status-chip">{provider.kind}</span></div><p className="section-meta" style={{overflowWrap:'anywhere'}}>{provider.model}</p><small className="muted">{provider.hasApiKey?(isAr?'مفتاح متاح':'API key available'):(isAr?'بدون مفتاح':'No API key')}</small><p className="section-meta">{isAr?'الأولوية':'Priority'}: {provider.priority ?? 0} · {(provider.purposes || ['all']).join(', ')}</p></div>)}</div>}
      <p className="section-meta" style={{marginTop:10}}>{isAr?'لإضافة مزود جديد، عدّل .omda/models.json وفق المثال .omda/models.example.json ثم حدّث القائمة.':'Add providers in .omda/models.json using .omda/models.example.json, then refresh this list.'}</p>
    </section>
    <div className="notice-bar"><ShieldCheck size={15} style={{flex:'none'}}/><span>{t('controlText')}</span></div>
    <div className="filter-row"><button className={`filter-pill ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>{t('all')}</button>{specialties.map(({id})=><button key={id} className={`filter-pill ${filter===id?'active':''}`} onClick={()=>setFilter(id)}>{label(id)}</button>)}</div>
    <div className="market-grid">{specialties.filter(({id})=>filter==='all'||filter===id).map(({id,icon:Icon},index)=><article className="panel agent-card" key={id} data-testid={`agent-card-${id}`}>
      <div className="agent-top"><span className="agent-symbol"><Icon size={20}/></span><span className="section-meta">0{index+1} / 06</span></div>
      <h3>{label(id)}</h3><p>{t(specialtyDesc(id))}</p><div className="agent-footer"><span className="agent-tag">{t(specialtyLabel(id))}</span><Link href={`/workbench?specialty=${id}`} className="button button-quiet button-small" onClick={()=>setSelectedSpecialty(id)}>{t('useAgent')}<ArrowLeft size={12}/></Link></div>
    </article>)}</div>
  </div>;

  const workbenchPage = () => {
    const active = currentTask && (currentTask.status === 'review' || currentTask.status === 'paused' || currentTask.status === 'approved') ? currentTask : null;
    return <div className="page-enter">
      {pageHeading(t('workbenchTag'),t('workbench'),t('workbenchSub'),<span className="status-chip"><LockKeyhole size={12}/>{t('privacy')}</span>)}
      <div className="workbench-layout">
        <form className="panel request-card" onSubmit={createPlan}>
          <div className="section-head"><h2 className="section-title">{t('request')}</h2><span className="section-meta">{t('preview')}</span></div>
          <div className="chat-messages" aria-live="polite">
            <div className="chat-message assistant"><strong>{t('assistantLabel')} · {t('preview')}</strong><p>{t('chatWelcome')}</p></div>
            {active && <><div className="chat-message user"><strong>{t('userTask')}</strong><p>{active.request}</p></div><div className="chat-message assistant"><strong>{t('assistantLabel')} · {t('preview')}</strong><p>{t('localResponse')}</p></div></>}
          </div>
          <div className="field-group"><label className="form-label" htmlFor="request-input">{t('requestLabel')}</label><textarea id="request-input" className="field" placeholder={t('requestPlaceholder')} value={request} onChange={(event)=>setRequest(event.target.value)} data-testid="input-request"/></div>
          <div className="field-group"><div className="form-label">{t('chooseSpecialty')}</div><div className="select-grid">{specialties.map(({id,icon:Icon})=><button type="button" key={id} className={`select-specialty ${selectedSpecialty===id?'selected':''}`} onClick={()=>setSelectedSpecialty(id)} data-testid={`select-specialty-${id}`}><Icon size={14}/>{label(id)}</button>)}</div></div>
          <div className="notice-bar" style={{marginBottom:17}}><ShieldCheck size={14}/><span>{t('planDisclaimer')}</span></div>
          <button type="submit" className="button button-primary" disabled={!request.trim() || planGenerating} data-testid="button-propose-plan"><Sparkles size={15}/>{planGenerating ? (isAr ? 'جارٍ إنشاء الخطة...' : 'Generating plan...') : t('generatePlan')}<Send size={13}/></button>
          {workspaceError && <div className="notice-bar notice-error" role="alert" style={{marginTop:12}}>{workspaceError}</div>}
        </form>
        {active ? renderPlan(active) : <section className="panel plan-empty"><div><span className="empty-mark"><MessageSquareText size={22}/></span><h3>{t('planEmptyTitle')}</h3><p>{t('planEmptyText')}</p></div></section>}
      </div>
      {active && <div className="notice-bar" style={{marginTop:15}}><span>{t('taskPlan')}: <strong>{active.title}</strong> · {statusLabel(active.status)}</span><Link href={`/history/${active.id}`} className="section-meta">{t('detail')}</Link></div>}
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
      if (path===`/history/${task.id}`) setLocation('/history');
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
    URL.revokeObjectURL(url);
  };

  const historyPage = () => {
    const statusFilter = new URLSearchParams(window.location.search).get('status');
    const filtered = tasks.filter((task)=>
      (!statusFilter || (statusFilter === 'review' ? task.status === 'review' || task.status === 'paused' : task.status === statusFilter)) &&
      `${task.title} ${task.request} ${label(task.specialty)}`.toLowerCase().includes(query.toLowerCase())
    );
    return <div className="page-enter">
      {pageHeading(t('history'),t('history'),t('historySub'),<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="button button-quiet" onClick={()=>exportTasksSheet(filtered)} disabled={!filtered.length}><FileText size={14}/>{isAr?'تصدير الجدول':'Export sheet'}</button><Link href="/workbench" className="button button-primary"><Plus size={15}/>{t('newTask')}</Link></div>)}
      <div className="field-group" style={{maxWidth:460}}><div style={{position:'relative'}}><Search size={15} style={{position:'absolute',insetInlineStart:13,top:13,color:'#818891'}}/><input className="field" style={{paddingInlineStart:38}} placeholder={t('searchTasks')} value={query} onChange={(event)=>setQuery(event.target.value)} data-testid="input-search-tasks"/></div></div>
      <div className="history-layout">{filtered.map((task)=><div className="panel history-item history-item-manage" key={task.id} data-testid={`history-task-${task.id}`}>
        <Link href={`/history/${task.id}`} className="history-item-open">
          <span className="task-icon">{taskIcon(task.specialty)}</span><span className="task-main"><strong>{task.title}</strong><small>{label(task.specialty)} · {dateLabel(task.createdAt,language)} · {count(task)}/{task.steps.length} {t('approvedCount')}{task.demo?` · ${t('demoTask')}`:''}</small></span>{statusBadge(task.status)}<ArrowLeft size={15} className="muted"/>
        </Link>
        <button type="button" className="button button-danger button-small task-delete-button" onClick={()=>void handleDeleteTask(task)} disabled={deletingTaskId===task.id} aria-label={isAr?'حذف المشروع':'Delete project'} title={isAr?'حذف المشروع':'Delete project'}><Trash2 size={14}/>{deletingTaskId===task.id?(isAr?'جارٍ الحذف':'Deleting…'):(isAr?'حذف':'Delete')}</button>
      </div>)}
      {filtered.length===0 && <div className="panel plan-empty"><div><span className="empty-mark"><Search size={21}/></span><h3>{tasks.length ? t('noTasks') : t('emptyHistory')}</h3><p>{tasks.length ? t('noTasks') : t('emptyHistoryText')}</p>{!tasks.length&&<Link href="/workbench" className="button button-primary" style={{marginTop:16}}>{t('toWorkbench')}</Link>}</div></div>}</div>
    </div>;
  };

  const taskDetailPage = (task:Task) => {
    const successfulExecutions = task.steps.filter((step)=>step.executionStatus === 'succeeded' && Boolean(step.result)).length;
    const failedExecutions = task.steps.filter((step)=>step.executionStatus === 'failed').length;
    const unexecutedSteps = task.steps.filter((step)=>step.state === 'approved' && !step.result && step.executionStatus !== 'failed').length;
    const marketTrend = successfulExecutions > failedExecutions ? 'up' : failedExecutions > successfulExecutions ? 'down' : 'flat';
    const TrendIcon = marketTrend === 'up' ? TrendingUp : marketTrend === 'down' ? TrendingDown : Minus;
    const trendLabel = marketTrend === 'up' ? (isAr?'اتجاه صاعد':'Uptrend') : marketTrend === 'down' ? (isAr?'اتجاه هابط':'Downtrend') : (isAr?'اتجاه مستقر':'Stable trend');
    return <div className="page-enter">
      {pageHeading(t('detail'),task.title,`${label(task.specialty)} · ${dateLabel(task.createdAt,language)}`,<Link href="/history" className="button button-quiet"><ArrowRight size={14}/>{t('backHistory')}</Link>)}
      <div className="history-detail">
        <div>{renderPlan(task)}</div>
        <aside className="project-tracking">
          <section className="panel panel-pad">
            <div className="section-head"><h2 className="section-title">{isAr?'مؤشرات المشروع':'Project indicators'}</h2>{statusBadge(task.status)}</div>
            <div className="market-trend-board">
              <div className={`market-main-trend ${marketTrend}`}>
                <div className="market-trend-heading"><small>{isAr?'مؤشر حركة المشروع':'Project market signal'}</small><span className="market-live-dot"/></div>
                <div className="market-trend-main"><TrendIcon size={34} strokeWidth={2.6}/><strong>{trendLabel}</strong></div>
                <svg className="market-sparkline" viewBox="0 0 300 62" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient id="marketLineGlow" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="currentColor" stopOpacity=".25"/><stop offset="100%" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs>
                  <path d={marketTrend==='up'?'M2 52 L38 45 L72 48 L108 30 L145 36 L182 22 L218 27 L258 9 L298 4':marketTrend==='down'?'M2 8 L38 15 L72 12 L108 29 L145 24 L182 39 L218 34 L258 51 L298 57':'M2 31 L38 27 L72 34 L108 29 L145 33 L182 28 L218 32 L258 27 L298 30'} fill="none" stroke="url(#marketLineGlow)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
    <div className="profile-settings-layout">
      <section className="panel panel-pad profile-main-card">
        <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'البيانات الشخصية':'PERSONAL INFORMATION'}</span><h2>{isAr?'بيانات الملف الشخصي':'Profile information'}</h2><p>{isAr?'حدّث بياناتك التي تظهر داخل مساحة عمل العمدة.':'Update the details shown across your workspace.'}</p></div><UserRound size={19}/></div>
        <div className="profile-summary profile-summary-large">{authUser && avatarPath ? <img className="profile-avatar profile-avatar-image" src={'/api/storage/avatar?v='+avatarVersion} alt={t('avatar')} data-testid="img-profile-avatar"/> : <div className="profile-avatar">{profileName.trim().charAt(0)||'ع'}</div>}<div><h2>{profileName}</h2><span>{authUser?.email || (isAr?'حساب محلي على هذا الجهاز':'Local account on this device')}</span></div></div>
        <div className="profile-fields-grid">
          <div className="field-group"><label className="form-label" htmlFor="profile-name">{t('displayName')}</label><input id="profile-name" className="field" value={profileName} onChange={(event)=>setProfileName(event.target.value)} placeholder={t('updateName')} data-testid="input-profile-name"/></div>
          <div className="field-group"><label className="form-label" htmlFor="profile-org">{t('organization')}</label><input id="profile-org" className="field" value={profileOrg} onChange={(event)=>setProfileOrg(event.target.value)} placeholder={t('updateOrg')} data-testid="input-profile-org"/></div>
        </div>
        <div className="profile-actions-row"><button className="button button-primary" onClick={()=>void handleSaveProfile()} data-testid="button-save-profile"><Check size={14}/>{savedToast?t('saved'):t('saveProfile')}</button>{authUser && <label className={'button button-quiet '+(avatarWorking?'disabled':'')} htmlFor="avatar-file"><UserRound size={14}/>{avatarWorking?t('authWorking'):t('uploadAvatar')}</label>}</div>
        {authUser && <><input id="avatar-file" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} disabled={avatarWorking} data-testid="input-avatar-file"/><small className="account-hint">{t('avatarHint')}</small></>}
      </section>
      <div className="profile-settings-side">
        <section className="panel panel-pad profile-features-card">
          <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'ابدأ من هنا':'GET STARTED'}</span><h2>{t('discoverFeatures')}</h2><p>{t('discoverFeaturesText')}</p></div><Compass size={18}/></div>
          <div className="profile-feature-grid">
            <Link href="/ai" className="profile-feature-link"><Bot size={19}/><span><strong>{t('featureChat')}</strong><small>{t('featureChatText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href="/agents" className="profile-feature-link"><Compass size={19}/><span><strong>{t('featureAgents')}</strong><small>{t('featureAgentsText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href="/workbench" className="profile-feature-link"><BriefcaseBusiness size={19}/><span><strong>{t('featureWorkbench')}</strong><small>{t('featureWorkbenchText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href="/history" className="profile-feature-link"><History size={19}/><span><strong>{t('featureHistory')}</strong><small>{t('featureHistoryText')}</small></span><ArrowUpLeft size={14}/></Link>
            <Link href="/ai/usage" className="profile-feature-link"><Activity size={19}/><span><strong>{t('featureUsage')}</strong><small>{t('featureUsageText')}</small></span><ArrowUpLeft size={14}/></Link>
          </div>
        </section>

        <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'التخصيص':'PERSONALIZATION'}</span><h2>{isAr?'مظهر التطبيق':'App appearance'}</h2><p>{isAr?'اختر لون الواجهة وطريقة عرض المساحات.':'Choose your accent color and workspace density.'}</p></div><Palette size={18}/></div></summary>
          <div className="setting-row"><div><strong>{isAr?'لون الواجهة':'Accent color'}</strong><small>{isAr?'سبعة ألوان زجاجية للاختيار بينها':'Seven glass-inspired colors'}</small></div></div>
          <div className="accent-picker" role="group" aria-label={isAr?'ألوان الواجهة':'Accent colors'}>
            {accentOptions.map((option)=><button type="button" key={option.id} className={'accent-choice '+(saved.accent===option.id?'selected':'')} style={{color:option.color}} onClick={()=>setSaved((prev)=>({...prev,accent:option.id}))} aria-label={option.name} aria-pressed={saved.accent===option.id}><span/><small>{option.name}</small></button>)}
          </div>
          <div className="wallpaper-picker" role="group" aria-label={isAr?'خلفيات التطبيق':'App backgrounds'}>
            <div className="profile-section-heading"><div><h3>{isAr?'خلفية التطبيق':'App background'}</h3><p>{isAr?'اختر واحدة من سبع خلفيات داكنة.':'Choose from seven dark backgrounds.'}</p></div></div>
            <div className="wallpaper-options">{wallpaperOptions.map(option=><button type="button" key={option.id} className={'wallpaper-choice '+(saved.wallpaper===option.id?'selected':'')} style={{background:option.background}} onClick={()=>setSaved(prev=>({...prev,wallpaper:option.id}))} aria-label={option.name} aria-pressed={saved.wallpaper===option.id}><span>{option.name}</span></button>)}</div>
          </div>
          <div className="setting-row"><div><strong>{isAr?'كثافة العرض':'Display density'}</strong><small>{isAr?'تحكم في المسافات داخل البطاقات والقوائم.':'Control spacing in cards and lists.'}</small></div><button type="button" role="switch" aria-checked={saved.compact} className={'toggle '+(saved.compact?'on':'')} onClick={()=>setSaved((prev)=>({...prev,compact:!prev.compact}))} aria-label={isAr?'عرض مضغوط':'Compact layout'}/></div>
        </details>
        <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'إعدادات التطبيق':'APP SETTINGS'}</span><h2>{isAr?'تفضيلات التطبيق':'Application preferences'}</h2><p>{isAr?'إعدادات اللغة والتنبيهات الخاصة بك.':'Your language and notification preferences.'}</p></div><Settings2 size={18}/></div></summary>
          <div className="setting-row"><div><strong>{t('language')}</strong><small>{t('languageDesc')}</small></div><button className="button button-quiet button-small" onClick={toggleLanguage}>{isAr?'العربية':'English'} <ChevronDown size={12}/></button></div>
          <div className="setting-row"><div><strong>{t('notifications')}</strong><small>{t('notificationDesc')}</small></div><button role="switch" aria-checked={notices} className={'toggle '+(notices?'on':'')} onClick={()=>setSaved((prev)=>({...prev,notices:!prev.notices}))} aria-label={t('notifications')} data-testid="toggle-notifications"/></div>
        </details>
        <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'الحساب والأمان':'ACCOUNT & SECURITY'}</span><h2>{isAr?'حالة الحساب':'Account status'}</h2><p>{isAr?'إدارة جلسة الدخول والوصول إلى بياناتك.':'Manage your sign-in and account access.'}</p></div><LockKeyhole size={18}/></div></summary>
          {authLoading && <p className="account-copy" role="status">{t('authChecking')}</p>}
          {!authLoading && authStatus==='unconfigured' && <div className="notice-bar"><ShieldCheck size={15}/><span>{t('authUnavailable')}</span></div>}
          {!authLoading && authStatus==='offline' && <div className="notice-bar"><ShieldCheck size={15}/><span>{authError||t('apiUnavailable')}</span></div>}
          {!authLoading && authStatus==='configured' && !authUser && <><p className="account-copy">{t('authConfigured')}</p><form className="account-form" onSubmit={handleAuthSubmit}><div className="field-group"><label className="form-label" htmlFor="auth-email">{t('email')}</label><input id="auth-email" type="email" className="field" autoComplete="email" required maxLength={254} value={authEmail} onChange={(event)=>setAuthEmail(event.target.value)} data-testid="input-auth-email"/></div><div className="field-group"><label className="form-label" htmlFor="auth-password">{t('password')}</label><input id="auth-password" type="password" className="field" autoComplete={authMode==='login'?'current-password':'new-password'} required minLength={8} maxLength={128} value={authPassword} onChange={(event)=>setAuthPassword(event.target.value)} data-testid="input-auth-password"/></div>{authError&&<div className="notice-bar notice-error" role="alert">{authError}</div>}<button className="button button-primary" type="submit" disabled={authWorking} data-testid="button-auth-submit"><LockKeyhole size={14}/>{authWorking?t('authWorking'):authMode==='login'?t('signIn'):t('signUp')}</button></form><button type="button" className="text-button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('');setAuthNotice('');}} data-testid="button-auth-mode">{authMode==='login'?t('switchToSignUp'):t('switchToSignIn')}</button></>}
          {!authLoading && authUser && <div className="account-signed-in"><div className="account-email"><span className="online-dot"/><span>{t('signedInAs')} <strong>{authUser.email}</strong></span></div><p className="account-copy">{t('authConfigured')}</p><button type="button" className="button button-danger button-small" onClick={()=>void handleSignOut()} disabled={authWorking}>{t('signOut')}</button></div>}
          {authNotice&&<div className="notice-bar account-message" role="status">{authNotice}</div>}{workspaceError&&<div className="notice-bar notice-error account-message" role="alert">{workspaceError}</div>}
        </details>
        <details className="panel panel-pad profile-setting-card profile-accordion">
          <summary className="profile-accordion-summary"><div className="profile-section-heading"><div><span className="eyebrow">{isAr?'الخصوصية والتحكم':'PRIVACY & CONTROL'}</span><h2>{isAr?'كيف يعمل حسابك':'How your account works'}</h2><p>{isAr?'معلومات واضحة عن حفظ البيانات وصلاحيات التطبيق.':'Clear information about data storage and app permissions.'}</p></div><ShieldCheck size={18}/></div></summary>
          {[isAr?'بيانات الملف والمهام المرتبطة بحسابك تُحفظ في مساحة حسابك عند تسجيل الدخول.':'Profile details and tasks are saved to your account when signed in.',isAr?'تفضيلات المظهر واللغة والتنبيهات تُحفظ على هذا الجهاز.':'Appearance, language, and notification preferences are saved on this device.',isAr?'لا يتم تنفيذ إجراءات خارجية دون موافقتك.':'No external action is taken without your approval.'].map((item,index)=><div className="setting-row profile-trust-row" key={index}><span className="specialty-icon"><Check size={14}/></span><strong>{item}</strong></div>)}
        </details>
      </div>
    </div>
  </div>;

  let page:ReactNode;
  if (detailMatch && currentTask) page = taskDetailPage(currentTask);
  else if (path === '/ai/usage') page = <AIChatPage language={language} signedIn={Boolean(authUser)} view="usage" />;
  else if (path === '/ai') page = <AIChatPage language={language} signedIn={Boolean(authUser)} />;
  else if (path === '/agents') page = agentsPage();
  else if (path === '/workbench') page = workbenchPage();
  else if (path === '/history') page = historyPage();
  else if (path === '/profile') page = profilePage();
  else page = dashboardPage();
  const pageTitleKey = path === '/ai/usage' ? 'usage' : path === '/ai' ? 'aiChat' : path === '/agents' ? 'agents' : path === '/workbench' ? 'workbench' : path.startsWith('/history') ? 'history' : path === '/profile' ? 'profile' : 'overview';
  return <div className="app-shell" data-accent={saved.accent} data-wallpaper={saved.wallpaper} data-density={saved.compact?"compact":"comfortable"} dir={isAr?'rtl':'ltr'}>
    <aside className="sidebar">
      <Link href="/" className="brand-lockup"><span className="brand-mark">ع</span><span><span className="brand-name">AL OMDA AI</span><span className="brand-sub" style={{display:'block'}}>{isAr?'مساعدون تحت إشرافك':'SPECIALISTS, YOUR CALL'}</span></span></Link>
      <div className="nav-caption">{t('workspace')}</div><nav className="nav-stack">{navItems.map((item)=>navLink(item))}</nav>
      <div className="sidebar-bottom"><div className="control-note"><ShieldCheck size={17} color="#d0ae70"/><strong>{t('control')}</strong><p>{t('controlText')}</p></div><Link href="/profile" className="profile-mini"><span className="avatar">{name.charAt(0)||'ع'}</span><span><strong>{name}</strong><small>{org}</small></span><ArrowUpLeft size={13} style={{marginInlineStart:'auto',color:'#777e87'}}/></Link></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button type="button" className="curtain-trigger icon-button" onClick={()=>setCurtainOpen(true)} aria-label={isAr?'فتح القائمة':'Open menu'} aria-expanded={curtainOpen}><Menu size={18}/></button><div className="crumb">{t(pageTitleKey)}</div><div className="top-actions">
        <button type="button" className="status-chip status-button" onClick={()=>setLocation('/profile')} data-testid="button-auth-status"><span className={`online-dot ${authUser?'':'offline-dot'}`}/>{authUser?'Supabase':t('localOnly')}</button>
        <button className="lang-button" onClick={toggleLanguage} data-testid="button-language">{t('languageSwitch')}</button>
        <Link href="/profile" className="icon-button" aria-label={t('profile')} data-testid="link-profile"><UserRound size={16}/></Link>
      </div></header>
      <div className="content-wrap">{page}</div>
    </main>
    {curtainOpen&&<div className="curtain-backdrop" role="presentation" onClick={()=>setCurtainOpen(false)}>
      <aside className="app-curtain" role="dialog" aria-modal="true" aria-label={isAr?'قائمة العمدة':'AL OMDA menu'} onClick={event=>event.stopPropagation()}>
        <div className="curtain-head"><Link href="/" className="brand-lockup" onClick={()=>setCurtainOpen(false)}><span className="brand-mark">ع</span><span><span className="brand-name">AL OMDA AI</span><span className="brand-sub" style={{display:'block'}}>{isAr?'مساعدون تحت إشرافك':'SPECIALISTS, YOUR CALL'}</span></span></Link><button type="button" className="icon-button" onClick={()=>setCurtainOpen(false)} aria-label={isAr?'إغلاق':'Close'}><X size={17}/></button></div>
        <div className="curtain-user"><span className="avatar">{name.charAt(0)||'ع'}</span><span><strong>{name}</strong><small>{authUser?.email||org}</small></span></div>
        <div className="curtain-caption">{t('workspace')}</div><nav className="curtain-nav">{navItems.map(item=>navLink(item))}</nav>
        <button type="button" className="curtain-profile-link" onClick={()=>{setCurtainOpen(false);setLocation('/profile')}}><UserRound size={17}/>{t('profile')}<ArrowUpLeft size={15}/></button>
      </aside>
    </div>}
    <nav className="mobile-nav" aria-label={t('menu')}>{navItems.map((item)=>navLink(item,true))}{navLink({path:'/profile',key:'profile',icon:UserRound},true)}</nav>
  </div>;
}

export default App;
