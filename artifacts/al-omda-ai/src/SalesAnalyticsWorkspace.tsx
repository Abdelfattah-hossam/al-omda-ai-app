import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { isSalesCsvAssetName, parseSalesCsv, type SalesRow } from "./lib/sales-csv";

type Language = "ar" | "en";
type Mode = "overview" | "distribution";
type Asset = { path: string; name: string; createdAt: string | null; size: number | null; mimeType: string | null };
type ParseState = { rows: SalesRow[]; errors: Array<{ row: number; message: string }>; totalRows: number };

const EMPTY_PARSE: ParseState = { rows: [], errors: [], totalRows: 0 };

function formatBytes(value: number | null, isAr: boolean): string {
  if (value === null) return "";
  return value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(1) + (isAr ? " م.ب" : " MB") : Math.max(1, Math.round(value / 1024)) + (isAr ? " ك.ب" : " KB");
}

function money(value: number, currency: string, language: Language): string {
  try {
    return new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return value.toFixed(2) + " " + currency;
  }
}

function downloadTemplate(): void {
  const content = "\uFEFFdate,amount,currency,status,channel,reference\r\n2026-11-01,125.50,AED,paid,Website,ORDER-001\r\n2026-11-02,25.00,AED,refunded,Store,ORDER-002\r\n2026-11-03,80.00,AED,pending,Marketplace,ORDER-003";
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "al-omda-sales-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SalesAnalyticsWorkspace({ language, mode }: { language: Language; mode: Mode }) {
  const isAr = language === "ar";
  const isOverview = mode === "overview";
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [parse, setParse] = useState<ParseState>(EMPTY_PARSE);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingParse, setPendingParse] = useState<ParseState | null>(null);

  const csvAssets = useMemo(() => assets.filter((asset) => isSalesCsvAssetName(asset.name) && (asset.mimeType === "text/csv" || asset.mimeType === null)), [assets]);
  const currencies = useMemo(() => [...new Set(parse.rows.map((row) => row.currency))].sort(), [parse.rows]);
  const selectedRows = useMemo(() => parse.rows.filter((row) => row.currency === currency), [parse.rows, currency]);
  const summary = useMemo(() => {
    const paid = selectedRows.filter((row) => row.status === "paid");
    const refunds = selectedRows.filter((row) => row.status === "refunded");
    const pending = selectedRows.filter((row) => row.status === "pending");
    const gross = paid.reduce((sum, row) => sum + row.amount, 0);
    const refunded = refunds.reduce((sum, row) => sum + row.amount, 0);
    return { gross, refunded, net: gross - refunded, paidCount: paid.length, refundCount: refunds.length, pendingCount: pending.length, average: paid.length ? gross / paid.length : 0 };
  }, [selectedRows]);
  const channels = useMemo(() => {
    const map = new Map<string, { gross: number; refunded: number; paidCount: number; refundCount: number }>();
    for (const row of selectedRows) {
      const current = map.get(row.channel) ?? { gross: 0, refunded: 0, paidCount: 0, refundCount: 0 };
      if (row.status === "paid") { current.gross += row.amount; current.paidCount += 1; }
      if (row.status === "refunded") { current.refunded += row.amount; current.refundCount += 1; }
      map.set(row.channel, current);
    }
    return [...map.entries()].map(([name, value]) => ({ name, ...value, net: value.gross - value.refunded })).sort((a, b) => b.net - a.net);
  }, [selectedRows]);
  const maxChannel = Math.max(1, ...channels.map((item) => Math.max(0, item.net)));

  const refreshAssets = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/storage/assets", { credentials: "same-origin", headers: { accept: "application/json" } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : (isAr ? "تعذر تحميل ملفات المبيعات." : "Could not load sales files."));
      const next = Array.isArray(payload) ? payload as Asset[] : [];
      const csv = next.filter((asset) => isSalesCsvAssetName(asset.name) && (asset.mimeType === "text/csv" || asset.mimeType === null));
      setAssets(csv);
      setSelectedPath((current) => csv.some((asset) => asset.path === current) ? current : csv[0]?.path ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isAr ? "تعذر تحميل ملفات المبيعات." : "Could not load sales files."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refreshAssets(); }, []);

  useEffect(() => {
    if (!selectedPath) { setParse(EMPTY_PARSE); return; }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/storage/assets/download?path=" + encodeURIComponent(selectedPath), { credentials: "same-origin" });
        if (!response.ok) throw new Error(isAr ? "تعذر قراءة ملف المبيعات." : "Could not read the sales file.");
        const text = await response.text();
        const result = parseSalesCsv(text);
        if (!cancelled) {
          setParse(result);
          if (result.errors.length) setError(isAr ? "الملف يحتوي على صفوف غير صالحة؛ راجع الأخطاء قبل الاعتماد عليه." : "The file contains invalid rows; review the errors before using it.");
        }
      } catch (cause) {
        if (!cancelled) { setParse(EMPTY_PARSE); setError(cause instanceof Error ? cause.message : (isAr ? "تعذر قراءة الملف." : "Could not read the file.")); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedPath, isAr]);

  useEffect(() => {
    if (!currencies.length) { setCurrency(""); return; }
    setCurrency((current) => currencies.includes(current) ? current : currencies[0]);
  }, [currencies]);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".csv") || (file.type && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel" && file.type !== "application/octet-stream")) {
      setError(isAr ? "اختر ملف CSV صحيحًا." : "Choose a valid CSV file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(isAr ? "الحد الأقصى لملف الاستيراد 2 ميجابايت." : "The import file limit is 2 MB.");
      return;
    }
    try {
      const result = parseSalesCsv(await file.text());
      setPendingFile(file);
      setPendingParse(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isAr ? "تعذرت قراءة الملف." : "Could not read the file."));
    }
  };

  const uploadFile = async () => {
    if (!pendingFile || !pendingParse || pendingParse.errors.length || !pendingParse.rows.length) return;
    setUploading(true);
    setError("");
    try {
      const url = "/api/storage/assets?filename=" + encodeURIComponent("sales-" + pendingFile.name);
      const response = await fetch(url, { method: "PUT", credentials: "same-origin", headers: { "content-type": "text/csv" }, body: pendingFile });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : (isAr ? "تعذر حفظ ملف CSV." : "Could not save the CSV file."));
      setPendingFile(null);
      setPendingParse(null);
      await refreshAssets();
      if (typeof payload?.path === "string") setSelectedPath(payload.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isAr ? "تعذر حفظ ملف CSV." : "Could not save the CSV file."));
    } finally {
      setUploading(false);
    }
  };

  const heading = isOverview
    ? (isAr ? "نظرة عامة على المبيعات" : "Sales Overview")
    : (isAr ? "توزيع المبيعات" : "Sales Distribution");
  const subtitle = isAr
    ? "تحليلات مبنية على ملف CSV خاص بحسابك. لا توجد أرقام تجريبية ولا يتم جمع عملات مختلفة في إجمالي واحد."
    : "Analytics from a private CSV file in your account. No sample figures are shown, and different currencies are never combined.";
  const statStyle: CSSProperties = { display: "grid", gap: 6, padding: 16, border: "1px solid var(--border)", borderRadius: 14, minWidth: 0, background: "var(--panel, transparent)" };

  return <div className="page-enter" data-testid={mode === "overview" ? "sales-overview" : "sales-distribution"}>
    <div className="page-heading">
      <div><div className="eyebrow">{isAr ? "المالية والتحليلات" : "FINANCE & ANALYTICS"}</div><h1 className="page-title">{heading}</h1><p className="page-subtitle">{subtitle}</p></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="button button-secondary" onClick={downloadTemplate}><Download size={14}/>{isAr ? "قالب CSV" : "CSV template"}</button>
        <label className="button button-primary" style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? .6 : 1 }}>
          {uploading ? <RefreshCw size={14} className="animate-spin"/> : <Upload size={14}/>}
          {isAr ? "استيراد CSV" : "Import CSV"}
          <input type="file" accept=".csv,text/csv" hidden disabled={uploading} onChange={(event) => void chooseFile(event)}/>
        </label>
      </div>
    </div>

    <section className="panel panel-pad" style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div className="section-head"><div><h2 className="section-title">{isAr ? "مصدر البيانات" : "Data source"}</h2><p className="page-subtitle">{isAr ? "يتم حفظ الملف داخل الأصول الخاصة بحسابك." : "The file is stored in your private workspace assets."}</p></div><button type="button" className="button button-secondary" onClick={() => void refreshAssets()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>{isAr ? "تحديث" : "Refresh"}</button></div>
      <select className="field" value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)} disabled={loading || csvAssets.length === 0} aria-label={isAr ? "ملف بيانات المبيعات" : "Sales data file"}>
        {csvAssets.length === 0 ? <option value="">{isAr ? "لا توجد ملفات CSV مستوردة" : "No CSV files imported"}</option> : csvAssets.map((asset) => <option key={asset.path} value={asset.path}>{asset.name} · {formatBytes(asset.size, isAr)}</option>)}
      </select>
      <p className="page-subtitle">{isAr ? "الأعمدة المطلوبة: date, amount, currency, status. القنوات والمرجع اختياريان. الحالات: paid, refunded, pending, cancelled." : "Required columns: date, amount, currency, status. Channel and reference are optional. Status values: paid, refunded, pending, cancelled."}</p>
      {pendingFile && pendingParse && <div className="notice-bar" style={{ display: "grid", gap: 8 }}>
        <strong>{isAr ? "معاينة قبل الحفظ" : "Preview before saving"} · {pendingFile.name}</strong>
        <span>{isAr ? pendingParse.rows.length + " صف صالح من " + pendingParse.totalRows : pendingParse.rows.length + " valid rows of " + pendingParse.totalRows}</span>
        {pendingParse.errors.slice(0, 5).map((item) => <small key={item.row}>{isAr ? "الصف " : "Row "}{item.row}: {item.message}</small>)}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="button button-primary" disabled={uploading || pendingParse.errors.length > 0 || pendingParse.rows.length === 0} onClick={() => void uploadFile()}>{isAr ? "حفظ الملف" : "Save file"}</button>
          <button type="button" className="button button-secondary" onClick={() => { setPendingFile(null); setPendingParse(null); }}>{isAr ? "إلغاء" : "Cancel"}</button>
        </div>
      </div>}
      {error && <p role="alert" className="notice-bar">{error}</p>}
    </section>

    {loading ? <section className="panel panel-pad" style={{ marginTop: 16 }}>{isAr ? "جارٍ تحميل البيانات…" : "Loading data…"}</section>
      : !selectedPath ? <section className="panel panel-pad" style={{ marginTop: 16, display: "grid", justifyItems: "center", gap: 10, textAlign: "center" }}><FileSpreadsheet size={30}/><strong>{isAr ? "لا توجد بيانات مبيعات بعد" : "No sales data yet"}</strong><p className="page-subtitle">{isAr ? "نزّل قالب CSV، أضف معاملاتك الحقيقية، ثم استورد الملف لعرض التحليلات." : "Download the CSV template, add your real transactions, then import it to see analytics."}</p></section>
      : parse.errors.length ? <section className="panel panel-pad" style={{ marginTop: 16 }}><strong>{isAr ? "تعذر تحليل الملف" : "Could not parse this file"}</strong>{parse.errors.slice(0, 10).map((item) => <p key={item.row} className="page-subtitle">{isAr ? "الصف " : "Row "}{item.row}: {item.message}</p>)}</section>
      : parse.rows.length === 0 ? <section className="panel panel-pad" style={{ marginTop: 16 }}>{isAr ? "لا توجد معاملات في الملف." : "The file contains no transactions."}</section>
      : <>
        <section className="panel panel-pad" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label htmlFor="sales-currency" className="page-subtitle">{isAr ? "العملة" : "Currency"}</label>
          <select id="sales-currency" className="field" style={{ maxWidth: 180 }} value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <span className="page-subtitle">{isAr ? parse.rows.length + " معاملة مستوردة" : parse.rows.length + " imported transactions"}</span>
        </section>
        {isOverview ? <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 16 }}>
          <div className="panel" style={statStyle}><span className="page-subtitle">{isAr ? "إجمالي المبيعات" : "Gross sales"}</span><strong style={{ fontSize: 23 }}>{money(summary.gross, currency, language)}</strong><small>{summary.paidCount} {isAr ? "معاملة مدفوعة" : "paid transactions"}</small></div>
          <div className="panel" style={statStyle}><span className="page-subtitle">{isAr ? "المبالغ المستردة" : "Refunds"}</span><strong style={{ fontSize: 23 }}>{money(summary.refunded, currency, language)}</strong><small>{summary.refundCount} {isAr ? "عملية استرداد" : "refunds"}</small></div>
          <div className="panel" style={statStyle}><span className="page-subtitle">{isAr ? "صافي المبيعات" : "Net sales"}</span><strong style={{ fontSize: 23 }}>{money(summary.net, currency, language)}</strong><small>{isAr ? "المبيعات ناقص الاستردادات" : "Gross sales minus refunds"}</small></div>
          <div className="panel" style={statStyle}><span className="page-subtitle">{isAr ? "متوسط الطلب المدفوع" : "Average paid order"}</span><strong style={{ fontSize: 23 }}>{money(summary.average, currency, language)}</strong><small>{summary.pendingCount} {isAr ? "معاملة معلقة" : "pending transactions"}</small></div>
        </section> : <section className="panel panel-pad" style={{ marginTop: 16 }}>
          <h2 className="section-title">{isAr ? "توزيع صافي المبيعات حسب القناة" : "Net sales by channel"}</h2>
          {channels.length === 0 ? <p className="page-subtitle">{isAr ? "لا توجد مبيعات مدفوعة أو مستردة." : "No paid or refunded transactions to distribute."}</p> : <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            {channels.map((item) => <div key={item.name} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{item.name}</strong><span>{money(item.net, currency, language)}</span></div>
              <div style={{ height: 9, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}><div style={{ width: Math.max(0, item.net) / maxChannel * 100 + "%", height: "100%", borderRadius: 99, background: "var(--accent,#bda06b)" }}/></div>
              <small className="page-subtitle">{item.paidCount} {isAr ? "مدفوعة" : "paid"} · {item.refundCount} {isAr ? "مستردة" : "refunded"}</small>
            </div>)}
          </div>}
        </section>}
        <section className="panel panel-pad" style={{ marginTop: 16 }}>
          <h2 className="section-title">{isAr ? "آخر المعاملات" : "Transactions"}</h2>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 13 }}>
              <thead><tr>{[isAr ? "التاريخ" : "Date", isAr ? "المبلغ" : "Amount", isAr ? "الحالة" : "Status", isAr ? "القناة" : "Channel", isAr ? "المرجع" : "Reference"].map((label) => <th key={label} style={{ textAlign: "start", padding: 10, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead>
              <tbody>{selectedRows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map((row, index) => <tr key={(row.reference || "transaction") + "-" + index}>{[row.date, money(row.amount, row.currency, language), row.status, row.channel, row.reference || "—"].map((value, i) => <td key={i} style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{value}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="page-subtitle" style={{ marginTop: 10 }}>{isAr ? "يتم استبعاد المعلّق والملغي من إجمالي المبيعات. الاستردادات تخصم من صافي المبيعات. تعرض الصفحة أول 100 معاملة فقط." : "Pending and cancelled rows are excluded from sales totals. Refunds reduce net sales. The table shows the first 100 transactions."}</p>
        </section>
      </>}
  </div>;
}
