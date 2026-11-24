import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {createPortal} from "react-dom";
import { CalendarDays, Contact, Edit3, Plus, RefreshCw, Trash2, Ticket, UserRound } from "lucide-react";

type Kind = "contact" | "event" | "ticket";
type RecordItem = {
  id: string; kind: Kind; title: string; description: string;
  status: "open" | "in_progress" | "resolved"; dueAt: string | null;
  metadata: Record<string, unknown>; createdAt: string; updatedAt: string;
};

type Props = { kind: Kind; language: "ar" | "en" };

const copy = {
  ar: {
    contact: { title: "جهات الاتصال", subtitle: "دفتر عناوين خاص بحسابك، محفوظ في قاعدة البيانات ويمكنك تعديله أو حذفه.", add: "إضافة جهة اتصال", update: "حفظ التعديلات", empty: "لا توجد جهات اتصال محفوظة بعد.", name: "الاسم", description: "ملاحظات", email: "البريد الإلكتروني", phone: "رقم الهاتف", company: "الشركة" },
    event: { title: "التقويم", subtitle: "أنشئ مواعيدك واحفظها مع التاريخ والوقت. الوقت يُحفظ بتوقيت UTC ويُعرض حسب جهازك.", add: "إضافة موعد", update: "حفظ التعديلات", empty: "لا توجد مواعيد محفوظة بعد.", name: "عنوان الموعد", description: "التفاصيل", email: "", phone: "", company: "" },
    ticket: { title: "التذاكر والدعم", subtitle: "تابع طلبات الدعم التي تنشئها هنا، وحدّث حالتها أو احذفها.", add: "إنشاء تذكرة", update: "حفظ التعديلات", empty: "لا توجد تذاكر محفوظة بعد.", name: "عنوان التذكرة", description: "وصف المشكلة أو الطلب", email: "", phone: "", company: "" },
    status: "الحالة", open: "مفتوحة", in_progress: "قيد التنفيذ", resolved: "تم الحل", date: "التاريخ والوقت", save: "حفظ", cancel: "إلغاء", delete: "حذف", loading: "جارٍ التحميل…", refresh: "تحديث", signIn: "سجّل الدخول لاستخدام التخزين السحابي ومزامنة بياناتك.", failed: "تعذر إتمام العملية.", saved: "تم الحفظ بنجاح.", local: "هذه سجلات داخلية خاصة بحسابك؛ لا تتصل تلقائيًا بجهات اتصال الهاتف أو تقويم خارجي أو نظام دعم خارجي."
  },
  en: {
    contact: { title: "Contacts", subtitle: "A private address book saved to your account database. You can edit or delete entries.", add: "Add contact", update: "Save changes", empty: "No contacts saved yet.", name: "Name", description: "Notes", email: "Email", phone: "Phone", company: "Company" },
    event: { title: "Calendar", subtitle: "Create and save events with a date and time. Times are stored in UTC and displayed in your device timezone.", add: "Add event", update: "Save changes", empty: "No saved events yet.", name: "Event title", description: "Details", email: "", phone: "", company: "" },
    ticket: { title: "Tickets & Support", subtitle: "Track support requests created here, update their status, or delete them.", add: "Create ticket", update: "Save changes", empty: "No saved tickets yet.", name: "Ticket title", description: "Issue or request details", email: "", phone: "", company: "" },
    status: "Status", open: "Open", in_progress: "In progress", resolved: "Resolved", date: "Date and time", save: "Save", cancel: "Cancel", delete: "Delete", loading: "Loading…", refresh: "Refresh", signIn: "Sign in to use cloud storage and sync your data.", failed: "The operation could not be completed.", saved: "Saved.", local: "These are private in-app records; they do not automatically connect to your phone contacts, an external calendar, or an external helpdesk."
  }
} as const;

export default function CollaborationWorkspace({ kind, language }: Props) {
  const ar = language === "ar";
  const t = copy[language];
  const labels = t[kind];
  const statusLabels = kind === "event"
    ? (ar ? { open: "مجدول", in_progress: "جارٍ الآن", resolved: "انتهى" } : { open: "Scheduled", in_progress: "In progress", resolved: "Completed" })
    : { open: t.open, in_progress: t.in_progress, resolved: t.resolved };
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<RecordItem["status"]>("open");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete,setPendingDelete]=useState<RecordItem|null>(null);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const returnFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!pendingDelete)return;
    return()=>{const previous=returnFocus.current;if(previous?.isConnected)previous.focus();else document.getElementById('collab-title')?.focus();};
  },[pendingDelete]);

  const load = useCallback(async (offset = 0, append = false) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/collaboration/" + kind + "?offset=" + offset, { credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      if (!Array.isArray(data?.records) || !data.records.every((item: unknown) => item && typeof item === "object" && typeof (item as RecordItem).id === "string")) throw new Error(t.failed);
      setRecords(current => append ? [...current, ...data.records as RecordItem[]] : data.records as RecordItem[]);
      setNextOffset(typeof data.nextOffset === "number" && Number.isSafeInteger(data.nextOffset) ? data.nextOffset : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.failed);
    } finally { setLoading(false); }
  }, [kind, t.failed]);

  useEffect(() => { setRecords([]); setNextOffset(null); reset(); void load(0, false); }, [kind, load]);

  function reset() {
    setTitle(""); setDescription(""); setEmail(""); setPhone(""); setCompany(""); setDueAt(""); setStatus("open"); setEditingId(null);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError(""); setNotice("");
    const metadata = kind === "contact" ? { email: email.trim(), phone: phone.trim(), company: company.trim() } : {};
    const payload = { title: title.trim(), description: description.trim(), status, dueAt: kind === "event" && dueAt ? new Date(dueAt).toISOString() : null, metadata };
    try {
      const response = await fetch("/api/collaboration/" + kind + (editingId ? "/" + editingId : ""), {
        method: editingId ? "PATCH" : "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      const savedRecord = data?.record as RecordItem | undefined;
      if (!savedRecord || typeof savedRecord.id !== "string") throw new Error(t.failed);
      if (editingId) setRecords(current => current.map(item => item.id === editingId ? savedRecord : item));
      else setRecords(current => [savedRecord, ...current]);
      reset(); setNotice(t.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
    finally { setSaving(false); }
  }

  function startEdit(record: RecordItem) {
    setEditingId(record.id); setTitle(record.title); setDescription(record.description);
    setEmail(typeof record.metadata.email === "string" ? record.metadata.email : "");
    setPhone(typeof record.metadata.phone === "string" ? record.metadata.phone : "");
    setCompany(typeof record.metadata.company === "string" ? record.metadata.company : "");
    setDueAt(record.dueAt ? (() => { const date = new Date(record.dueAt as string); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); })() : "");
    setStatus(record.status); setNotice("");
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
      const updatedRecord = data?.record as RecordItem | undefined;
      if (!updatedRecord || typeof updatedRecord.id !== "string") throw new Error(t.failed);
      setRecords(current => current.map(item => item.id === record.id ? updatedRecord : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
  }

  function requestRemove(record:RecordItem) {
    returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setDeleteError("");setPendingDelete(record);
  }

  async function remove() {
    const record=pendingDelete;
    if(!record||deleting)return;
    setDeleting(true);setDeleteError("");setError("");
    try {
      const response = await fetch("/api/collaboration/" + kind + "/" + record.id, { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : t.failed);
      setRecords(current => current.filter(item => item.id !== record.id));
      if(editingId===record.id)reset();
      setPendingDelete(null);setNotice(ar?"تم حذف السجل.":"Record deleted.");
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : t.failed); }
    finally {setDeleting(false);}
  }

  const Icon = kind === "contact" ? Contact : kind === "event" ? CalendarDays : Ticket;
  return <div className="page-enter">
    <section className="panel panel-pad" style={{ marginBottom: 16 }}>
      <div className="section-head"><div><span className="eyebrow">Munjizly · WORKSPACE</span><h1 className="section-title">{labels.title}</h1><p className="section-meta">{labels.subtitle}</p></div><Icon size={22}/></div>
      <p className="section-meta" style={{ marginTop: 8 }}>{t.local}</p>
      {error && <div className="notice-bar notice-error" role="alert">{error}</div>}
      {notice && <div className="notice-bar" role="status">{notice}</div>}
      <form onSubmit={create} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <div className="field-group"><label className="form-label" htmlFor="collab-title">{labels.name}</label><input id="collab-title" className="field" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></div>
        {kind === "contact" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10 }}>
          <div className="field-group"><label className="form-label" htmlFor="collab-email">{labels.email}</label><input id="collab-email" className="field" type="email" maxLength={200} value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div className="field-group"><label className="form-label" htmlFor="collab-phone">{labels.phone}</label><input id="collab-phone" className="field" type="tel" maxLength={200} value={phone} onChange={event => setPhone(event.target.value)} /></div>
          <div className="field-group"><label className="form-label" htmlFor="collab-company">{labels.company}</label><input id="collab-company" className="field" maxLength={200} value={company} onChange={event => setCompany(event.target.value)} /></div>
        </div>}
        {kind === "event" && <div className="field-group"><label className="form-label" htmlFor="collab-date">{t.date}</label><input id="collab-date" className="field" type="datetime-local" required value={dueAt} onChange={event => setDueAt(event.target.value)} /></div>}
        {kind !== "contact" && <div className="field-group"><label className="form-label" htmlFor="collab-status">{t.status}</label><select id="collab-status" className="field" value={status} onChange={event => setStatus(event.target.value as RecordItem["status"])}><option value="open">{statusLabels.open}</option><option value="in_progress">{statusLabels.in_progress}</option><option value="resolved">{statusLabels.resolved}</option></select></div>}
        <div className="field-group"><label className="form-label" htmlFor="collab-description">{labels.description}</label><textarea id="collab-description" className="field" rows={3} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button button-primary" type="submit" disabled={saving || !title.trim()}>{editingId ? <Edit3 size={14}/> : <Plus size={14}/>}{saving ? t.loading : editingId ? labels.update : labels.add}</button><button className="button button-quiet" type="button" onClick={reset}>{t.cancel}</button><button className="button button-quiet" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{t.refresh}</button></div>
      </form>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><strong>{ar ? "السجلات المحفوظة" : "Saved records"}</strong><span className="status-chip">{records.length}</span></div>
      {loading ? <p className="section-meta" role="status">{t.loading}</p> : records.length === 0 ? <div className="plan-empty"><UserRound size={24}/><p>{labels.empty}</p></div> : <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {records.map(record => <article className="panel panel-pad" key={record.id}>
          <div className="section-head"><strong style={{ overflowWrap: "anywhere" }}>{record.title}</strong><div style={{ display: "flex", gap: 6 }}><button type="button" className="icon-button" onClick={() => startEdit(record)} aria-label={labels.update} title={labels.update}><Edit3 size={15}/></button><button type="button" className="icon-button" onClick={() => requestRemove(record)} aria-label={t.delete} title={t.delete}><Trash2 size={15}/></button></div></div>
          {kind === "contact" && <p className="section-meta">{[record.metadata.email, record.metadata.phone, record.metadata.company].filter(value => typeof value === "string" && value).join(" · ")}</p>}
          {record.description && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{record.description}</p>}
          {record.dueAt && <p className="section-meta">{new Date(record.dueAt).toLocaleString(ar ? "ar" : "en")}</p>}
          {kind !== "contact" && <div className="field-group" style={{ maxWidth: 240, marginTop: 8 }}><label className="form-label" htmlFor={`collab-status-${record.id}`}>{t.status}</label><select id={`collab-status-${record.id}`} className="field" value={record.status} onChange={event => void updateStatus(record, event.target.value as RecordItem["status"])}><option value="open">{statusLabels.open}</option><option value="in_progress">{statusLabels.in_progress}</option><option value="resolved">{statusLabels.resolved}</option></select></div>}
          <small className="muted">{new Date(record.createdAt).toLocaleString(ar ? "ar" : "en")}</small>
        </article>)}
      </div>}
      {nextOffset !== null && <button type="button" className="button button-quiet" style={{ marginTop: 12 }} onClick={() => void load(nextOffset, true)} disabled={loading}>{loading ? t.loading : (ar ? "تحميل المزيد" : "Load more")}</button>}
    </section>
    {pendingDelete&&createPortal(<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!deleting)setPendingDelete(null);}} style={{position:'fixed',inset:0,zIndex:120,display:'grid',placeItems:'center',padding:16,background:'rgba(0,0,0,.68)',backdropFilter:'blur(5px)'}}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="collab-delete-title" aria-describedby="collab-delete-description" className="panel" dir={ar?'rtl':'ltr'} style={{width:'min(440px,100%)',padding:18,boxShadow:'0 24px 80px rgba(0,0,0,.45)'}} onKeyDown={event=>{
        if(event.key==='Escape'&&!deleting){event.preventDefault();setPendingDelete(null);}
        if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!buttons.length){event.preventDefault();return;}const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
      }}>
        <h3 id="collab-delete-title" style={{margin:'0 0 8px'}}>{ar?'تأكيد حذف السجل':'Confirm record deletion'}</h3>
        <p id="collab-delete-description" style={{margin:'0 0 16px',lineHeight:1.8,color:'var(--text-secondary)'}}>{ar?'سيُحذف السجل التالي نهائيًا، ولا يمكن التراجع.':'This record will be permanently deleted. This cannot be undone.'}<br/><strong style={{overflowWrap:'anywhere'}}>{pendingDelete.title}</strong></p>
        {deleteError&&<p role="alert" className="notice-bar notice-error">{deleteError}</p>}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button autoFocus type="button" className="button" disabled={deleting} onClick={()=>setPendingDelete(null)}>{t.cancel}</button>
          <button type="button" className="button button-danger" disabled={deleting} onClick={()=>void remove()}>{deleting?(ar?'جارٍ الحذف…':'Deleting…'):(ar?'تأكيد الحذف':'Confirm deletion')}</button>
        </div>
      </section>
    </div>,document.body)}
  </div>;
}
