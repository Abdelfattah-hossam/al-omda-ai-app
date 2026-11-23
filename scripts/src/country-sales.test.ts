import test from 'node:test';
import assert from 'node:assert/strict';
const countryModule='../../artifacts/al-omda-ai/src/lib/country-sales';
const {countries,resolveCountry,countrySales}=await import(countryModule);
const salesModule='../../artifacts/al-omda-ai/src/lib/sales-csv';
const {parseSalesCsv}=await import(salesModule);
test('bundled country geometry is unique, localized and finite',()=>{
 assert.equal(countries.length,176);assert.equal(new Set(countries.map((c:{id:string})=>c.id)).size,176);
 for(const c of countries){assert.ok(c.en&&c.ar&&c.d.startsWith('M'));assert.doesNotMatch(c.d,/NaN|Infinity/);}
 assert.equal(resolveCountry('AE')?.id,'ARE');assert.equal(resolveCountry('United Arab Emirates')?.id,'ARE');assert.equal(resolveCountry('الإمارات العربية المتحدة')?.id,'ARE');
});
test('country is optional and no currency based inference happens',()=>{
 const old=parseSalesCsv('date,amount,currency,status\n2026-11-01,10,AED,paid');
 assert.equal(old.errors.length,0);assert.equal(old.rows[0].country,undefined);assert.equal(countrySales(old.rows).totals.size,0);assert.equal(countrySales(old.rows).unmapped,1);
});
test('only imported paid and refunded rows map, unknown countries stay unassigned',()=>{
 const parsed=parseSalesCsv('date,amount,currency,status,country\n2026-11-01,100,AED,paid,AE\n2026-11-02,20,AED,refunded,ARE\n2026-11-03,50,AED,pending,AE\n2026-11-04,10,AED,paid,unknown');
 assert.equal(parsed.errors.length,0);const {totals,unmapped}=countrySales(parsed.rows);
 assert.deepEqual(totals.get('ARE'),{net:80,paid:1,refunds:1});assert.equal(totals.size,1);assert.equal(unmapped,1);
});
