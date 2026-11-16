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

const BLOCKED_DETAIL_KEYS = /password|secret|token|api.?key|access.?key|credit.?card|bank.?account|passport|national.?id|ssn|medical|diagnos|health|religion|politic|sexual|ethnic|race/i;
const BLOCKED_SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{25,}|Bearer\s+[A-Za-z0-9._~-]{20,})/i;
const BLOCKED_SENSITIVE_TEXT = /\b(?:my|our|i have|i am)\b.{0,60}\b(?:medical|health|diagnos|illness|disease|diabetes|cancer|religion|political affiliation|sexual orientation|race|ethnic identity)\b|صحتي|مرضي|تشخيصي|ديانتي|معتقدي|انتمائي السياسي|ميولي الجنسية|عرقي/i;

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
  if (typeof value.label !== "string" || !value.label.trim() || value.label.trim().length > 160) throw new Error("Memory node label must contain 1 to 160 characters.");
  const label = value.label.normalize("NFKC").trim().replace(/\s+/g, " ");
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
  if (typeof value.sourceNodeId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.sourceNodeId)) throw new Error("A valid source node ID is required.");
  if (typeof value.targetNodeId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.targetNodeId)) throw new Error("A valid target node ID is required.");
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


export function extractExplicitMemoryNode(request: string): Record<string, unknown> | null {
  const text = request.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  if (!text || /^(?:don't|do not|never)\s+(?:remember|save|store)\b|^(?:مش|مت)\s*(?:تفتكر|تحفظ|تسجل)|لا\s*(?:تفتكر|تحفظ|تسجل)|انس(?:ى|ي)|forget\b/i.test(text)) return null;
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
  return {
    nodeType: "correction",
    label: correction,
    details: { userCorrection: true },
    source: "conversation_confirmed",
    confidence: 1,
  };
}
