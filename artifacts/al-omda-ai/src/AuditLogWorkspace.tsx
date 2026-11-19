import { useCallback, useEffect, useRef, useState } from "react";
import { History, RefreshCw, ShieldCheck } from "lucide-react";

type AuditEvent = {
  id: string;
  action: "created" | "updated" | "deleted";
  record_kind: "contact" | "event" | "ticket";
  record_id: string;
  created_at: string;
};

type Props = { language: "ar" | "en" };

function isAuditEvent(item: unknown): item is AuditEvent {
  if (!item || typeof item !== "object") return false;
  const value = item as Record<string, unknown>;
  return typeof value.id === "string" &&
    (value.action === "created" || value.action === "updated" || value.action === "deleted") &&
    (value.record_kind === "contact" || value.record_kind === "event" || value.record_kind === "ticket") &&
    typeof value.record_id === "string" && typeof value.created_at === "string" &&
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
    failed: "تعذر تحميل سجل الأنشطة. سجّل الدخول وحاول مرة أخرى.",
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
    failed: "Could not load the activity log. Sign in and try again.",
  }
} as const;

export default function AuditLogWorkspace({ language }: Props) {
  const ar = language === "ar";
  const t = text[language];
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (offset = 0, append = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestSequence.current;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ offset: String(offset) });
      const response = await fetch("/api/collaboration/audit?" + query.toString(), {
        credentials: "same-origin", headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store"
      });
      const data = await response.json().catch(() => null);
      if (requestId !== requestSequence.current) return;
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      if (!Array.isArray(data?.events) || !data.events.every(isAuditEvent)) throw new Error(t.failed);
      setEvents(current => append ? [...current, ...data.events as AuditEvent[]] : data.events as AuditEvent[]);
      setNextOffset(typeof data.nextOffset === "number" && Number.isSafeInteger(data.nextOffset) ? data.nextOffset : null);
    } catch {
      if (requestId === requestSequence.current && timedOut) setError(t.failed);
      else if (requestId === requestSequence.current && !controller.signal.aborted) setError(t.failed);
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === requestSequence.current) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [t.failed]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; abortRef.current?.abort(); };
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
      <div className="section-head"><strong>{ar ? "سجل التغييرات" : "Change history"}</strong><span className="status-chip">{events.length}</span></div>
      {loading && events.length === 0 ? <p className="section-meta" role="status">{t.loading}</p> : events.length === 0 ? <div className="plan-empty"><History size={24}/><p>{t.empty}</p></div> : <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {events.map(event => <article className="panel panel-pad" key={event.id}>
          <div className="section-head"><strong>{actionLabel(event.action)} · {kindLabel(event.record_kind)}</strong><span className="muted">{formatDate(event.created_at, ar ? "ar-SA" : "en-US")}</span></div>
          <p className="section-meta">{t.record}: <span style={{ fontFamily: "monospace" }}>{/* record_id is a UUID; show its short prefix */}{event.record_id.slice(0, 8)}</span></p>
        </article>)}
      </div>}
      {nextOffset !== null && <button type="button" className="button button-quiet" style={{ marginTop: 12 }} onClick={() => void load(nextOffset, true)} disabled={loading}>{loading ? t.loading : t.more}</button>}
    </section>
  </div>;
}
