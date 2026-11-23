import {useMemo,useRef,useState,type PointerEvent} from 'react';
import {Minus,Plus,RotateCcw,Move} from 'lucide-react';
import {countries,countrySales} from './lib/country-sales';
import type {SalesRow} from './lib/sales-csv';
import './world-sales-map.css';
const COLORS=['#ffbf23','#9b59ff','#fa4b70','#21c5ae','#6c9dff','#f7984a'];
export default function WorldSalesMap({language,rows,currency}:{language:'ar'|'en';rows:SalesRow[];currency:string}){
 const ar=language==='ar';
 const {totals,unmapped}=useMemo(()=>countrySales(rows),[rows]);
 const [selected,setSelected]=useState('');
 const [hovered,setHovered]=useState('');
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const drag=useRef<{x:number;y:number;px:number;py:number;moved:boolean}|null>(null);
 const active=hovered||selected;
 const country=countries.find(c=>c.id===active);
 const value=totals.get(active);
 const sorted=useMemo(()=>[...countries].sort((a,b)=>(ar?a.ar:a.en).localeCompare(ar?b.ar:b.en,language)),[ar,language]);
 const colorIds=[...totals.keys()].sort();
 const money=(v:number)=>new Intl.NumberFormat(ar?'ar-AE':'en-AE',{style:'currency',currency:currency||'AED'}).format(v);
 const changeZoom=(v:number)=>{setZoom(Math.min(4,Math.max(1,v)));if(v<=1)setPan({x:0,y:0});};
 const move=(event:PointerEvent<SVGSVGElement>)=>{
  if(!drag.current||zoom===1)return;
  const dx=event.clientX-drag.current.x,dy=event.clientY-drag.current.y;
  if(Math.abs(dx)+Math.abs(dy)>5)drag.current.moved=true;
  const width=event.currentTarget.getBoundingClientRect().width;
  setPan({x:Math.max(-400,Math.min(400,drag.current.px+dx*1000/width)),y:Math.max(-200,Math.min(200,drag.current.py+dy*1000/width))});
 };
 return <section className="world-sales-map" data-testid="world-sales-map" aria-labelledby="world-map-title">
  <div className="world-map-heading"><div><span className="world-map-eyebrow">{ar?'الانتشار الجغرافي':'GEOGRAPHIC REACH'}</span><h2 id="world-map-title">{ar?'خريطة المبيعات حسب الدولة':'Sales Mapping by Country'}</h2></div><span className="world-map-status">{totals.size?`${totals.size} ${ar?'دولة ببيانات':'with data'}`:ar?'لا توجد بيانات جغرافية':'No geographic data'}</span></div>
  <div className="world-map-canvas">
   <svg viewBox="0 0 1000 500" role="group" aria-label={ar?'خريطة العالم التفاعلية':'Interactive world map'} onPointerDown={event=>{drag.current={x:event.clientX,y:event.clientY,px:pan.x,py:pan.y,moved:false};}} onPointerMove={move} onPointerUp={()=>{setTimeout(()=>{drag.current=null;},0);}} onPointerCancel={()=>{drag.current=null;}} style={{touchAction:zoom>1?'none':'pan-y'}}>
    <g transform={`translate(${500+pan.x} ${250+pan.y}) scale(${zoom}) translate(-500 -250)`}>
     {countries.map(c=><path key={c.id} d={c.d} data-country={c.id} className={active===c.id?'is-active':''} fill={totals.has(c.id)?COLORS[colorIds.indexOf(c.id)%COLORS.length]:'#17181e'} tabIndex={selected===c.id||(!selected&&c.id==='ARE')?0:-1} role="button" aria-label={(ar?c.ar:c.en)+' · '+(totals.has(c.id)?money(totals.get(c.id)!.net):ar?'لا توجد بيانات':'No data')} aria-pressed={selected===c.id} onPointerEnter={()=>{if(!drag.current)setHovered(c.id);}} onPointerLeave={()=>setHovered('')} onFocus={()=>setHovered(c.id)} onBlur={()=>setHovered('')} onClick={()=>{if(!drag.current?.moved){setSelected(c.id);setHovered('');}}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(c.id);}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=countries.indexOf(c);const next=countries[(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+countries.length)%countries.length];setSelected(next.id);event.currentTarget.parentElement?.querySelector<SVGPathElement>(`[data-country="${next.id}"]`)?.focus();}}}><title>{ar?c.ar:c.en}</title></path>)}
    </g>
   </svg>
   <div className="world-map-controls" dir="ltr"><button type="button" onClick={()=>changeZoom(zoom+.5)} disabled={zoom>=4} aria-label={ar?'تكبير الخريطة':'Zoom in'}><Plus size={16}/></button><button type="button" onClick={()=>changeZoom(zoom-.5)} disabled={zoom<=1} aria-label={ar?'تصغير الخريطة':'Zoom out'}><Minus size={16}/></button><button type="button" onClick={()=>{changeZoom(1);setSelected('');setHovered('');}} aria-label={ar?'إعادة ضبط الخريطة':'Reset map'}><RotateCcw size={15}/></button></div>
   <span className="world-map-hint"><Move size={12}/>{ar?'كبّر ثم اسحب للتحريك':'Zoom, then drag to pan'}</span>
  </div>
  <div className="world-map-inspector" aria-live="polite"><strong>{country?(ar?country.ar:country.en):ar?'استكشف دولة':'Explore a country'}</strong><span>{country?(value?`${money(value.net)} · ${value.paid} ${ar?'مدفوعة':'paid'} · ${value.refunds} ${ar?'مستردة':'refunded'}`:ar?'لا توجد معاملات مرتبطة بهذه الدولة.':'No transactions linked to this country.'):(ar?'المس دولة أو اخترها من القائمة لعرض بياناتها.':'Tap a country or choose one below to inspect its data.')}</span></div>
  <label className="world-map-picker"><span>{ar?'اختيار الدولة':'Choose country'}</span><select value={selected} onChange={event=>{setSelected(event.target.value);setHovered('');}}><option value="">{ar?'اختر دولة':'Select a country'}</option>{sorted.map(c=><option key={c.id} value={c.id}>{ar?c.ar:c.en}</option>)}</select></label>
  <div className="world-map-footer"><span><i className="world-map-dot"/>{ar?'المحدد':'Selected'}</span><span>{ar?'الدول الملوّنة فقط لها معاملات مستوردة؛ لا نستخدم العملة لتخمين الدولة.':'Only countries with imported transactions are colored. Currency never implies country.'}</span></div>
  {!totals.size&&<p className="world-map-note">{ar?'أضف عمود country اختياريًا إلى CSV برمز الدولة مثل AE أو اسمها. الخريطة تفاعلية الآن، ولا تعرض مبيعات افتراضية.':'Add an optional country column to your CSV using a code such as AE or a country name. The map is interactive now, without sample sales.'}</p>}
  {unmapped>0&&<p className="world-map-note">{unmapped} {ar?'معاملة مدفوعة أو مستردة بدون دولة معروفة، لم تُنسب إلى الخريطة.':'paid/refunded transactions have no recognized country and are not mapped.'}</p>}
  <a className="world-map-credit" href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · {ar?'حدود تقريبية للعرض':'Generalized boundaries'}</a>
 </section>;
}
