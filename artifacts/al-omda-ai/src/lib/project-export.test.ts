import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectExport,projectExportHtml,projectExportText} from './project-export';
const p={title:'العربية English',request:'طلب اختبار',steps:[{text:'المرحلة الأولى',result:'الأسئلة: 30\n<script>alert(1)</script>\n{"key":"القيمة"}'}]};
test('UTF-8 MD/TXT retain logical Arabic; TXT includes encoding BOM',async()=>{
 const expected=projectExportText(p);
 assert.equal(await (await createProjectExport(p,'md')).text(),expected);
 const bytes=new Uint8Array(await(await createProjectExport(p,'txt')).arrayBuffer());
 assert.deepEqual(Array.from(bytes.slice(0,3)),[239,187,191]);
 assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(bytes),expected);
});
test('HTML escapes all project markup with explicit charset and paragraph direction',()=>{
 const html=projectExportHtml(p);assert.ok(html.includes('dir="auto"'));assert.ok(html.includes('charset="utf-8"'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes("default-src 'none'"));
});
test('Word export is a real OOXML ZIP',async()=>{
 const bytes=new Uint8Array(await(await createProjectExport(p,'docx')).arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(0,2)),'PK');
});
