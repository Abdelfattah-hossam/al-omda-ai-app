import {useMemo} from 'react';
import {BarChart3,ShoppingBag,Receipt,Wallet,Users,ArrowUpRight} from 'lucide-react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid,BarChart,Bar,Legend} from 'recharts';
import {salesChartData} from './lib/sales-chart-data';
import type {SalesRow} from './lib/sales-csv';
import './sales-dashboard.css';
const colors=['#b47aff','#28c9af','#ffb74d','#f35789'];
export default function SalesDashboard({language,rows,currency,loading}:{language:'ar'|'en';rows:SalesRow[];currency:string;loading:boolean}){
 const ar=language==='ar';
 const data=useMemo(()=>salesChartData(rows),[rows]);
 const paid=rows.filter(r=>r.status==='paid');
 const refunded=rows.filter(r=>r.status==='refunded');
 const total=paid.reduce((n,r)=>n+r.amount,0),refund=refunded.reduce((n,r)=>n+r.amount,0);
 const money=(v:number)=>new Intl.NumberFormat(ar?'ar-AE':'en-AE',{style:'currency',currency:currency||'AED',maximumFractionDigits:2}).format(v);
 const empty=loading?(ar?'جارٍ قراءة المصدر…':'Reading source…'):(ar?'استورد معاملات حقيقية لعرض الرسم. لا توجد بيانات تجريبية.':'Import real transactions to populate this chart. No sample data.');
 const stats=[{label:ar?'إجمالي المبيعات':'Total sales',value:money(total),detail:ar?'المعاملات المدفوعة فقط':'Paid transactions only',icon:Wallet},{label:ar?'طلبات مدفوعة':'Paid orders',value:String(paid.length),detail:ar?'من الملف والعملة المحددين':'Selected file and currency',icon:ShoppingBag},{label:ar?'المبالغ المستردة':'Refunds',value:money(refund),detail:`${refunded.length} ${ar?'معاملة مستردة':'refund transactions'}`,icon:Receipt},{label:ar?'صافي المبيعات':'Net sales',value:money(total-refund),detail:ar?'المدفوع ناقص المسترد':'Paid minus refunded',icon:BarChart3}];
 return <div className="sales-reference-dashboard" data-testid="sales-reference-dashboard">
  <div className="sales-reference-top">
   <section className="sales-glass-card sales-summary"><div className="sales-card-head"><div><h2>{ar?'ملخص المبيعات':'Sales summary'}</h2><p>{ar?'الفترة المستوردة · ليست إحصاءات اليوم فقط':'Imported period · not today-only figures'}</p></div><span className="sales-source-badge">{rows.length?ar?'من ملفك':'Your file':ar?'بانتظار البيانات':'Awaiting data'}</span></div>
    <div className="sales-stat-grid">{stats.map((s,i)=><article className="sales-stat-tile" key={s.label}><span className={'sales-stat-badge badge-'+i}><s.icon size={17}/></span><strong>{rows.length?s.value:'—'}</strong><span>{s.label}</span><small>{rows.length?s.detail:ar?'لا تتوفر بيانات':'No data available'}</small></article>)}</div>
   </section>
   <section className="sales-glass-card sales-trends"><div className="sales-card-head"><div><h2>{ar?'حركة المبيعات':'Sales activity'}</h2><p>{ar?'القيم اليومية حسب الحالة':'Daily amounts by status'}</p></div><ArrowUpRight size={18}/></div>
    {data.days.length?<div className="sales-chart" dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.days} margin={{top:15,right:12,left:0,bottom:0}} accessibilityLayer><CartesianGrid stroke="#ffffff0d" vertical={false}/><XAxis dataKey="date" tick={{fill:'#bdb4ca',fontSize:9}} tickFormatter={v=>String(v).slice(5)} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#bdb4ca',fontSize:9}} width={45} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#25212f',border:'1px solid #675674',borderRadius:12,color:'#f3ecff'}} formatter={value=>money(Number(value))}/><Legend wrapperStyle={{fontSize:10,paddingTop:8}}/><Line type="monotone" dataKey="paid" name={ar?'مدفوعة':'Paid'} stroke="#21cb84" strokeWidth={2.5} dot={data.days.length<2} activeDot={{r:5,fill:'#fa4b70'}} isAnimationActive={false}/><Line type="monotone" dataKey="refunded" name={ar?'مستردة':'Refunded'} stroke="#b47aff" strokeWidth={2.5} dot={data.days.length<2} isAnimationActive={false}/><Line type="monotone" dataKey="pending" name={ar?'معلقة':'Pending'} stroke="#ffb74d" strokeWidth={2.5} dot={data.days.length<2} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>:<div className="sales-chart-empty"><BarChart3 size={30}/><p>{empty}</p></div>}
   </section>
  </div>
  <div className="sales-reference-bottom">
   <section className="sales-glass-card sales-ranked"><div className="sales-card-head"><div><h2>{ar?'أفضل القنوات':'Top channels'}</h2><p>{ar?'بديل قائمة المنتجات: لا توجد بيانات منتجات':'Channel ranking, product data is not available'}</p></div></div>
    {data.channels.length?<div className="sales-ranked-table"><div className="sales-ranked-row sales-ranked-header"><span>#</span><span>{ar?'القناة':'Name'}</span><span>{ar?'حصة الصافي الموجب':'Positive net share'}</span><span>{ar?'النسبة':'Share'}</span></div>{data.channels.slice(0,5).map((c,i)=><div className="sales-ranked-row" key={c.name}><span>{String(i+1).padStart(2,'0')}</span><strong title={c.name}>{c.name}</strong><span className="sales-rank-track"><i style={{width:c.share+'%',background:colors[i%colors.length]}}/></span><span className="sales-share-pill" style={{color:colors[i%colors.length],borderColor:colors[i%colors.length]+'70'}}>{c.share.toFixed(0)}%</span></div>)}</div>:<div className="sales-chart-empty"><ShoppingBag size={28}/><p>{empty}</p></div>}
    {data.channels.length>0&&<p className="sales-chart-note">{ar?'النسب من مجموع صافي القنوات الموجب فقط؛ القيم السالبة حصتها 0%.':'Shares use the sum of positive channel net sales. Negative net shares are 0%.'}</p>}
   </section>
   <section className="sales-glass-card sales-volume"><div className="sales-card-head"><div><h2>{ar?'حجم الطلبات والاستردادات':'Orders vs refunds'}</h2><p>{ar?'أعداد فعلية، وليست مستوى خدمة تقديريًا':'Actual counts, not an estimated service level'}</p></div></div>
    {data.days.length?<div className="sales-chart" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.days} margin={{top:12,left:0,right:8,bottom:0}} accessibilityLayer><XAxis dataKey="date" tick={{fill:'#bdb4ca',fontSize:9}} tickFormatter={v=>String(v).slice(5)} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} width={28} tick={{fill:'#bdb4ca',fontSize:9}} tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:'#25212f',border:'1px solid #675674',borderRadius:12}}/><Bar dataKey="paidCount" name={ar?'مدفوعة':'Paid'} fill="#159cff" radius={[4,4,0,0]} isAnimationActive={false}/><Bar dataKey="refundCount" name={ar?'مستردة':'Refunded'} fill="#ffad62" radius={[4,4,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<div className="sales-chart-empty"><Users size={28}/><p>{empty}</p></div>}
    <div className="sales-volume-legend"><span><i style={{background:'#159cff'}}/>{ar?'مدفوعة':'Paid'} <strong>{rows.length?paid.length:'—'}</strong></span><span><i style={{background:'#ffad62'}}/>{ar?'مستردة':'Refunded'} <strong>{rows.length?refunded.length:'—'}</strong></span></div>
   </section>
  </div>
 </div>;
}
