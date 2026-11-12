import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import AIChatPage from './AIChat';
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
  Activity, ArrowLeft, ArrowRight, ArrowUpLeft, BadgeCheck,
  Bot, BriefcaseBusiness, Check, CheckCheck, ChevronDown,
  Code2, Compass, Edit3, FileText, FlaskConical, History, LayoutDashboard,
  LockKeyhole, MessageSquareText, Pause, Play, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, StopCircle, UserRound, WandSparkles,
  X, Palette, Megaphone, UserRoundCog, type LucideIcon,
} from 'lucide-react';

type Language = 'ar' | 'en';
type StepState = 'pending' | 'approved' | 'rejected';
type TaskStatus = 'review' | 'paused' | 'approved' | 'stopped';
type Specialty = 'business' | 'development' | 'design' | 'marketing' | 'research' | 'assistant';
type PlanStep = { id: string; text: string; state: StepState; output?: string; complete?: string };
type Task = { id: string; title: string; request: string; specialty: Specialty; steps: PlanStep[]; status: TaskStatus; createdAt: string; demo?: boolean };

const translations = {
  ar: {
    overview:'الرئيسية', aiChat:'الشات الذكي', usage:'الاستخدام والذاكرة', agents:'سوق الوكلاء', workbench:'مساحة العمل', history:'سجل المهام', profile:'الملف الشخصي',
    workspace:'مساحة العمل', account:'الحساب', control:'أنت صاحب القرار', controlText:'كل خطوة تحتاج موافقتك. لا ينفّذ هذا العرض أي إجراء خارجي.',
    developerTitle:'وحدة المطور', developerSub:'نظرة تقنية على مساحة العمل', dashboard:'لوحة التحكم', welcome:'مساحة عملك، بوضوح كامل.', hello:'مرحباً بك،', hero:'فوّض المهام بثقة. واحتفظ بزمام كل خطوة.', heroText:'اختر اختصاصاً، راجع الخطة المقترحة، ثم قرر بنفسك ما الذي يتقدم.', newRequest:'طلب جديد', activeTasks:'مهام قيد المراجعة', approvedPlans:'خطط معتمدة', specialists:'اختصاصات متاحة', totalTasks:'إجمالي المهام', preview:'عرض تجريبي محلي', recent:'أحدث المهام', seeHistory:'عرض السجل', specialties:'اختصاصات الوكلاء', allSix:'كل الاختصاصات الستة', demoNotice:'هذه بيانات عرض تجريبية. الخطط محاكاة محلية محددة مسبقاً وليست ناتجة عن ذكاء اصطناعي أو تنفيذ حقيقي.',
    marketplace:'سوق الوكلاء', marketplaceSub:'مساعدون متخصصون، تحت إشرافك الكامل.', all:'الكل', available:'متاح الآن', useAgent:'ابدأ بطلب', request:'اطلب مساعدة', workbenchSub:'اكتب ما تحتاجه، ثم راجع الخطة قبل الموافقة.', requestLabel:'ما المهمة التي تريد تفويضها؟', requestPlaceholder:'مثال: أريد خطة إطلاق لخدمة اشتراك موجهة للشركات الصغيرة في السعودية...', chooseSpecialty:'اختر الاختصاص', generatePlan:'اعرض الخطة المقترحة', yourPlan:'الخطة المقترحة', planEmptyTitle:'خطتك تبدأ من هنا', planEmptyText:'اكتب طلبك واختر اختصاصاً. سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لتراجعها قبل التنفيذ.', planDisclaimer:'سيُنشئ العمدة خطة مخصصة بالذكاء الاصطناعي لمراجعتها قبل بدء التنفيذ.', edit:'تعديل', save:'حفظ التعديل', stepDetails:'تفاصيل الخطوة', expectedOutput:'النتيجة المطلوبة', completionCheck:'معيار الاكتمال', approve:'موافقة على الخطوة', reject:'رفض الخطوة', approvedStep:'تمت الموافقة', rejectedStep:'مرفوضة — عدّلها أو وافق عليها للمتابعة', pendingStep:'بانتظار موافقتك', step:'الخطوة', pause:'إيقاف مؤقت', resume:'استئناف المراجعة', stop:'إيقاف المهمة', paused:'متوقفة مؤقتاً', stopped:'متوقفة', completed:'الخطة معتمدة', reviewStatus:'بانتظار المراجعة', progress:'تقدم الخطة', allApproved:'تمت الموافقة على كل خطوات الخطة.', noExecution:'تم اعتماد التصور فقط. لا يوجد تنفيذ فعلي أو إجراء خارجي.',
    historySub:'كل طلباتك وخططك في مكان واحد.', searchTasks:'ابحث في المهام...', detail:'تفاصيل المهمة', backHistory:'العودة إلى السجل', taskRequest:'الطلب الأصلي', planProgress:'حالة الخطة', created:'تاريخ الإنشاء', demoTask:'مهمة عرض', userTask:'طلبك', noTasks:'لا توجد مهام تطابق بحثك.', profileSub:'تحكم في تفضيلاتك وطريقة عرض مساحة العمل.', accountDetails:'بيانات الحساب', displayName:'الاسم المعروض', organization:'الجهة أو النشاط', language:'لغة الواجهة', languageDesc:'يتم حفظ اختيارك على هذا الجهاز.', notifications:'التنبيهات', notificationDesc:'تنبيهات محلية داخل مساحة العمل.', safeguards:'ضوابط التفويض', safeguard1:'لا شيء يتحرك دون موافقتك.', safeguard2:'كل خطوة مستقلة وتحتاج قراراً واضحاً.', safeguard3:'لا توجد تكاملات أو إجراءات خارجية.', saveProfile:'حفظ الملف', saved:'تم الحفظ', interface:'تفضيلات الواجهة', userName:'مستخدم العمْدة', orgName:'مشروعك', taskCount:'طلب', tasksCount:'طلبات', menu:'القائمة', languageSwitch:'EN', search:'بحث', newTask:'إنشاء طلب جديد', taskPlan:'خطة المهمة', planIsDemo:'عرض محلي', chooseAgent:'اختر وكيلاً متخصصاً', workbenchTag:'مساحة عمل خاضعة لإشرافك', requestCreated:'تم إنشاء خطة المعاينة', emptyHistory:'ابدأ بطلبك الأول', emptyHistoryText:'ستجد خططك هنا مع سجل واضح لكل قرار وموافقة.', toWorkbench:'إنشاء طلب', updateName:'أدخل اسمك', updateOrg:'اسم النشاط أو الفريق', approvedCount:'خطوات معتمدة', pendingCount:'خطوات متبقية', noExternal:'بدون إجراءات خارجية',
    cat_business:'الأعمال', cat_development:'التطوير', cat_design:'التصميم', cat_marketing:'التسويق', cat_research:'البحث', cat_assistant:'المساعد الشخصي',
    desc_business:'خطط واضحة للنمو والعمليات وقرارات العمل.', desc_development:'تفكيك المتطلبات إلى خطوات تقنية قابلة للمراجعة.', desc_design:'تحويل الأفكار إلى موجزات وتجارب مرئية.', desc_marketing:'رسائل وحملات وخطط محتوى عملية.', desc_research:'أسئلة منظمة ومحاور بحث قابلة للتحقق.', desc_assistant:'تنظيم الأولويات والمهام اليومية باهتمام.',
    label_business:'استراتيجية وتشغيل', label_development:'هندسة ومنتج', label_design:'تجربة وهوية', label_marketing:'نمو ومحتوى', label_research:'تحليل واكتشاف', label_assistant:'تنظيم يومي',
    plan1:'تحديد النتيجة المطلوبة ونطاق المهمة', plan2:'تقسيم العمل إلى مخرجات قابلة للمراجعة', plan3:'تجهيز ملخص وتسليم للمراجعة النهائية', plan4:'مراجعة المخاطر والافتراضات معك',
    authAccount:'حساب Supabase', authUnavailable:'إعدادات Supabase غير متاحة حالياً. سيبقى هذا العرض محلياً على هذا الجهاز.', authConfigured:'تسجيل الدخول يحفظ مهامك وملفك في مساحة خاصة بحسابك.', authChecking:'جارٍ التحقق من إعدادات الحساب...', email:'البريد الإلكتروني', password:'كلمة المرور', signIn:'تسجيل الدخول', signUp:'إنشاء حساب', switchToSignUp:'ليس لديك حساب؟ أنشئ حساباً', switchToSignIn:'لديك حساب بالفعل؟ سجّل الدخول', signOut:'تسجيل الخروج', emailConfirmation:'تحقق من بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول.', signedInAs:'تم تسجيل الدخول باسم', avatar:'الصورة الشخصية', uploadAvatar:'رفع صورة', avatarHint:'PNG أو JPEG أو WebP، بحد أقصى 5 ميجابايت. الصورة خاصة بحسابك.', authWorking:'جارٍ حفظ التغييرات...', localOnly:'معاينة محلية فقط', apiUnavailable:'تعذر الاتصال بخادم الحسابات. ما زالت المعاينة المحلية متاحة.', saveTaskFailed:'تعذر حفظ المهمة في Supabase.', profileSaved:'تم حفظ الملف في حسابك.',
    confirmStop:'هل تريد إيقاف هذه المهمة؟', active:'نشط', availableFor:'اختصاص متاح', privacy:'خصوصية وتحكم', assistantLabel:'موجّه AL OMDA', noMore:'هذا العرض لا يتصل بأي خدمة خارجية.', chatWelcome:'أهلاً بك. صف المهمة التي تريد تفويضها، وسأعرض لك تصوراً محلياً لتراجعه.', localResponse:'هذا تصور توضيحي مبني على قالب محلي. لا يتصل بذكاء اصطناعي ولا ينفّذ أي خطوة.',
  },
  en: {
    overview:'Overview', aiChat:'AI Chat', agents:'Agent marketplace', workbench:'Workbench', history:'Task history', profile:'Profile',
    workspace:'WORKSPACE', account:'ACCOUNT', control:'You stay in control', controlText:'Every step needs your approval. This preview takes no external action.',
    developerTitle:'Developer console', developerSub:'A technical view of your workspace', dashboard:'Dashboard', welcome:'Your workspace, in full view.', hello:'Welcome back,', hero:'Delegate with confidence. Keep every decision yours.', heroText:'Choose a specialty, review the proposed plan, then decide what moves forward.', newRequest:'New request', activeTasks:'Awaiting review', approvedPlans:'Plans approved', specialists:'Specialties available', totalTasks:'Total tasks', preview:'LOCAL PREVIEW', recent:'Recent tasks', seeHistory:'View history', specialties:'Agent specialties', allSix:'All six specialties', demoNotice:'Seeded demo data. Plans are deterministic local previews—not AI output and not real execution.',
    marketplace:'Agent marketplace', marketplaceSub:'Specialists for focused work, always under your oversight.', all:'All', available:'Available now', useAgent:'Start a request', request:'Request help', workbenchSub:'Describe what you need, then review every proposed step.', requestLabel:'What would you like to delegate?', requestPlaceholder:'Example: Outline a launch plan for a subscription service for small businesses in Riyadh...', chooseSpecialty:'Choose a specialty', generatePlan:'Propose a plan', yourPlan:'Proposed plan', planEmptyTitle:'Your plan starts here', planEmptyText:'Describe your request and choose a specialty. AL OMDA will create a tailored AI plan for your review before execution.', planDisclaimer:'AL OMDA will create a tailored AI plan for your review before execution begins.', edit:'Edit', save:'Save changes', stepDetails:'Step details', expectedOutput:'Expected output', completionCheck:'Completion check', approve:'Approve step', reject:'Reject step', approvedStep:'Approved', rejectedStep:'Rejected — edit or approve to continue', pendingStep:'Awaiting your approval', step:'Step', pause:'Pause task', resume:'Resume review', stop:'Stop task', paused:'Paused', stopped:'Stopped', completed:'Plan approved', reviewStatus:'Awaiting review', progress:'Plan progress', allApproved:'All proposed steps have been approved.', noExecution:'Only the outline was approved. No real execution or external action took place.',
    historySub:'Every request and proposed plan, in one place.', searchTasks:'Search tasks...', detail:'Task details', backHistory:'Back to history', taskRequest:'Original request', planProgress:'Plan status', created:'Created', demoTask:'Demo task', userTask:'Your request', noTasks:'No tasks match your search.', profileSub:'Set your preferences and how your workspace behaves.', accountDetails:'Account details', displayName:'Display name', organization:'Organization or project', language:'Interface language', languageDesc:'Your choice is saved on this device.', notifications:'Notifications', notificationDesc:'Local notifications inside this workspace.', safeguards:'Delegation safeguards', safeguard1:'Nothing moves without your approval.', safeguard2:'Each step is separate and requires a clear decision.', safeguard3:'No integrations or external actions are connected.', saveProfile:'Save profile', saved:'Saved', interface:'Interface preferences', userName:'AL OMDA user', orgName:'Your workspace', taskCount:'task', tasksCount:'tasks', menu:'MENU', languageSwitch:'عربي', search:'Search', newTask:'Create a request', taskPlan:'Task plan', planIsDemo:'LOCAL PREVIEW', chooseAgent:'Choose a specialist', workbenchTag:'A workspace under your direction', requestCreated:'Preview plan created', emptyHistory:'Start with your first request', emptyHistoryText:'Your plans will appear here with a clear record of every decision.', toWorkbench:'Create a request', updateName:'Enter your name', updateOrg:'Business or team name', approvedCount:'steps approved', pendingCount:'steps remaining', noExternal:'No external actions',
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
  { path:'/workbench', key:'workbench', icon:MessageSquareText }, { path:'/history', key:'history', icon:History },
];
const STORE_KEY = 'al-omda-demo-v1';
const starterTasks: Task[] = [
  { id:'demo-brief', title:'خطة إطلاق خدمة استشارية', request:'إعداد تصور أولي لإطلاق خدمة استشارية رقمية تستهدف الشركات الصغيرة.', specialty:'business', status:'approved', createdAt:'2025-02-20T10:30:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الشريحة المستهدفة والقيمة المقترحة',state:'approved'},{id:'s2',text:'تقسيم الإطلاق إلى مراحل ومخرجات',state:'approved'},{id:'s3',text:'اقتراح مؤشرات متابعة للمراجعة',state:'approved'}] },
  { id:'demo-content', title:'أفكار محتوى للربع القادم', request:'اقتراح محاور محتوى تعرّف الجمهور بخدماتنا دون مبالغة في الوعود.', specialty:'marketing', status:'review', createdAt:'2025-02-19T08:10:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الجمهور ونبرة التواصل المناسبة',state:'approved'},{id:'s2',text:'اقتراح محاور محتوى قابلة للمراجعة',state:'pending'},{id:'s3',text:'ترتيب المحاور في جدول نشر أولي',state:'pending'}] },
  { id:'demo-research', title:'مراجعة تجربة صفحة التسجيل', request:'مراجعة تجربة التسجيل الحالية وتحديد أسئلة البحث التي تساعد على تحسينها.', specialty:'research', status:'paused', createdAt:'2025-02-17T14:05:00.000Z', demo:true, steps:[{id:'s1',text:'تحديد الأسئلة والافتراضات التي تحتاج تحققاً',state:'approved'},{id:'s2',text:'اقتراح محاور مراجعة تجربة المستخدم',state:'pending'},{id:'s3',text:'تلخيص النتائج المتوقعة للمراجعة',state:'pending'}] },
];

function readInitial(): { language:Language; tasks:Task[]; name:string; org:string; notices:boolean } {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) return { ...{ language:'ar' as Language, tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', notices:true }, ...JSON.parse(stored) };
  } catch { /* use seeded local preview */ }
  return { language:'ar', tasks:starterTasks, name:'مستخدم العمْدة', org:'مشروعك', notices:true };
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
  const { language, tasks, name, org, notices } = saved;
  const t = (key:TranslationKey) => translations[language][key];
  const isAr = language === 'ar';
  const [request, setRequest] = useState('');
  const [planGenerating, setPlanGenerating] = useState(false);
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
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarWorking, setAvatarWorking] = useState(false);
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
    setSaved((prev) => ({ ...prev, name:remoteName, org:remoteOrg, tasks:workspace.tasks as Task[] }));
    setProfileName(remoteName);
    setProfileOrg(remoteOrg);
    setAvatarPath(workspace.profile.avatarPath);
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
  useEffect(() => {
    if (requestedSpecialty && specialties.some(({id})=>id===requestedSpecialty)) setSelectedSpecialty(requestedSpecialty as Specialty);
  }, [requestedSpecialty]);

  const saveRemoteTask = (task:Task) => {
    const write = () => apiUpdateTask(task.id, {
      title:task.title, request:task.request, specialty:task.specialty, steps:task.steps, status:task.status,
    }, apiRequestOptions).then(() => undefined);
    const previous = taskWriteQueue.current.get(task.id) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(write);
    taskWriteQueue.current.set(task.id, pending);
    void pending.catch((error) => setWorkspaceError(readApiError(error, t('saveTaskFailed')))).finally(() => {
      if (taskWriteQueue.current.get(task.id) === pending) taskWriteQueue.current.delete(task.id);
    });
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
  const approveStep = (task:Task, stepId:string) => {
    const stepIndex = task.steps.findIndex((step) => step.id === stepId);
    if (stepIndex < 0 || task.status !== 'review') return;
    const firstOpen = task.steps.findIndex((step) => step.state !== 'approved');
    if (stepIndex !== firstOpen) return;
    const steps = task.steps.map((step) => step.id === stepId ? { ...step, state:'approved' as StepState } : step);
    patchTask(task.id, (prev) => ({ ...prev, steps, status:steps.every((step) => step.state === 'approved') ? 'approved' : 'review' }));
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
    return <Link key={item.path} href={item.path} className={`${mobile ? '' : 'nav-link'}${active ? ' active' : ''}`} data-testid={`link-${item.key}`}>
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

  const agentsPage = () => <div className="page-enter">
    {pageHeading(t('marketplace'),t('marketplace'),t('marketplaceSub'))}
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

  const historyPage = () => {
    const statusFilter = new URLSearchParams(window.location.search).get('status');
    const filtered = tasks.filter((task)=>
      (!statusFilter || (statusFilter === 'review' ? task.status === 'review' || task.status === 'paused' : task.status === statusFilter)) &&
      `${task.title} ${task.request} ${label(task.specialty)}`.toLowerCase().includes(query.toLowerCase())
    );
    return <div className="page-enter">
      {pageHeading(t('history'),t('history'),t('historySub'),<Link href="/workbench" className="button button-primary"><Plus size={15}/>{t('newTask')}</Link>)}
      <div className="field-group" style={{maxWidth:460}}><div style={{position:'relative'}}><Search size={15} style={{position:'absolute',insetInlineStart:13,top:13,color:'#818891'}}/><input className="field" style={{paddingInlineStart:38}} placeholder={t('searchTasks')} value={query} onChange={(event)=>setQuery(event.target.value)} data-testid="input-search-tasks"/></div></div>
      <div className="history-layout">{filtered.map((task)=><Link href={`/history/${task.id}`} className="panel history-item" key={task.id} data-testid={`history-task-${task.id}`}>
        <span className="task-icon">{taskIcon(task.specialty)}</span><span className="task-main"><strong>{task.title}</strong><small>{label(task.specialty)} · {dateLabel(task.createdAt,language)} · {count(task)}/{task.steps.length} {t('approvedCount')}{task.demo?` · ${t('demoTask')}`:''}</small></span>{statusBadge(task.status)}<ArrowLeft size={15} className="muted"/>
      </Link>)}
      {filtered.length===0 && <div className="panel plan-empty"><div><span className="empty-mark"><Search size={21}/></span><h3>{tasks.length ? t('noTasks') : t('emptyHistory')}</h3><p>{tasks.length ? t('noTasks') : t('emptyHistoryText')}</p>{!tasks.length&&<Link href="/workbench" className="button button-primary" style={{marginTop:16}}>{t('toWorkbench')}</Link>}</div></div>}</div>
    </div>;
  };

  const taskDetailPage = (task:Task) => {
    const approvedSteps = task.steps.filter((step)=>step.state === 'approved').length;
    const rejectedSteps = task.steps.filter((step)=>step.state === 'rejected').length;
    const pendingSteps = task.steps.length - approvedSteps - rejectedSteps;
    const planApproval = task.steps.length ? Math.round(approvedSteps / task.steps.length * 100) : 0;
    return <div className="page-enter">
      {pageHeading(t('detail'),task.title,`${label(task.specialty)} · ${dateLabel(task.createdAt,language)}`,<Link href="/history" className="button button-quiet"><ArrowRight size={14}/>{t('backHistory')}</Link>)}
      <div className="history-detail">
        <div>{renderPlan(task)}</div>
        <aside className="project-tracking">
          <section className="panel panel-pad">
            <div className="section-head"><h2 className="section-title">{isAr?'مؤشرات المشروع':'Project indicators'}</h2>{statusBadge(task.status)}</div>
            <div className="project-kpi-grid">
              <div className="project-kpi"><small>{isAr?'اعتماد الخطة':'Plan approval'}</small><strong>{planApproval}%</strong></div>
              <div className="project-kpi"><small>{isAr?'خطوات معتمدة':'Approved steps'}</small><strong>{approvedSteps}/{task.steps.length}</strong></div>
              <div className="project-kpi"><small>{isAr?'خطوات مرفوضة':'Rejected steps'}</small><strong>{rejectedSteps}</strong></div>
              <div className="project-kpi"><small>{isAr?'خطوات متبقية':'Pending steps'}</small><strong>{pendingSteps}</strong></div>
            </div>
            <div className="project-progress-track"><span style={{width:`${planApproval}%`}}/></div>
            <div className="setting-row"><div><strong>{isAr?'حالة التنفيذ الفعلي':'Actual execution'}</strong><small>{isAr?'لم يتم تسجيل تنفيذ فعلي لهذا المشروع بعد':'No real execution has been recorded for this project yet'}</small></div><span className="status-chip paused">{isAr?'غير مسجل':'Not tracked'}</span></div>
            <div className="notice-bar" style={{marginTop:14}}><ShieldCheck size={15}/><span>{isAr?'هذه النسبة تقيس اعتماد خطوات الخطة فقط، وليست نسبة نجاح المشروع النهائي. سيتم احتساب النجاح والفشل الفعليين بعد تسجيل نتائج التنفيذ والاختبارات لكل مرحلة.':'This percentage measures plan approval only, not final project success. Actual success/failure requires recorded execution results and tests for each stage.'}</span></div>
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

  const profilePage = () => <div className="page-enter">
    {pageHeading(t('profile'),t('profile'),t('profileSub'))}
    <div className="profile-grid">
      <section className="panel panel-pad">
        <div className="section-head"><h2 className="section-title">{t('accountDetails')}</h2><UserRound size={16} className="muted"/></div>
        <div className="profile-summary">{authUser && avatarPath ? <img className="profile-avatar profile-avatar-image" src={`/api/storage/avatar?v=${avatarVersion}`} alt={t('avatar')} data-testid="img-profile-avatar"/> : <div className="profile-avatar">{profileName.trim().charAt(0)||'ع'}</div>}<div><h2 style={{fontSize:16,margin:'0 0 5px'}}>{profileName}</h2><span className="muted" style={{fontSize:10}}>{profileOrg}</span></div></div>
        <div className="field-group"><label className="form-label" htmlFor="profile-name">{t('displayName')}</label><input id="profile-name" className="field" value={profileName} onChange={(event)=>setProfileName(event.target.value)} placeholder={t('updateName')} data-testid="input-profile-name"/></div>
        <div className="field-group"><label className="form-label" htmlFor="profile-org">{t('organization')}</label><input id="profile-org" className="field" value={profileOrg} onChange={(event)=>setProfileOrg(event.target.value)} placeholder={t('updateOrg')} data-testid="input-profile-org"/></div>
        <button className="button button-primary" onClick={()=>void handleSaveProfile()} data-testid="button-save-profile"><Check size={14}/>{savedToast?t('saved'):t('saveProfile')}</button>
      </section>
      <div style={{display:'grid',gap:14,alignContent:'start'}}>
        <section className="panel panel-pad">
          <div className="section-head"><h2 className="section-title">{t('authAccount')}</h2><LockKeyhole size={15} className="muted"/></div>
          {authLoading && <p className="account-copy" role="status">{t('authChecking')}</p>}
          {!authLoading && authStatus === 'unconfigured' && <div className="notice-bar"><ShieldCheck size={15}/><span>{t('authUnavailable')} <span className="mono">SUPABASE_URL</span> / <span className="mono">SUPABASE_PUBLISHABLE_KEY</span></span></div>}
          {!authLoading && authStatus === 'offline' && <div className="notice-bar"><ShieldCheck size={15}/><span>{authError || t('apiUnavailable')}</span></div>}
          {!authLoading && authStatus === 'configured' && !authUser && <>
            <p className="account-copy">{t('authConfigured')}</p>
            <form className="account-form" onSubmit={handleAuthSubmit}>
              <div className="field-group"><label className="form-label" htmlFor="auth-email">{t('email')}</label><input id="auth-email" type="email" className="field" autoComplete="email" required maxLength={254} value={authEmail} onChange={(event)=>setAuthEmail(event.target.value)} data-testid="input-auth-email"/></div>
              <div className="field-group"><label className="form-label" htmlFor="auth-password">{t('password')}</label><input id="auth-password" type="password" className="field" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} value={authPassword} onChange={(event)=>setAuthPassword(event.target.value)} data-testid="input-auth-password"/></div>
              {authError && <div className="notice-bar notice-error" role="alert">{authError}</div>}
              <button className="button button-primary" type="submit" disabled={authWorking} data-testid="button-auth-submit"><LockKeyhole size={14}/>{authWorking?t('authWorking'):authMode === 'login'?t('signIn'):t('signUp')}</button>
            </form>
            <button type="button" className="text-button" onClick={()=>{setAuthMode(authMode === 'login'?'signup':'login');setAuthError('');setAuthNotice('');}} data-testid="button-auth-mode">{authMode === 'login'?t('switchToSignUp'):t('switchToSignIn')}</button>
          </>}
          {!authLoading && authUser && <div className="account-signed-in">
            <div className="account-email"><span className="online-dot"/><span>{t('signedInAs')} <strong>{authUser.email}</strong></span></div>
            <p className="account-copy">{t('authConfigured')}</p>
            <label className={`button button-quiet button-small ${avatarWorking?'disabled':''}`} htmlFor="avatar-file"><UserRound size={13}/>{avatarWorking?t('authWorking'):t('uploadAvatar')}</label>
            <input id="avatar-file" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} disabled={avatarWorking} data-testid="input-avatar-file"/>
            <small className="account-hint">{t('avatarHint')}</small>
            <button type="button" className="button button-danger button-small" onClick={()=>void handleSignOut()} disabled={authWorking} data-testid="button-sign-out">{t('signOut')}</button>
          </div>}
          {authNotice && <div className="notice-bar account-message" role="status">{authNotice}</div>}
          {workspaceError && <div className="notice-bar notice-error account-message" role="alert">{workspaceError}</div>}
        </section>
        <section className="panel panel-pad"><div className="section-head"><h2 className="section-title">{t('interface')}</h2><Settings2 size={16} className="muted"/></div>
          <div className="setting-row"><div><strong>{t('language')}</strong><small>{t('languageDesc')}</small></div><button className="button button-quiet button-small" onClick={toggleLanguage}>{isAr?'العربية':'English'} <ChevronDown size={12}/></button></div>
          <div className="setting-row"><div><strong>{t('notifications')}</strong><small>{t('notificationDesc')}</small></div><button role="switch" aria-checked={notices} className={`toggle ${notices?'on':''}`} onClick={()=>setSaved((prev)=>({...prev,notices:!prev.notices}))} aria-label={t('notifications')} data-testid="toggle-notifications"/></div>
        </section>
        <section className="panel panel-pad"><div className="section-head"><h2 className="section-title">{t('safeguards')}</h2><ShieldCheck size={16} color="#c6a76c"/></div>
          {[t('safeguard1'),t('safeguard2'),t('safeguard3')].map((item,index)=><div className="setting-row" key={item}><div style={{display:'flex',alignItems:'center',gap:10}}><span className="specialty-icon"><Check size={14}/></span><strong>{item}</strong></div><span className="section-meta">0{index+1}</span></div>)}
        </section>
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
  return <div className="app-shell" dir={isAr?'rtl':'ltr'}>
    <aside className="sidebar">
      <Link href="/" className="brand-lockup"><span className="brand-mark">ع</span><span><span className="brand-name">AL OMDA AI</span><span className="brand-sub" style={{display:'block'}}>{isAr?'مساعدون تحت إشرافك':'SPECIALISTS, YOUR CALL'}</span></span></Link>
      <div className="nav-caption">{t('workspace')}</div><nav className="nav-stack">{navItems.map((item)=>navLink(item))}</nav>
      <div className="sidebar-bottom"><div className="control-note"><ShieldCheck size={17} color="#d0ae70"/><strong>{t('control')}</strong><p>{t('controlText')}</p></div><Link href="/profile" className="profile-mini"><span className="avatar">{name.charAt(0)||'ع'}</span><span><strong>{name}</strong><small>{org}</small></span><ArrowUpLeft size={13} style={{marginInlineStart:'auto',color:'#777e87'}}/></Link></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb">{t(pageTitleKey)}</div><div className="top-actions">
        <button type="button" className="status-chip status-button" onClick={()=>setLocation('/profile')} data-testid="button-auth-status"><span className={`online-dot ${authUser?'':'offline-dot'}`}/>{authUser?'Supabase':t('localOnly')}</button>
        <button className="lang-button" onClick={toggleLanguage} data-testid="button-language">{t('languageSwitch')}</button>
        <Link href="/profile" className="icon-button" aria-label={t('profile')} data-testid="link-profile"><UserRound size={16}/></Link>
      </div></header>
      <div className="content-wrap">{page}</div>
    </main>
    <nav className="mobile-nav" aria-label={t('menu')}>{navItems.map((item)=>navLink(item,true))}{navLink({path:'/profile',key:'profile',icon:UserRound},true)}</nav>
  </div>;
}

export default App;
