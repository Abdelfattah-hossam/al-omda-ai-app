import {createDocxBlob} from './office-ooxml';
export type ProjectExportFormat='pdf'|'docx'|'txt'|'md'|'html';
export type ProjectExport={title:string;request:string;steps:Array<{text:string;result?:string}>};
export function projectExportText(project:ProjectExport):string {
 return ['# '+project.title,'',project.request,'',...project.steps.flatMap((step,index)=>['## المرحلة / Stage '+(index+1)+': '+step.text,'',step.result??'',''])].join('\n');
}
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function projectExportHtml(project:ProjectExport):string {
 const section=(text:string)=>text.split('\n').map(line=>'<div dir="auto">'+(escape(line)||'<br>')+'</div>').join('');
 return '<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escape(project.title)+'</title><style>body{font-family:Arial,Tahoma,sans-serif;max-width:850px;margin:32px auto;padding:0 20px;color:#20232b;line-height:1.9;overflow-wrap:anywhere}div{white-space:pre-wrap;unicode-bidi:plaintext}h1,h2{line-height:1.6}section{border-top:1px solid #ddd;margin-top:24px;padding-top:12px}@media print{body{margin:0}}</style></head><body><h1 dir="auto">'+escape(project.title)+'</h1>'+section(project.request)+project.steps.map((step,index)=>'<section><h2 dir="auto">'+(index+1)+'. '+escape(step.text)+'</h2>'+section(step.result??'')+'</section>').join('')+'</body></html>';
}
export async function createProjectExport(project:ProjectExport,format:ProjectExportFormat):Promise<Blob>{
 const text=projectExportText(project);
 if(format==='pdf'){
  const {createDocumentPdfBlob}=await import('./table-pdf');
  return createDocumentPdfBlob([{type:'title',text:project.title},{type:'paragraph',text:project.request},...project.steps.flatMap((step,index)=>[{type:'title' as const,text:(index+1)+'. '+step.text},...String(step.result??'').split('\n').flatMap(text=>text.match(/.{1,500}(?:\s|$)|.{1,500}/gu)??['']).map(text=>({type:'paragraph' as const,text}))])]);
 }
 if(format==='docx')return createDocxBlob({title:project.title,paragraphs:[project.request,'',...project.steps.flatMap((step,index)=>[(index+1)+'. '+step.text,'',...String(step.result??'').split('\n').map(line=>line.replace(/^#{1,6}\s+/,'')),''])],columns:[],rows:[]},true);
 if(format==='html')return new Blob([projectExportHtml(project)],{type:'text/html;charset=utf-8'});
 return new Blob([format==='txt'?'\uFEFF':'',text],{type:(format==='md'?'text/markdown':'text/plain')+';charset=utf-8'});
}
