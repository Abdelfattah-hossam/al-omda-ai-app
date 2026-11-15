export type ExcelSheet = { name: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string> };
export type ExcelWorkbookData = { title: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string>; sheets?: ExcelSheet[] };

const CELL_REF = /^([A-Z]{1,3})([1-9]\d{0,5})$/i;
const BLOCKED = /\b(?:WEBSERVICE|HYPERLINK|DDE|CALL|EXEC|REGISTER|RTD|INDIRECT)\s*\(/i;
function colIndex(letters: string): number {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
function validSheet(raw: unknown): raw is ExcelSheet {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 31 || /[\[\]:*?/\\]/.test(s.name)) return false;
  if (!Array.isArray(s.columns) || !Array.isArray(s.rows) || s.columns.length < 1 || s.columns.length > 30 || s.rows.length < 1 || s.rows.length > 500) return false;
  if (s.columns.some((v) => typeof v !== "string" || !v.trim() || v.length > 180)) return false;
  const columns = s.columns as string[];
  if (s.rows.some((row) => !Array.isArray(row) || row.length !== columns.length || row.some((v: unknown) => !["string","number","boolean"].includes(typeof v) || String(v).length > 2000))) return false;
  if (s.formulas !== undefined) {
    if (!s.formulas || typeof s.formulas !== "object" || Array.isArray(s.formulas)) return false;
    const entries = Object.entries(s.formulas as Record<string, unknown>);
    if (entries.length > 15000) return false;
    for (const [address, rawFormula] of entries) {
      const match = address.match(CELL_REF);
      if (!match || colIndex(match[1]) >= columns.length || Number(match[2]) > s.rows.length + 1) return false;
      if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 500 || BLOCKED.test(rawFormula)) return false;
      const formula = rawFormula.trim().replace(/^=/, "");
      if (!formula || !/^[A-Za-z0-9_.$,:;!<>=+\-*/()% "'&]+$/.test(formula)) return false;
      let depth = 0;
      for (const c of formula) { if (c === "(") depth++; if (c === ")") depth--; if (depth < 0) return false; }
      if (depth !== 0) return false;
    }
  }
  return true;
}
export function parseExcelWorkbook(text: string): ExcelWorkbookData | null {
  try {
    const source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 180) return null;
    let sheets: ExcelSheet[];
    if (Array.isArray(value.sheets)) {
      if (value.sheets.length < 1 || value.sheets.length > 12 || !value.sheets.every(validSheet)) return null;
      sheets = value.sheets.map((raw) => {
        const s = raw as ExcelSheet;
        return { name: s.name.trim(), columns: s.columns.map((v) => v.trim()), rows: s.rows.map((row) => row.map((cell) => cell as string | number | boolean)), ...(s.formulas ? { formulas: Object.fromEntries(Object.entries(s.formulas).map(([k,v]) => [k.toUpperCase(), v.trim().replace(/^=/, "")])) } : {}) };
      });
      if (new Set(sheets.map((s) => s.name.toLowerCase())).size !== sheets.length) return null;
    } else {
      const legacy = { name: "Sheet1", columns: value.columns, rows: value.rows, formulas: value.formulas };
      if (!validSheet(legacy)) return null;
      const s = legacy as unknown as ExcelSheet;
      sheets = [{ name: s.name, columns: s.columns.map((v) => v.trim()), rows: s.rows.map((row) => row.map((cell) => cell as string | number | boolean)), ...(s.formulas ? { formulas: Object.fromEntries(Object.entries(s.formulas).map(([k,v]) => [k.toUpperCase(), v.trim().replace(/^=/, "")])) } : {}) }];
    }
    const first = sheets[0];
    return { title: value.title.trim(), columns: first.columns, rows: first.rows, ...(first.formulas ? { formulas: first.formulas } : {}), sheets };
  } catch { return null; }
}
