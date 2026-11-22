type CfbApi = {
  read: (bytes: Uint8Array, options: { type: string }) => unknown;
  find: (archive: unknown, path: string) => { content: Uint8Array } | null;
  utils: { cfb_add: (archive: unknown, path: string, bytes: Uint8Array) => unknown };
  write: (archive: unknown, options: { fileType: string; type: string }) => ArrayLike<number>;
};

/** SheetJS 0.18.5 silently omits Workbook.CalcPr when writing XLSX. */
export function ensureWorkbookRecalculation(bytes: ArrayBuffer | Uint8Array, cfb: CfbApi): Uint8Array {
  const archive = cfb.read(new Uint8Array(bytes), { type: 'array' });
  const workbook = cfb.find(archive, '/xl/workbook.xml');
  if (!workbook) throw new Error('Excel workbook metadata is missing.');
  const xml = new TextDecoder().decode(workbook.content);
  if (!xml.includes('</workbook>')) throw new Error('Excel workbook metadata is invalid.');
  const withoutOldSettings = xml.replace(/<calcPr\b[^>]*\/>/g, '').replace(/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/g, '');
  const updated = withoutOldSettings.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
  cfb.utils.cfb_add(archive, '/xl/workbook.xml', new TextEncoder().encode(updated));
  return new Uint8Array(cfb.write(archive, { fileType: 'zip', type: 'array' }));
}
