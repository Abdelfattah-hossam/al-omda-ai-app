export type HttpFlowMethod = "GET" | "HEAD" | "OPTIONS";

export type HttpFlowHistoryRecord = {
  id: string;
  createdAt: string;
  target: string;
  method: HttpFlowMethod;
  roles: string[];
  responses: Array<{ role: string; status: number; durationMs: number; bodyLength: number }>;
  comparison: {
    sameStatus: boolean;
    sameBody: boolean;
    bodyDifferenceAt: number | null;
    changedHeaders: string[];
  };
};

export type CreateHttpFlowHistoryInput = {
  id: string;
  createdAt: string;
  url: string;
  method: string;
  roles: string[];
  responses: Array<{ role: string; status: number; durationMs: number; body?: string; bodyLength?: number }>;
  comparison: {
    sameStatus?: unknown;
    sameBody?: unknown;
    bodyDiff?: { firstDifferenceAt?: unknown };
    headerDifferences?: Array<{ header?: unknown }>;
  };
};

export function createHttpFlowHistoryRecord(input: CreateHttpFlowHistoryInput): HttpFlowHistoryRecord {
  const parsed = new URL(input.url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("HTTPFlow history accepts HTTP or HTTPS targets only.");
  const target = (parsed.origin + parsed.pathname).slice(0, 2048);
  const roles = input.roles.filter((role) => /^[a-zA-Z0-9_-]{1,40}$/.test(role)).slice(0, 4);
  const responses = input.responses.slice(0, 4).map((response) => ({
    role: String(response.role).slice(0, 40),
    status: Number.isInteger(response.status) ? response.status : 0,
    durationMs: Number.isFinite(response.durationMs) ? Math.max(0, Math.round(response.durationMs)) : 0,
    bodyLength: typeof response.bodyLength === "number" && Number.isFinite(response.bodyLength) ? Math.max(0, Math.round(response.bodyLength)) : typeof response.body === "string" ? response.body.length : 0,
  }));
  const changedHeaders = [...new Set((input.comparison.headerDifferences || [])
    .map((item) => typeof item.header === "string" ? item.header.toLowerCase().slice(0, 64) : "")
    .filter((name) => /^[a-z0-9-]{1,64}$/.test(name)))].slice(0, 40);
  const method = input.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) throw new Error("Unsupported HTTPFlow history method.");
  return {
    id: input.id.slice(0, 80),
    createdAt: input.createdAt,
    target,
    method: method as HttpFlowMethod,
    roles,
    responses,
    comparison: {
      sameStatus: input.comparison.sameStatus === true,
      sameBody: input.comparison.sameBody === true,
      bodyDifferenceAt: typeof input.comparison.bodyDiff?.firstDifferenceAt === "number" && Number.isFinite(input.comparison.bodyDiff.firstDifferenceAt)
        ? Math.max(0, Math.round(input.comparison.bodyDiff.firstDifferenceAt)) : null,
      changedHeaders,
    },
  };
}

export function normalizeHttpFlowHistory(value: unknown): HttpFlowHistoryRecord[] {
  if (!Array.isArray(value)) return [];
  const records: HttpFlowHistoryRecord[] = [];
  for (const item of value.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<HttpFlowHistoryRecord>;
    if (typeof record.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) ||
        typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) ||
        typeof record.target !== "string" || record.target.length > 2048 ||
        !["GET", "HEAD", "OPTIONS"].includes(String(record.method)) ||
        !Array.isArray(record.roles) || !Array.isArray(record.responses) || !record.comparison) continue;
    try {
      const target = new URL(record.target);
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.search || target.hash) continue;
    } catch { continue; }
    const responses = record.responses.filter((response) => response && typeof response.role === "string" &&
      Number.isInteger(response.status) && Number.isFinite(response.durationMs) && Number.isFinite(response.bodyLength)).slice(0, 4);
    records.push({
      id: record.id,
      createdAt: record.createdAt,
      target: record.target,
      method: record.method as HttpFlowMethod,
      roles: record.roles.filter((role): role is string => typeof role === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(role)).slice(0, 4),
      responses: responses.map((response) => ({ role: response.role.slice(0, 40), status: response.status, durationMs: Math.max(0, Math.round(response.durationMs)), bodyLength: Math.max(0, Math.round(response.bodyLength)) })),
      comparison: {
        sameStatus: record.comparison.sameStatus === true,
        sameBody: record.comparison.sameBody === true,
        bodyDifferenceAt: typeof record.comparison.bodyDifferenceAt === "number" && Number.isFinite(record.comparison.bodyDifferenceAt) ? Math.max(0, Math.round(record.comparison.bodyDifferenceAt)) : null,
        changedHeaders: Array.isArray(record.comparison.changedHeaders) ? [...new Set(record.comparison.changedHeaders.filter((header): header is string => typeof header === "string" && /^[a-z0-9-]{1,64}$/i.test(header)).map((header) => header.toLowerCase()))].slice(0, 40) : [],
      },
    });
  }
  return records;
}
