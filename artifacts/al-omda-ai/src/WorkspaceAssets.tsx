import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {createPortal} from 'react-dom';
import {sandboxedHtmlPreview} from './lib/html-preview';
import { previewOfficeDocument, previewPowerPointSlideImages } from "./lib/office-preview";
import { downloadBlobAsFile } from "./lib/download-file";
import { Download, Eye, FileText, FolderOpen, LoaderCircle, RefreshCw, Trash2, Upload, X } from "lucide-react";

type Language = "ar" | "en";
type ProjectOption = { id: string; title: string };
type WorkspaceAsset = { path: string; name: string; createdAt: string | null; size: number | null; mimeType: string | null };

import { resolveWorkspaceUploadMime } from "./lib/asset-upload";

function fileSize(bytes: number | null, ar: boolean): string {
  if (bytes === null) return ar ? "الحجم غير متاح" : "Size unavailable";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function WorkspaceAssets({ language, projects }: { language: Language; projects: ProjectOption[] }) {
  const ar = language === "ar";
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [previewAsset, setPreviewAsset] = useState<WorkspaceAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewHtml,setPreviewHtml]=useState("");
  const [pendingDelete,setPendingDelete]=useState<WorkspaceAsset|null>(null);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const returnFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!pendingDelete)return;
    return()=>{const previous=returnFocus.current;if(previous?.isConnected)previous.focus();else document.getElementById('assets-project-select')?.focus();};
  },[pendingDelete]);
  const [previewSlides, setPreviewSlides] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const projectOptions = useMemo(() => projects.filter(project => project.id && project.title), [projects]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (projectId) params.set("projectId", projectId);
        const response = await fetch("/api/storage/assets" + (params.toString() ? "?" + params.toString() : ""), { credentials: "same-origin" });
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : (ar ? "تعذر تحميل الملفات." : "Could not load files."));
        if (!cancelled) setAssets(Array.isArray(data) ? data : []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل الملفات." : "Could not load files."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [projectId, refreshVersion, ar]);

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selected.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of selected) {
        if (file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error(ar ? "كل ملف يجب أن يكون أقل من 25 ميجابايت." : "Each file must be under 25 MB.");
        const mime = resolveWorkspaceUploadMime(file.name, file.type);
        if (!mime) throw new Error((ar ? "صيغة الملف غير مدعومة أو نوع الملف لا يطابق امتداده: " : "Unsupported file type or mismatched extension: ") + file.name);
        const params = new URLSearchParams({ filename: file.name });
        if (projectId) params.set("projectId", projectId);
        const response = await fetch("/api/storage/assets?" + params.toString(), {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": mime },
          body: file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : (ar ? "تعذر رفع الملف." : "Could not upload file."));
      }
      setRefreshVersion(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر رفع الملفات." : "Could not upload files."));
      setRefreshVersion(value => value + 1);
    } finally {
      setUploading(false);
    }
  };

  const downloadAsset = async (asset: WorkspaceAsset) => {
    setError("");
    try {
      const response = await fetch("/api/storage/assets/download?path=" + encodeURIComponent(asset.path), { credentials: "same-origin" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : (ar ? "تعذر تنزيل الملف." : "Could not download file."));
      }
      const blob = await response.blob();
      await downloadBlobAsFile(blob,asset.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تنزيل الملف." : "Could not download file."));
    }
  };

  const openPreview = async (asset: WorkspaceAsset) => {
    setPreviewAsset(asset);
    setPreviewUrl("");
    setPreviewText("");
    setPreviewHtml("");
    setPreviewSlides([]);
    setPreviewLoading(true);
    setError("");
    try {
      const response = await fetch("/api/storage/assets/download?path=" + encodeURIComponent(asset.path), { credentials: "same-origin" });
      if (!response.ok) throw new Error(ar ? "تعذر تحميل المعاينة." : "Could not load preview.");
      const blob = await response.blob();
      const mime = asset.mimeType ?? blob.type;
      const extension=asset.name.split('.').pop()?.toLowerCase();
      if(mime==='text/html'||extension==='html'||extension==='htm'){
        setPreviewHtml(sandboxedHtmlPreview(await blob.text()));
      } else if (mime.startsWith("image/") || mime.startsWith("video/") || mime === "application/pdf") {
        setPreviewUrl(URL.createObjectURL(blob));
      } else if (mime.startsWith("text/") || ["application/json","application/xml"].includes(mime)) {
        setPreviewText(await blob.text());
      } else if (asset.name.split(".").pop()?.toLowerCase() === "pptx") {
        try {
          setPreviewSlides(await previewPowerPointSlideImages(blob));
        } catch {
          // Visual slide rendering is best-effort; fall back to the text preview.
          setPreviewText(await previewOfficeDocument(blob, "pptx"));
        }
      } else if (["docx","xlsx"].includes(asset.name.split(".").pop()?.toLowerCase() ?? "")) {
        setPreviewText(await previewOfficeDocument(blob, asset.name.split(".").pop()!.toLowerCase()));
      } else {
        throw new Error(ar ? "المعاينة المباشرة لهذا النوع غير متاحة حاليًا؛ يمكنك تنزيل الملف وفتحه ببرنامجه." : "Inline preview is not available for this file type yet. Download it to open it in its native app.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل المعاينة." : "Could not load preview."));
      setPreviewAsset(null);
    } finally {
      setPreviewLoading(false);
    }
  };
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewText("");
    setPreviewHtml("");
    setPreviewSlides([]);
    setPreviewAsset(null);
  };

  const requestDelete=(asset:WorkspaceAsset)=>{
    returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setDeleteError('');setPendingDelete(asset);
  };
  const deleteAsset = async () => {
    const asset=pendingDelete;
    if(!asset||deleting)return;
    setDeleting(true);setDeleteError('');setError("");
    try {
      const response = await fetch("/api/storage/assets?path=" + encodeURIComponent(asset.path), { method: "DELETE", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : (ar ? "تعذر حذف الملف." : "Could not delete file."));
      setRefreshVersion(value => value + 1);
      if(previewAsset?.path===asset.path)closePreview();
      setPendingDelete(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : (ar ? "تعذر حذف الملف." : "Could not delete file."));
    } finally {setDeleting(false);}
  };

  return <>
  <div className="page-enter" id="assets-list">
    <div className="page-heading">
      <div><div className="eyebrow">{ar ? "مساحة العمل" : "WORKSPACE ASSETS"}</div><h1 className="page-title">{ar ? "الأصول والملفات" : "Assets & files"}</h1><p className="page-subtitle">{ar ? "ملفاتك الخاصة محفوظة بأمان ويمكن تنزيلها أو حذفها من هنا." : "Your private files are securely stored and can be downloaded or deleted here."}</p></div>
      <label className="button button-primary" style={{cursor:uploading?"wait":"pointer",opacity:uploading ? 0.65 : 1}}>
        {uploading ? <LoaderCircle size={14} className="animate-spin"/> : <Upload size={14}/>}
        {uploading ? (ar ? "جارٍ الرفع..." : "Uploading...") : (ar ? "رفع ملفات" : "Upload files")}
        <input type="file" multiple hidden disabled={uploading} accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.html,.xml,.zip,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm" onChange={uploadFiles}/>
      </label>
    </div>
    <section className="panel panel-pad">
      <div className="section-head">
        <div><h2 className="section-title">{ar ? "ملفات المشروع" : "Project files"}</h2><p className="page-subtitle" style={{marginTop:5}}>{ar ? "الملفات خاصة بحسابك ولا تُتاح للعامة." : "Files are private to your account and are not publicly accessible."}</p></div>
        <button type="button" className="icon-button" onClick={()=>setRefreshVersion(value=>value+1)} aria-label={ar?"تحديث الملفات":"Refresh files"}><RefreshCw size={15}/></button>
      </div>
      <div className="field-group" style={{maxWidth:440,marginBottom:16}}>
        <label className="form-label" htmlFor="assets-project-select">{ar ? "المشروع" : "Project"}</label>
        <select id="assets-project-select" className="field" value={projectId} onChange={event=>setProjectId(event.target.value)}>
          <option value="">{ar ? "ملفات عامة (بدون مشروع)" : "General files (no project)"}</option>
          {projectOptions.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
      </div>
      {error&&<div className="notice-bar notice-error" role="alert" style={{marginBottom:12}}>{error}</div>}
      {loading?<div className="plan-empty" style={{padding:28}}><LoaderCircle size={20} className="animate-spin"/><p>{ar?"جارٍ تحميل الملفات...":"Loading files..."}</p></div>
      :assets.length===0?<div className="plan-empty" style={{padding:28}}><span className="empty-mark"><FolderOpen size={21}/></span><h3>{ar?"لا توجد ملفات في هذا المكان":"No files here yet"}</h3><p>{ar?"ارفع مستنداتك أو جداولك أو عروضك أو صورك لتظهر هنا.":"Upload documents, spreadsheets, presentations, or images to see them here."}</p></div>
      :<div className="history-layout">{assets.map(asset=><article className="panel history-item" key={asset.path}>
        <span className="task-icon"><FileText size={17}/></span><span className="task-main"><strong>{asset.name}</strong><small>{fileSize(asset.size,ar)} · {asset.name.split(".").pop()?.toUpperCase() || (ar ? "ملف" : "File")}{asset.createdAt ? " · "+new Date(asset.createdAt).toLocaleDateString(ar?"ar":"en") : ""}</small></span>
        <div style={{display:"flex",gap:6}}>{(asset.mimeType?.startsWith("video/") || asset.mimeType?.startsWith("image/") || asset.mimeType==="application/pdf" || asset.mimeType?.startsWith("text/") || asset.mimeType==="application/json" || asset.mimeType==="application/xml" || ["docx","xlsx","pptx","html","htm"].includes(asset.name.split(".").pop()?.toLowerCase() ?? ""))&&<button type="button" className="icon-button" onClick={()=>void openPreview(asset)} aria-label={ar?"معاينة الملف":"Preview file"}><Eye size={14}/></button>}<button type="button" className="icon-button" onClick={()=>void downloadAsset(asset)} aria-label={ar?"تنزيل الملف":"Download file"}><Download size={14}/></button><button type="button" className="icon-button" onClick={()=>requestDelete(asset)} aria-label={ar?"حذف الملف":"Delete file"}><Trash2 size={14}/></button></div>
      </article>)}</div>}
    </section>
  </div>
    {previewAsset&&createPortal(<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closePreview();}} style={{position:"fixed",inset:0,zIndex:110,display:"grid",placeItems:"center",padding:16,background:"rgba(0,0,0,.72)",backdropFilter:"blur(5px)"}}>
      <section role="dialog" aria-modal="true" aria-label={ar?"معاينة الملف":"File preview"} className="panel" style={{width:"min(900px,100%)",maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",padding:14}}>
        <header className="section-head"><strong style={{minWidth:0,overflowWrap:'anywhere',flex:1}}>{previewAsset.name}</strong><div style={{display:"flex",gap:6}}><button type="button" className="icon-button" onClick={()=>void downloadAsset(previewAsset)} aria-label={ar?"تنزيل":"Download"}><Download size={14}/></button><button type="button" className="icon-button" onClick={closePreview} aria-label={ar?"إغلاق":"Close"}><X size={16}/></button></div></header>
        <div style={{minHeight:180,overflow:"auto",display:"grid",placeItems:"center",padding:8}}>
          {previewLoading?<LoaderCircle size={22} className="animate-spin"/>:previewHtml?<iframe title={previewAsset.name} srcDoc={previewHtml} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{width:'100%',height:'72vh',border:0,background:'#111'}}/>:previewSlides.length>0?<div style={{overflow:"auto",maxHeight:"72vh",display:"grid",gap:10}}>{previewSlides.map((src,i)=><img key={i} src={src} alt={(ar?"شريحة ":"Slide ")+(i+1)} style={{width:"100%",borderRadius:8,border:"1px solid var(--border,#343a44)"}}/>)}</div>:previewUrl&&previewAsset.mimeType?.startsWith("video/")?<video src={previewUrl} controls playsInline style={{width:"100%",maxHeight:"72vh"}}/>:previewUrl&&previewAsset.mimeType?.startsWith("image/")?<img src={previewUrl} alt={previewAsset.name} style={{maxWidth:"100%",maxHeight:"72vh",objectFit:"contain"}}/>:previewUrl?<iframe title={previewAsset.name} src={previewUrl} sandbox="" style={{width:"100%",height:"72vh",border:0,background:"#fff"}}/>:<pre dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",width:"100%",maxHeight:"72vh",overflow:"auto",fontSize:12}}>{previewText}</pre>}
        </div>
      </section>
    </div>,document.body)}
    {pendingDelete&&createPortal(<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!deleting)setPendingDelete(null);}} style={{position:'fixed',inset:0,zIndex:120,display:'grid',placeItems:'center',padding:16,background:'rgba(0,0,0,.68)',backdropFilter:'blur(5px)'}}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="asset-delete-title" aria-describedby="asset-delete-description" className="panel" dir={ar?'rtl':'ltr'} style={{width:'min(440px,100%)',padding:18}} onKeyDown={event=>{
        if(event.key==='Escape'&&!deleting){event.preventDefault();setPendingDelete(null);}
        if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!buttons.length){event.preventDefault();return;}const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
      }}>
        <h3 id="asset-delete-title" style={{margin:'0 0 8px'}}>{ar?'تأكيد حذف الملف':'Confirm file deletion'}</h3>
        <p id="asset-delete-description" style={{margin:'0 0 16px',lineHeight:1.8,color:'var(--text-secondary)'}}>{ar?'سيُحذف الملف التالي نهائيًا، ولا يمكن التراجع.':'This file will be permanently deleted. This cannot be undone.'}<br/><strong style={{overflowWrap:'anywhere'}}>{pendingDelete.name}</strong></p>
        {deleteError&&<p role="alert" className="notice-bar notice-error">{deleteError}</p>}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button autoFocus type="button" className="button" disabled={deleting} onClick={()=>setPendingDelete(null)}>{ar?'إلغاء':'Cancel'}</button>
          <button type="button" className="button button-danger" disabled={deleting} onClick={()=>void deleteAsset()}>{deleting?(ar?'جارٍ الحذف…':'Deleting…'):(ar?'تأكيد الحذف':'Confirm deletion')}</button>
        </div>
      </section>
    </div>,document.body)}
  </>;
}
