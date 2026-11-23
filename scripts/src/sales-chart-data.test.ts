import test from 'node:test';
import assert from 'node:assert/strict';
const modulePath='../../artifacts/al-omda-ai/src/lib/sales-chart-data';
const {salesChartData}=await import(modulePath);
test('charts use actual daily statuses and net channel shares',()=>{
 const base={date:'2026-11-01',currency:'AED',reference:''};
 const result=salesChartData([{...base,amount:100,status:'paid',channel:'A'},{...base,amount:20,status:'refunded',channel:'A'},{...base,amount:20,status:'paid',channel:'B'},{...base,amount:999,status:'cancelled',channel:'C'}]);
 assert.equal(result.days[0].paid,120);assert.equal(result.days[0].refunded,20);assert.equal(result.days[0].paidCount,2);assert.equal(result.days[0].refundCount,1);
 assert.deepEqual(result.channels.map((c:{share:number})=>c.share),[80,20]);assert.equal(result.channels.length,2);
});
test('empty data is empty, negative channel net is not a negative percentage',()=>{
 assert.deepEqual(salesChartData([]),{days:[],channels:[]});
 const result=salesChartData([{date:'2026-11-01',currency:'AED',reference:'',amount:20,status:'refunded',channel:'A'}]);
 assert.equal(result.channels[0].net,-20);assert.equal(result.channels[0].share,0);
});
