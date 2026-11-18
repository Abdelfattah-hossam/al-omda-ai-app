export const MEMORY_NODE_TYPES = [
  "preference", "project", "decision", "constraint", "correction",
  "person", "organization", "tool", "other",
] as const;
export type MemoryNodeType = typeof MEMORY_NODE_TYPES[number];

export const MEMORY_RELATIONS = [
  "prefers", "owns", "works_on", "decided", "constrained_by",
  "corrected", "related_to", "member_of", "uses", "created",
] as const;
export type MemoryRelation = typeof MEMORY_RELATIONS[number];

export type MemoryNodeInput = {
  user_id: string;
  node_type: MemoryNodeType;
  label: string;
  normalized_label: string;
  details: Record<string, unknown>;
  source: "user_confirmed" | "conversation_confirmed" | "imported";
  confidence: number;
};

export type MemoryEdgeInput = {
  user_id: string;
  source_node_id: string;
  target_node_id: string;
  relation: MemoryRelation;
  details: Record<string, unknown>;
  source: "user_confirmed" | "conversation_confirmed" | "imported";
  confidence: number;
};

const BLOCKED_DETAIL_KEYS = /password|secret|token|api.?key|access.?key|credit.?card|bank.?account|passport|national.?id|ssn|medical|diagnos|health|religion|politic|sexual|ethnic|race|salary|income|bank.?account|account.?number|credit.?card|debit.?card|tax.?id|financial.?account|email|phone|mobile|home.?address|street.?address|date.?of.?birth|\bdob\b|gps|coordinates|latitude|longitude/i;
const BLOCKED_SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{25,}|Bearer\s+[A-Za-z0-9._~-]{20,})/i;
const BLOCKED_CREDENTIAL_TEXT = /(?:\b(?:my\s+)?(?:password|passcode|api.?key|access.?token|bearer(?:\s+token)?)\s*(?:is\s+|[:=]\s*|\s+)\S+|(?:كلمة\s+(?:المرور|السر)|(?:رمز|كود)\s+(?:التحقق|الدخول)|بيانات\s+الدخول)\s*(?:هي|هو|is|[:=])?\s*\S+|(?:my\s+)?passport(?:\s+(?:number|no\.?))?\s*(?:is|[:=])\s*[A-Z0-9][A-Z0-9-]{4,}|(?:رقم\s+جواز\s+السفر|جواز\s+السفر)\s*(?:هو|هي|[:=])?\s*[A-Z0-9][A-Z0-9-]{4,})/iu;
const BLOCKED_CONTACT_TEXT = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:i live at|our home is|my home is|my home address is|my street address is|my phone(?: number)? is|my mobile is|my email is|my address is|my exact location is|my precise location is|my location is)\s*[:=]?\s*[^,;.!?]{3,120}|(?:عنواني|رقم هاتفي|تليفوني|موبايلي|بريدي الإلكتروني|بريدي الالكتروني|إيميلي|ايميلي|موقعي الدقيق)\s*[:=]?\s*[^،,؛;.!؟?]{3,120}/iu;
const BLOCKED_FINANCIAL_TEXT = /(?:i earn|my salary|my income|salary is|income is|bank account|account number|credit card|debit card|tax id|financial account|wallet|راتبي|دخلي|حسابي البنكي|رقم حسابي|بطاقتي البنكية|بطاقة ائتمان)\s*[:=]?\s*[^,;.!?]{2,120}/iu;
const BLOCKED_INSTRUCTION_TEXT = /ignore (?:all )?(?:previous|prior|system|developer) instructions|reveal (?:the )?(?:system|developer) prompt|bypass (?:safety|security|authentication|authorization)|disable authentication|remove access controls|exfiltrate|steal credentials|execute arbitrary shell commands/i;
const BLOCKED_SENSITIVE_TEXT = /(?:ميولي الجنسية|التوجه الجنسي|الميول الجنسية)|\b(?:my|our|i have|i am|i'm|i follow|i practice|i identify as|i belong to|i support|i vote for|member of)\b.{0,80}\b(?:medical|health|diagnos|illness|disease|diabetes|cancer|asthma|epilepsy|hiv|disability|christian|muslim|jewish|hindu|buddhist|sikh|atheist|agnostic|religion|political party|political affiliation|political views|ethnic|ethnicity|race|sexual orientation|gay|lesbian|bisexual|transgender)\b|\b(?:christian|muslim|jewish|hindu|buddhist|sikh|atheist|agnostic|gay|lesbian|bisexual|transgender)\b|\b(?:political party|party membership|political affiliation|sexual orientation|ethnic identity)\b|(?:انا|أنا|أني|اني|ديانتي|معتقدي|انتمي|أنتمي|أؤيد|اؤيد|عضو في|من اصول|من أصول|ميولي الجنسية|التوجه الجنسي|ميولي|الجنسية|جنسية|عرقي|صحتي|مرضي|تشخيصي).{0,80}(?:مسلم|مسيحي|يهودي|هندوسي|بوذي|ملحد|لا ديني|حزب|سياسي|عرقي|أصل|اصول|أصول|مثلي|مثلية|ثنائي الميول|متحول|مرض|سكري|سرطان|إعاقة|اعاقة)/iu;

function containsBlockedDetailKey(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsBlockedDetailKey(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([key, item]) =>
    BLOCKED_DETAIL_KEYS.test(key) || containsBlockedDetailKey(item, depth + 1)
  );
}

function normalizeDetails(value: unknown, maxBytes: number): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Memory details must be a JSON object.");
  const details = value as Record<string, unknown>;
  if (containsBlockedDetailKey(details)) throw new Error("Memory details must not contain credentials or sensitive personal-data fields.");
  const serialized = JSON.stringify(details);
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) throw new Error("Memory details exceed the allowed size.");
  if (BLOCKED_SECRET_VALUE.test(serialized)) throw new Error("Memory details appear to contain a credential or access token.");
  if (BLOCKED_CREDENTIAL_TEXT.test(serialized)) throw new Error("Memory details appear to contain a credential or access token.");
  if (BLOCKED_CONTACT_TEXT.test(serialized)) throw new Error("Personal contact details or precise location must not be stored in AI memory.");
  if (BLOCKED_FINANCIAL_TEXT.test(serialized)) throw new Error("Personal financial information must not be stored in AI memory.");
  if (BLOCKED_INSTRUCTION_TEXT.test(serialized)) throw new Error("Instruction-like prompt injection content must not be stored as memory.");
  if (BLOCKED_SENSITIVE_TEXT.test(serialized)) throw new Error("Sensitive personal information must not be stored in AI memory.");
  return details;
}

function normalizeSource(value: unknown): MemoryEdgeInput["source"] {
  if (value === undefined) return "user_confirmed";
  if (value === "user_confirmed" || value === "conversation_confirmed" || value === "imported") return value;
  throw new Error("Invalid memory source.");
}

function normalizeConfidence(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Memory confidence must be a number between 0 and 1.");
  }
  return value;
}

export function parseMemoryNode(input: unknown, userId: string): MemoryNodeInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Memory node must be a JSON object.");
  const value = input as Record<string, unknown>;
  if (!MEMORY_NODE_TYPES.includes(value.nodeType as MemoryNodeType)) throw new Error("Unsupported memory node type.");
  if (typeof value.label !== "string" || !value.label.trim()) throw new Error("Memory node label must contain 1 to 160 characters.");
  const label = value.label.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (label.length > 160) throw new Error("Memory node label must contain 1 to 160 characters.");
  if (BLOCKED_SECRET_VALUE.test(label)) throw new Error("Memory node label appears to contain a credential or access token.");
  if (BLOCKED_CREDENTIAL_TEXT.test(label)) throw new Error("Memory node label appears to contain a credential or access token.");
  if (BLOCKED_CONTACT_TEXT.test(label)) throw new Error("Personal contact details or precise location must not be stored in AI memory.");
  if (BLOCKED_FINANCIAL_TEXT.test(label)) throw new Error("Personal financial information must not be stored in AI memory.");
  if (BLOCKED_INSTRUCTION_TEXT.test(label)) throw new Error("Instruction-like prompt injection content must not be stored as memory.");
  if (BLOCKED_SENSITIVE_TEXT.test(label)) throw new Error("Sensitive personal information must not be stored in AI memory.");
  const normalizedLabel = label.toLocaleLowerCase().replace(/[؟?!.,،؛;:]+/g, "").replace(/\s+/g, " ");
  if (!normalizedLabel) throw new Error("Memory node label must contain searchable text.");
  return {
    user_id: userId,
    node_type: value.nodeType as MemoryNodeType,
    label,
    normalized_label: normalizedLabel.slice(0, 180),
    details: normalizeDetails(value.details, 4096),
    source: normalizeSource(value.source),
    confidence: normalizeConfidence(value.confidence),
  };
}

export function parseMemoryEdge(input: unknown, userId: string): MemoryEdgeInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Memory edge must be a JSON object.");
  const value = input as Record<string, unknown>;
  if (typeof value.sourceNodeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.sourceNodeId)) throw new Error("A valid source node ID is required.");
  if (typeof value.targetNodeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.targetNodeId)) throw new Error("A valid target node ID is required.");
  if (value.sourceNodeId === value.targetNodeId) throw new Error("A memory relationship cannot connect a node to itself.");
  if (!MEMORY_RELATIONS.includes(value.relation as MemoryRelation)) throw new Error("Unsupported memory relationship.");
  return {
    user_id: userId,
    source_node_id: value.sourceNodeId,
    target_node_id: value.targetNodeId,
    relation: value.relation as MemoryRelation,
    details: normalizeDetails(value.details, 2048),
    source: normalizeSource(value.source),
    confidence: normalizeConfidence(value.confidence),
  };
}


function hasMemoryOptOut(value: string): boolean {
  return /(?:\b(?:do not|don't|never)\s+(?:remember|save|store)\b|\bforget\b|مش\s*(?:تفتكر|تحفظ|تسجل)|لا\s*(?:تفتكر|تحفظ|تسجل)|(?<![\u0621-\u064A])ما\s*(?:تفتكر|تحفظ|تسجل)|انس(?:ى|ي))/i.test(value);
}

export function isExplicitMemoryIntent(request: string): boolean {
  return /^(?:please\s+)?(?:remember|save|store|keep in memory)\b|^(?:افتكر|احفظ|سجل في الذاكرة|سجل عندك|ثبت عندك|متنساش|ما\s+تنساش)/i.test(request.normalize("NFKC").trim());
}

export function shouldWarnExplicitMemoryNotSaved(request: string, extractedNode: Record<string, unknown> | null): boolean {
  const normalized = request.normalize("NFKC").trim();
  return isExplicitMemoryIntent(normalized) && !extractedNode && !hasMemoryOptOut(normalized);
}

export function extractExplicitMemoryNode(request: string): Record<string, unknown> | null {
  const text = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  if (!text || hasMemoryOptOut(text)) return null;
  const patterns = [
    /^(?:please\s+)?(?:remember|save|store|keep in memory)\s+(?:that\s+)?(.+)$/i,
    /^(?:افتكر|افتكر\s+ان|افتكر\s+أن|افتكر\s+إن|احفظ|احفظ\s+ان|احفظ\s+أن|احفظ\s+إن|سجل\s+في\s+الذاكرة|سجل\s+عندك|ثبت\s+عندك|متنساش|ما\s+تنساش)\s*(.+)$/i,
  ];
  let fact = "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      fact = match[1].trim().replace(/^[،,:؛\s]+|[.!؟?]+$/g, "");
      break;
    }
  }
  if (!fact || fact.length > 400) return null;
  if (/password|passcode|secret|api.?key|access.?token|bank.?account|credit.?card|passport|national.?id|diagnos|health condition|religion|political party|sexual orientation|race|ethnic|كلمة المرور|كلمة السر|رمز سري|مفتاح api|رقم بطاقة|حساب بنكي|جواز سفر|تشخيص|مرض|ديانة|انتماء سياسي|ميول جنسية|عرق|أصل عرقي/i.test(fact)) return null;
  if (BLOCKED_SECRET_VALUE.test(fact) || BLOCKED_CONTACT_TEXT.test(fact) || BLOCKED_FINANCIAL_TEXT.test(fact) || BLOCKED_INSTRUCTION_TEXT.test(fact) || BLOCKED_SENSITIVE_TEXT.test(fact)) return null;
  const nodeType = /project|مشروع|تطبيق|موقع|منصة/i.test(fact) ? "project"
    : /decision|decided|قرار|قررت|اتفقنا/i.test(fact) ? "decision"
    : /constraint|must|never|don't change|لا تغير|لا تعدل|مايتغيرش|ما يتغيرش|مايتعدلش|ما يتعدلش|ممنوع|شرط/i.test(fact) ? "constraint"
    : /correct|correction|wrong|غلط|تصحيح|صحح/i.test(fact) ? "correction"
    : /prefer|preference|أفضل|افضل|بحب|أفضلية|عايز|عاوز|اريد|أريد/i.test(fact) ? "preference"
    : "other";
  return {
    nodeType,
    label: fact,
    details: { explicitlyRequestedForMemory: true },
    source: "user_confirmed",
    confidence: 1,
  };
}


export function extractUserCorrectionNode(request: string): Record<string, unknown> | null {
  const text = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  if (hasMemoryOptOut(text)) return null;
  const patterns = [
    /^(?:correction|that's incorrect|that is incorrect|you got that wrong|i said)\s*[:,—-]?\s*(.+)$/i,
    /^(?:التصحيح(?:\s+هو)?|الصح(?:\s+إن|\s+ان)?|انا\s+قلتلك(?:\s+ان|\s+إن)?|أنا\s+قلت\s+لك(?:\s+أن|\s+ان)?|لا[،,\s]+(?:ده|دا)?\s*(?:غلط|مش\s+صح))\s*[:,—-]?\s*(.+)$/i,
  ];
  let correction = "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      correction = match[1].trim().replace(/^[،,:؛\s]+|[.!؟?]+$/g, "");
      break;
    }
  }
  if (!correction || correction.length > 400) return null;
  if (/password|passcode|secret|api.?key|access.?token|bank.?account|credit.?card|passport|national.?id|diagnos|health condition|religion|political party|sexual orientation|race|ethnic|كلمة المرور|كلمة السر|رمز سري|مفتاح api|رقم بطاقة|حساب بنكي|جواز سفر|تشخيص|مرض|ديانة|انتماء سياسي|ميول جنسية|عرق|أصل عرقي/i.test(correction)) return null;
  if (BLOCKED_SECRET_VALUE.test(correction) || BLOCKED_CONTACT_TEXT.test(correction) || BLOCKED_FINANCIAL_TEXT.test(correction) || BLOCKED_INSTRUCTION_TEXT.test(correction) || BLOCKED_SENSITIVE_TEXT.test(correction)) return null;
  return {
    nodeType: "correction",
    label: correction,
    details: { userCorrection: true },
    source: "conversation_confirmed",
    confidence: 1,
  };
}