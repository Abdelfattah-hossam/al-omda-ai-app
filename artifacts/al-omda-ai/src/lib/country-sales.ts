import countries from './world-countries.json';
import type {SalesRow} from './sales-csv';
export {countries};
export function resolveCountry(value:string) {
 const key=value.trim().toLocaleLowerCase();
 return key ? countries.find(c=>[c.id,c.iso2,c.en,c.ar].some(n=>n.toLocaleLowerCase()===key)) : undefined;
}
export function countrySales(rows:SalesRow[]) {
 const totals=new Map<string,{net:number;paid:number;refunds:number}>();
 let unmapped=0;
 for(const row of rows){
  if(row.status!=='paid'&&row.status!=='refunded')continue;
  const country=resolveCountry(row.country??'');
  if(!country){unmapped++;continue;}
  const total=totals.get(country.id)??{net:0,paid:0,refunds:0};
  if(row.status==='paid'){total.net+=row.amount;total.paid++;}else{total.net-=row.amount;total.refunds++;}
  totals.set(country.id,total);
 }
 return {totals,unmapped};
}
