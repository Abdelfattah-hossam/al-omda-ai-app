import {useEffect,useState} from 'react';
import {Activity,ArrowUpLeft,RefreshCw} from 'lucide-react';
import {Link} from 'wouter';
export default function ProfileUsage({signedIn,isAr}:{signedIn:boolean;isAr:boolean}) {
 const [usage,setUsage]=useState<{remaining:number;limit:number;used:number}|null>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;setUsage(null);setStatus('loading');
  if(!signedIn)return()=>{active=false};
  void fetch('/api/ai/usage',{credentials:'same-origin'}).then(async r=>{
   const data=await r.json();
   if(!r.ok||![data.remaining,data.limit,data.used].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||data.limit<=0)throw new Error('usage unavailable');
   if(active){setUsage(data);setStatus('ready');}
  }).catch(()=>{if(active)setStatus('error')});
  return()=>{active=false};
 },[signedIn,revision]);
 return <section className="panel panel-pad profile-usage-card" id="profile-usage">
  <div className="profile-section-heading"><div><span className="eyebrow">{isAr?'الاستخدام والذاكرة':'USAGE & MEMORY'}</span><h2>{isAr?'رصيدك اليومي':'Daily allowance'}</h2><p>{isAr?'الوحدات المتاحة من خدمة الحساب، وليست رصيدًا ماليًا.':'Available account units, not a cash balance.'}</p></div><Activity size={20}/></div>
  <div className="profile-allowance" aria-live="polite"><strong>{usage?usage.remaining.toLocaleString():'—'}</strong><span>{usage?(isAr?`من ${usage.limit.toLocaleString()} وحدة اليوم`:`of ${usage.limit.toLocaleString()} units today`):!signedIn?(isAr?'سجّل الدخول لعرض الرصيد':'Sign in to see your allowance'):status==='error'?(isAr?'تعذر تحميل الرصيد':'Allowance unavailable'):(isAr?'جارٍ تحميل الرصيد…':'Loading allowance…')}</span></div>
  {usage&&<><div className="profile-usage-track" role="progressbar" aria-label={isAr?'الوحدات المتبقية':'Units remaining'} aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={Math.min(usage.remaining,usage.limit)}><i style={{width:Math.min(100,usage.remaining/usage.limit*100)+'%'}}/></div><p className="account-hint">{isAr?`المستخدم اليوم: ${usage.used.toLocaleString()} وحدة`:`Used today: ${usage.used.toLocaleString()} units`}</p></>}
  <div className="profile-actions-row"><Link href="/ai/usage" className="button button-quiet button-small">{isAr?'الاستخدام وإعدادات الذاكرة':'Usage & memory settings'}<ArrowUpLeft size={14}/></Link>{signedIn&&<button type="button" className="icon-button" aria-label={isAr?'تحديث الرصيد':'Refresh allowance'} disabled={status==='loading'} onClick={()=>setRevision(x=>x+1)}><RefreshCw size={15}/></button>}</div>
 </section>;
}
