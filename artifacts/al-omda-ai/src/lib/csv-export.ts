// A real UTF-8 BOM and CRLF rows, not their escaped spellings.
export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
 return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
