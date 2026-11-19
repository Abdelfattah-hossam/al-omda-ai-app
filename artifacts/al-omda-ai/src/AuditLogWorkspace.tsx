import { useCallback, useEffect, useRef, useState } from "react";
import { History, RefreshCw, ShieldCheck } from "lucide-react";

type AuditEvent = {
  id: string;
  action: "created" | "updated" | "deleted";
  record_kind: "contact" | "event" | "ticket";
  record_id: string;
  created_at: string;
};

type AuditCursor = { createdAt: string; id: string };
type Props = { language: "ar" | "en" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoTimestampPattern = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/;
function isAuditCursor(value: unknown): value is AuditCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Record<string, unknown>;
  return typeof cursor.createdAt === "string" && isoTimestampPattern.test(cursor.createdAt) && Number.isFinite(new Date(cursor.createdAt).getTime()) &&
    typeof cursor.id === "string" && uuidPattern.test(cursor.id);
}
function shortId(id: string): string {
  return uuidPattern.test(id) ? id.slice(0, 8) : id;
}

function isAuditEvent(item: unknown): item is AuditEvent {
  if (!item || typeof item !== "object") return false;
  const value = item as Record<string, unknown>;
  return typeof value.id === "string" && uuidPattern.test(value.id) &&
    (value.action === "created" || value.action === "updated" || value.action === "deleted") &&
    (value.record_kind === "contact" || value.record_kind === "event" || value.record_kind === "ticket") &&
    typeof value.record_id === "string" && uuidPattern.test(value.record_id) && typeof value.created_at === "string" &&
    Number.isFinite(new Date(value.created_at).getTime());
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(locale) : "—";
}

const text = {
  ar: {
    title: "الأمان والسجلات",
    subtitle: "سجل موثّق للتغييرات التي تمت على جهات الاتصال والمواعيد والتذاكر داخل حسابك.",
    scope: "النطاق الحالي: إنشاء وتعديل وحذف سجلات التعاون فقط. لا يمثل هذا سجل محاولات تسجيل الدخول أو تنبيهات اختراق أو أحداثًا من خدمات خارجية.",
    empty: "لا توجد تغييرات مسجلة حتى الآن.",
    loading: "جارٍ تحميل السجل…",
    refresh: "تحديث",
    more: "تحميل المزيد",
    created: "تم الإنشاء",
    updated: "تم التعديل",
    deleted: "تم الحذف",
    contact: "جهة اتصال",
    event: "موعد",
    ticket: "تذكرة",
    record: "السجل",
    failed: "تعذر تحميل سجل الأنشطة. تحقق من الاتصال وحاول مرة أخرى.",
  },
  en: {
    title: "Security & Logs",
    subtitle: "A verified history of changes made to contacts, events, and tickets in your account.",
    scope: "Current scope: create, update, and delete operations on collaboration records only. This is not a login-attempt log, intrusion alert feed, or external-service audit trail.",
    empty: "No changes have been recorded yet.",
    loading: "Loading audit history…",
    refresh: "Refresh",
    more: "Load more",
    created: "Created",
    updated: "Updated",
    deleted: "Deleted",
    contact: "Contact",
    event: "Event",
    ticket: "Ticket",
    record: "Record",
    failed: "Could not load the activity log. Check your connection and try again.",
  }
} as const;

export default function AuditLogWorkspace({ language }: Props) {
  const ar = language === "ar";
  const t = text[language];
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<AuditCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor: AuditCursor | null = null, append = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams();
      if (cursor) {
        query.set("beforeCreatedAt", cursor.createdAt);
        query.set("beforeId", cursor.id);
      }
      const queryString = query.toString();
      const response = await fetch("/api/collaboration/audit" + (queryString ? "?" + queryString : ""), {
        credentials: "same-origin", headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store"
      });
      const data = await response.json().catch(() => null);
      if (abortRef.current !== controller) return;
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      if (!Array.isArray(data?.events) || !data.events.every(isAuditEvent)) throw new Error(t.failed);
      const incoming = data.events as AuditEvent[];
      setEvents(current => {
        if (!append) return incoming;
        const seen = new Set(current.map(event => event.id));
        return [...current, ...incoming.filter(event => !seen.has(event.id))];
      });
      setNextCursor(isAuditCursor(data.nextCursor) ? data.nextCursor : null);
    } catch (cause) {
      if (abortRef.current !== controller) return;
      if (timedOut) setError(t.failed);
      else if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : t.failed);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [t.failed]);

  useEffect(() => {
    void load();
    return () => { abortRef.current?.abort(); abortRef.current = null; };
  }, [load]);

  const actionLabel = (action: AuditEvent["action"]) => action === "created" ? t.created : action === "updated" ? t.updated : t.deleted;
  const kindLabel = (kind: AuditEvent["record_kind"]) => kind === "contact" ? t.contact : kind === "event" ? t.event : t.ticket;

  return <div className="page-enter">
    <section className="panel panel-pad" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div><span className="eyebrow">AL OMDA · AUDIT TRAIL</span><h1 className="section-title">{t.title}</h1><p className="section-meta">{t.subtitle}</p></div>
        <ShieldCheck size={22}/>
      </div>
      <p className="section-meta" style={{ marginTop: 10 }}>{t.scope}</p>
      {error && <div className="notice-bar notice-error" role="alert">{error}</div>}
      <button type="button" className="button button-quiet" style={{ marginTop: 12 }} onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{t.refresh}</button>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><strong>{ar ? "سجل التغييرات" : "Change history"}</strong><span className="status-chip">{ar ? `تم تحميل ${events.length}` : `${events.length} loaded`}</span></div>
      {loading && events.length === 0 ? <p className="section-meta" role="status">{t.loading}</p> : events.length === 0 ? (error ? null : <div className="plan-empty"><History size={24}/><p>{t.empty}</p></div>) : <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {events.map(event => <article className="panel panel-pad" key={event.id}>
          <div className="section-head"><strong>{actionLabel(event.action)} · {kindLabel(event.record_kind)}</strong><span className="muted">{formatDate(event.created_at, ar ? "ar-SA" : "en-US")}</span></div>
          <p className="section-meta">{t.record}: <span style={{ fontFamily: "monospace" }}>{/* record_id is a UUID; show its short prefix */}{shortId(event.record_id)}</span></p>
        </article>)}
      </div>}
      {nextCursor !== null && <button type="button" className="button button-quiet" style={{ marginTop: 12 }} onClick={() => void load(nextCursor, true)} disabled={loading}>{loading ? t.loading : t.more}</button>}
    </section>
  </div>;
}
