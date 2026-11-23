import type {SalesRow} from './sales-csv';
export function salesChartData(rows:SalesRow[]){
 const days=new Map<string,{date:string;paid:number;refunded:number;pending:number;paidCount:number;refundCount:number}>();
 const channels=new Map<string,{name:string;net:number;count:number}>();
 for(const row of rows){
  const day=days.get(row.date)??{date:row.date,paid:0,refunded:0,pending:0,paidCount:0,refundCount:0};
  if(row.status==='paid'){day.paid+=row.amount;day.paidCount++;}
  if(row.status==='refunded'){day.refunded+=row.amount;day.refundCount++;}
  if(row.status==='pending')day.pending+=row.amount;
  days.set(row.date,day);
  if(row.status==='paid'||row.status==='refunded'){
   const channel=channels.get(row.channel)??{name:row.channel,net:0,count:0};
   channel.net+=row.status==='paid'?row.amount:-row.amount;channel.count++;channels.set(row.channel,channel);
  }
 }
 const ranked=[...channels.values()].sort((a,b)=>b.net-a.net);
 const positive=ranked.reduce((n,c)=>n+Math.max(0,c.net),0);
 return {days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),channels:ranked.map(c=>({...c,share:positive?Math.max(0,c.net)/positive*100:0}))};
}
