export type SalesStatus = "paid" | "refunded" | "pending" | "cancelled";
export type SalesRow = {
  date: string;
  amount: number;
  currency: string;
  status: SalesStatus;
  channel: string;
  reference: string;
};
export type SalesCsvParseResult = {
  rows: SalesRow[];
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
};

function parseCsvCells(input: string): { rows: string[][]; malformed: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let malformed = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) malformed = true;
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return { rows, malformed };
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function validIsoDate(value: string): string | null {
  const candidate = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?$)/.exec(candidate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  if (!Number.isFinite(new Date(candidate).getTime())) return null;
  return candidate.slice(0, 10);
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction_date", "created_at", "order_date"],
  amount: ["amount", "total", "gross_amount", "revenue"],
  currency: ["currency", "currency_code"],
  status: ["status", "payment_status", "state"],
  channel: ["channel", "source", "sales_channel", "platform"],
  reference: ["reference", "transaction_id", "order_id", "id"],
};

function findColumn(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  return headers.findIndex((header) => HEADER_ALIASES[key].includes(header));
}

const SUPPORTED_CURRENCIES = new Set(((Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("currency") ?? []));
function isSupportedCurrency(value: string): boolean {
  if (SUPPORTED_CURRENCIES.size) return SUPPORTED_CURRENCIES.has(value);
  try { new Intl.NumberFormat("en", { style: "currency", currency: value }); return true; }
  catch { return false; }
}

function normalizeStatus(value: string): SalesStatus | null {
  const status = value.trim().toLowerCase();
  if (["paid", "succeeded", "completed", "success", "settled"].includes(status)) return "paid";
  if (["refunded", "refund"].includes(status)) return "refunded";
  if (["pending", "processing", "unpaid"].includes(status)) return "pending";
  if (["cancelled", "canceled", "void"].includes(status)) return "cancelled";
  return null;
}

export function parseSalesCsv(input: string, maxRows = 10000): SalesCsvParseResult {
  if (input.length > 2 * 1024 * 1024) return { rows: [], errors: [{ row: 0, message: "CSV exceeds the 2 MB import limit." }], totalRows: 0 };
  const parsed = parseCsvCells(input);
  if (parsed.malformed) return { rows: [], errors: [{ row: 0, message: "CSV contains an unclosed quoted field." }], totalRows: 0 };
  if (parsed.rows.length < 2) return { rows: [], errors: [{ row: 0, message: "CSV must contain a header and at least one transaction row." }], totalRows: 0 };
  const headers = parsed.rows[0].map(normalizeHeader);
  const columns = {
    date: findColumn(headers, "date"),
    amount: findColumn(headers, "amount"),
    currency: findColumn(headers, "currency"),
    status: findColumn(headers, "status"),
    channel: findColumn(headers, "channel"),
    reference: findColumn(headers, "reference"),
  };
  const missing = (["date", "amount", "currency", "status"] as const).filter((key) => columns[key] < 0);
  if (missing.length) return { rows: [], errors: [{ row: 1, message: "Missing required columns: " + missing.join(", ") }], totalRows: parsed.rows.length - 1 };
  const dataRows = parsed.rows.slice(1);
  if (dataRows.length > maxRows) return { rows: [], errors: [{ row: 0, message: "CSV exceeds the " + maxRows + " transaction row limit." }], totalRows: dataRows.length };
  const rows: SalesRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== headers.length) {
      errors.push({ row: rowNumber, message: "Column count does not match the header." });
      return;
    }
    const date = validIsoDate(cells[columns.date] ?? "");
    const amountText = (cells[columns.amount] ?? "").trim();
    const amount = Number(amountText);
    const currency = (cells[columns.currency] ?? "").trim().toUpperCase();
    const status = normalizeStatus(cells[columns.status] ?? "");
    const channel = columns.channel >= 0 ? (cells[columns.channel] ?? "").trim().slice(0, 80) || "Unspecified" : "Unspecified";
    const reference = columns.reference >= 0 ? (cells[columns.reference] ?? "").trim().slice(0, 120) : "";
    const problems: string[] = [];
    if (!date) problems.push("date must be a real ISO date");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) problems.push("amount must be a positive number with up to 2 decimals");
    if (!/^[A-Z]{3}$/.test(currency) || !isSupportedCurrency(currency)) problems.push("currency must be a supported 3-letter ISO code");
    if (!status) problems.push("status must be paid, refunded, pending, or cancelled");
    if (problems.length) {
      errors.push({ row: rowNumber, message: problems.join("; ") });
      return;
    }
    rows.push({ date: date!, amount, currency, status: status!, channel, reference });
  });
  return { rows, errors, totalRows: dataRows.length };
}

/**
 * Matches workspace asset names that hold sales CSVs. The storage upload
 * route prefixes every object name with a UUID ("<uuid>-sales-x.csv"), so the
 * original "sales-" prefix survives only after the first hyphen.
 */
export function isSalesCsvAssetName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".csv") && (lower.startsWith("sales-") || lower.includes("-sales-"));
}
