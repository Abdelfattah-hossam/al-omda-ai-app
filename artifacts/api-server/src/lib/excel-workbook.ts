export const EXCEL_DATA_INTEGRITY_RULES = [
  "DATA PROVENANCE IS MANDATORY: Populate business records only from facts explicitly supplied by the customer or verified in approved earlier task outputs.",
  "NEVER invent or guess customer names, company names, contact details, products, SKUs, prices, quantities, suppliers, dates, addresses, inventory, sales, or financial figures.",
  "A schema example is not customer data. Never copy example names, products, prices, or records from instructions into the workbook.",
  "If the customer requests a populated business workbook but has not supplied the required records, create the requested headers and leave every unknown data cell blank. Add a clearly named Required data / البيانات المطلوبة area listing the missing inputs; do not fabricate sample rows.",
  "Use sample data only when the customer explicitly asks for sample/demo data. Clearly label every affected sheet and sample record as SAMPLE / بيانات تجريبية.",
  "For a blank template, keep all data cells blank. Formulas may be included only when they are requested or necessary for the requested calculations; never fabricate input values.",
].join(" ");

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
  // Short rows are repaired below by padding with blank cells; rows longer
  // than the column count would silently drop data, so they stay invalid.
  if (s.rows.some((row) => !Array.isArray(row) || row.length > columns.length || row.some((v: unknown) => !["string","number","boolean"].includes(typeof v) || String(v).length > 2000))) return false;
  if (s.formulas !== undefined) {
    if (!s.formulas || typeof s.formulas !== "object" || Array.isArray(s.formulas)) return false;
    const entries = Object.entries(s.formulas as Record<string, unknown>);
    if (entries.length > 15000) return false;
    const normalizedAddresses = new Set<string>();
    for (const [address, rawFormula] of entries) {
      const normalizedAddress = address.toUpperCase();
      if (normalizedAddresses.has(normalizedAddress)) return false;
      normalizedAddresses.add(normalizedAddress);
      const match = address.match(CELL_REF);
      if (!match || colIndex(match[1]) >= columns.length || Number(match[2]) > s.rows.length + 1) return false;
      if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 500 || BLOCKED.test(rawFormula)) return false;
      const formula = rawFormula.trim().replace(/^=/, "");
      // Allow Unicode letters/numbers so formulas can reference sheets with
      // non-ASCII (e.g. Arabic) names; the BLOCKED check above still rejects
      // dangerous functions.
      if (!formula || !/^[\p{L}\p{N}_.$,:;!<>=+\-*/()% "'&]+$/u.test(formula)) return false;
      let depth = 0;
      for (const c of formula) { if (c === "(") depth++; if (c === ")") depth--; if (depth < 0) return false; }
      if (depth !== 0) return false;
    }
  }
  return true;
}
export function parseExcelWorkbook(text: string): ExcelWorkbookData | null {
  if (typeof text !== "string" || text.length > 1_000_000) return null;
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
        return { name: s.name.trim(), columns: s.columns.map((v) => v.trim()), rows: s.rows.map((row) => { const cells = row.map((cell) => cell as string | number | boolean); while (cells.length < s.columns.length) cells.push(""); return cells; }), ...(s.formulas ? { formulas: Object.fromEntries(Object.entries(s.formulas).map(([k,v]) => [k.toUpperCase(), v.trim().replace(/^=/, "")])) } : {}) };
      });
      if (new Set(sheets.map((s) => s.name.toLowerCase())).size !== sheets.length) return null;
    } else {
      const legacy = { name: "Sheet1", columns: value.columns, rows: value.rows, formulas: value.formulas };
      if (!validSheet(legacy)) return null;
      const s = legacy as unknown as ExcelSheet;
      sheets = [{ name: s.name, columns: s.columns.map((v) => v.trim()), rows: s.rows.map((row) => { const cells = row.map((cell) => cell as string | number | boolean); while (cells.length < s.columns.length) cells.push(""); return cells; }), ...(s.formulas ? { formulas: Object.fromEntries(Object.entries(s.formulas).map(([k,v]) => [k.toUpperCase(), v.trim().replace(/^=/, "")])) } : {}) }];
    }
    const first = sheets[0];
    return { title: value.title.trim(), columns: first.columns, rows: first.rows, ...(first.formulas ? { formulas: first.formulas } : {}), sheets };
  } catch { return null; }
}
