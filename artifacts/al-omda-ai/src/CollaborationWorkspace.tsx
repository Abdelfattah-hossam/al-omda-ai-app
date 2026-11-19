import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Contact, Plus, RefreshCw, Trash2, Ticket, UserRound } from "lucide-react";

type Kind = "contact" | "event" | "ticket";
type RecordItem = {
  id: string; kind: Kind; title: string; description: string;
  status: "open" | "in_progress" | "resolved"; dueAt: string | null;
  metadata: Record<string, unknown>; createdAt: string; updatedAt: string;
};

type Props = { kind: Kind; language: "ar" | "en" };

const copy = {
  ar: {
    contact: { title: "جهات الاتصال", subtitle: "دفتر عناوين خاص بحسابك، محفوظ في قاعدة البيانات ويمكنك تعديله أو حذفه.", add: "إضافة جهة اتصال", empty: "لا توجد جهات اتصال محفوظة بعد.", name: "الاسم", description: "ملاحظات", email: "البريد الإلكتروني", phone: "رقم الهاتف", company: "الشركة" },
    event: { title: "التقويم", subtitle: "أنشئ مواعيدك واحفظها مع التاريخ والوقت. الوقت يُحفظ بتوقيت UTC ويُعرض حسب جهازك.", add: "إضافة موعد", empty: "لا توجد مواعيد محفوظة بعد.", name: "عنوان الموعد", description: "التفاصيل", email: "", phone: "", company: "" },
    ticket: { title: "التذاكر والدعم", subtitle: "تابع طلبات الدعم التي تنشئها هنا، وحدّث حالتها أو احذفها.", add: "إنشاء تذكرة", empty: "لا توجد تذاكر محفوظة بعد.", name: "عنوان التذكرة", description: "وصف المشكلة أو الطلب", email: "", phone: "", company: "" },
    status: "الحالة", open: "مفتوحة", in_progress: "قيد التنفيذ", resolved: "تم الحل", date: "التاريخ والوقت", save: "حفظ", cancel: "إلغاء", delete: "حذف", loading: "جارٍ التحميل…", refresh: "تحديث", signIn: "سجّل الدخول لاستخدام التخزين السحابي ومزامنة بياناتك.", failed: "تعذر إتمام العملية.", saved: "تم الحفظ بنجاح.", local: "هذه سجلات داخلية خاصة بحسابك؛ لا تتصل تلقائيًا بجهات اتصال الهاتف أو تقويم خارجي أو نظام دعم خارجي."
  },
  en: {
    contact: { title: "Contacts", subtitle: "A private address book saved to your account database. You can edit or delete entries.", add: "Add contact", empty: "No contacts saved yet.", name: "Name", description: "Notes", email: "Email", phone: "Phone", company: "Company" },
    event: { title: "Calendar", subtitle: "Create and save events with a date and time. Times are stored in UTC and displayed in your device timezone.", add: "Add event", empty: "No saved events yet.", name: "Event title", description: "Details", email: "", phone: "", company: "" },
    ticket: { title: "Tickets & Support", subtitle: "Track support requests created here, update their status, or delete them.", add: "Create ticket", empty: "No saved tickets yet.", name: "Ticket title", description: "Issue or request details", email: "", phone: "", company: "" },
    status: "Status", open: "Open", in_progress: "In progress", resolved: "Resolved", date: "Date and time", save: "Save", cancel: "Cancel", delete: "Delete", loading: "Loading…", refresh: "Refresh", signIn: "Sign in to use cloud storage and sync your data.", failed: "The operation could not be completed.", saved: "Saved.", local: "These are private in-app records; they do not automatically connect to your phone contacts, an external calendar, or an external helpdesk."
  }
} as const;

export default function CollaborationWorkspace({ kind, language }: Props) {
  const ar = language === "ar";
  const t = copy[language];
  const labels = t[kind];
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<RecordItem["status"]>("open");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/collaboration/" + kind, { credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.failed);
    } finally { setLoading(false); }
  }, [kind, t.failed]);

  useEffect(() => { void load(); }, [load]);

  function reset() {
    setTitle(""); setDescription(""); setEmail(""); setPhone(""); setCompany(""); setDueAt(""); setStatus("open");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError(""); setNotice("");
    const metadata = kind === "contact" ? { email: email.trim(), phone: phone.trim(), company: company.trim() } : {};
    const payload = { title: title.trim(), description: description.trim(), status, dueAt: kind === "event" && dueAt ? new Date(dueAt).toISOString() : null, metadata };
    try {
      const response = await fetch("/api/collaboration/" + kind, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      setRecords(current => [data.record as RecordItem, ...current]);
      reset(); setNotice(t.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
    finally { setSaving(false); }
  }

  async function updateStatus(record: RecordItem, next: RecordItem["status"]) {
    setError("");
    try {
      const response = await fetch("/api/collaboration/" + kind + "/" + record.id, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ title: record.title, description: record.description, status: next, dueAt: record.dueAt, metadata: record.metadata })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      setRecords(current => current.map(item => item.id === record.id ? data.record : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
  }

  async function remove(record: RecordItem) {
    if (!window.confirm(ar ? "هل تريد حذف هذا السجل نهائيًا؟" : "Permanently delete this record?")) return;
    setError("");
    try {
      const response = await fetch("/api/collaboration/" + kind + "/" + record.id, { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      setRecords(current => current.filter(item => item.id !== record.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
  }

  const Icon = kind === "contact" ? Contact : kind === "event" ? CalendarDays : Ticket;
  return <div className="page-enter">
    <section className="panel panel-pad" style={{ marginBottom: 16 }}>
      <div className="section-head"><div><span className="eyebrow">AL OMDA · WORKSPACE</span><h1 className="section-title">{labels.title}</h1><p className="section-meta">{labels.subtitle}</p></div><Icon size={22}/></div>
      <p className="section-meta" style={{ marginTop: 8 }}>{t.local}</p>
      {error && <div className="notice-bar notice-error" role="alert">{error}</div>}
      {notice && <div className="notice-bar" role="status">{notice}</div>}
      <form onSubmit={create} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <div className="field-group"><label className="form-label">{labels.name}</label><input className="field" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></div>
        {kind === "contact" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10 }}>
          <div className="field-group"><label className="form-label">{labels.email}</label><input className="field" type="email" maxLength={200} value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div className="field-group"><label className="form-label">{labels.phone}</label><input className="field" type="tel" maxLength={200} value={phone} onChange={event => setPhone(event.target.value)} /></div>
          <div className="field-group"><label className="form-label">{labels.company}</label><input className="field" maxLength={200} value={company} onChange={event => setCompany(event.target.value)} /></div>
        </div>}
        {kind === "event" && <div className="field-group"><label className="form-label">{t.date}</label><input className="field" type="datetime-local" required value={dueAt} onChange={event => setDueAt(event.target.value)} /></div>}
        {kind !== "contact" && <div className="field-group"><label className="form-label">{t.status}</label><select className="field" value={status} onChange={event => setStatus(event.target.value as RecordItem["status"])}><option value="open">{t.open}</option><option value="in_progress">{t.in_progress}</option><option value="resolved">{t.resolved}</option></select></div>}
        <div className="field-group"><label className="form-label">{labels.description}</label><textarea className="field" rows={3} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button button-primary" type="submit" disabled={saving || !title.trim()}><Plus size={14}/>{saving ? t.loading : labels.add}</button><button className="button button-quiet" type="button" onClick={reset}>{t.cancel}</button><button className="button button-quiet" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{t.refresh}</button></div>
      </form>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><strong>{ar ? "السجلات المحفوظة" : "Saved records"}</strong><span className="status-chip">{records.length}</span></div>
      {loading ? <p className="section-meta" role="status">{t.loading}</p> : records.length === 0 ? <div className="plan-empty"><UserRound size={24}/><p>{labels.empty}</p></div> : <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {records.map(record => <article className="panel panel-pad" key={record.id}>
          <div className="section-head"><strong style={{ overflowWrap: "anywhere" }}>{record.title}</strong><button type="button" className="icon-button" onClick={() => void remove(record)} aria-label={t.delete} title={t.delete}><Trash2 size={15}/></button></div>
          {kind === "contact" && <p className="section-meta">{[record.metadata.email, record.metadata.phone, record.metadata.company].filter(value => typeof value === "string" && value).join(" · ")}</p>}
          {record.description && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{record.description}</p>}
          {record.dueAt && <p className="section-meta">{new Date(record.dueAt).toLocaleString(ar ? "ar" : "en")}</p>}
          {kind !== "contact" && <div className="field-group" style={{ maxWidth: 240, marginTop: 8 }}><label className="form-label">{t.status}</label><select className="field" value={record.status} onChange={event => void updateStatus(record, event.target.value as RecordItem["status"])}><option value="open">{t.open}</option><option value="in_progress">{t.in_progress}</option><option value="resolved">{t.resolved}</option></select></div>}
          <small className="muted">{new Date(record.createdAt).toLocaleString(ar ? "ar" : "en")}</small>
        </article>)}
      </div>}
    </section>
  </div>;
}
