import {useEffect,useState} from 'react';
type Stats={registered:number;total:number;online:number;offline:number;asOf:string;trackingStartedAt:string};
export default function AdminPresence({language}:{language:'ar'|'en'}){
 const ar=language==='ar';const [stats,setStats]=useState<Stats|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{
  let stopped=false,busy=false;
  const load=async()=>{
   if(stopped||busy||document.visibilityState!=='visible')return;
   busy=true;setLoading(true);
   try{const r=await fetch('/api/admin/presence',{credentials:'same-origin'});if(!r.ok)throw new Error();const d=await r.json() as Stats;if(!stopped){setStats(d);setError(false);}}catch{if(!stopped)setError(true);}finally{busy=false;if(!stopped)setLoading(false);}
  };
  void load();const timer=window.setInterval(()=>void load(),60000);const resume=()=>void load();document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
 },[]);
 const format=(n:number)=>n.toLocaleString(ar?'ar-EG':'en-US');
 return <section aria-labelledby="admin-presence-title" data-testid="admin-presence" style={{display:'grid',gap:12,minWidth:0}}>
  <h2 id="admin-presence-title" style={{margin:0}}>{ar?'نشاط مستخدمي التطبيق':'App user activity'}</h2>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,160px),1fr))',gap:10}}>
   {([['registered',ar?'إجمالي الحسابات المسجّلة':'Total registered accounts'],['online',ar?'متصلون الآن':'Online now'],['offline',ar?'غير متصلين':'Offline'],['total',ar?'إجمالي من فتحوا التطبيق':'Total who opened the app']] as const).map(([key,label])=><div className="panel" key={key} style={{padding:14,minWidth:0}}><strong style={{display:'block',fontSize:28}}>{stats&&typeof stats[key]==='number'?format(stats[key]):'—'}</strong><span>{label}</span></div>)}
  </div>
  <p style={{margin:0}}>{ar?'المتصل: حساب مسجّل أرسل نشاطًا والتطبيق ظاهر خلال آخر دقيقتين. يُحسب الحساب مرة واحدة مهما تعددت أجهزته. الأرقام تتحدث كل دقيقة.':'Online means a signed-in account with a visible app heartbeat in the last two minutes. Each account counts once across devices. Refreshes every minute.'}</p>
  <p style={{margin:0,fontSize:12}}>{ar?'إجمالي الحسابات المسجّلة يشمل كل الحسابات الموجودة حاليًا، حتى لو لم تفتح التطبيق منذ بدء القياس. أما المتصلون وغير المتصلين وإجمالي من فتحوا التطبيق فتشمل الحسابات التي فتحت التطبيق منذ بدء القياس فقط، ولا تشمل الزوار بدون تسجيل أو فتحات سابقة لم تُسجّل.':'Registered accounts includes all current accounts, even those that have not opened the app since tracking began. Online, offline and total opened cover only accounts with a measured app open since tracking began, not anonymous visitors or unrecorded historical opens.'}{stats&&<> {ar?'بدء القياس: ':'Tracking began: '}{new Date(stats.trackingStartedAt).toLocaleString(ar?'ar-EG':'en-US')}. {ar?'آخر تحديث: ':'Last updated: '}{new Date(stats.asOf).toLocaleTimeString(ar?'ar-EG':'en-US')}.</>}</p>
  {error&&<p role="alert">{ar?'تعذر تحديث الأعداد. قد تكون الأرقام المعروضة قديمة، ستتم إعادة المحاولة تلقائيًا.':'Could not refresh counts. Displayed counts may be stale. Retrying automatically.'}</p>}
  {!stats&&!error&&loading&&<p role="status">{ar?'جارٍ تحميل الأعداد…':'Loading counts…'}</p>}
 </section>;
}
