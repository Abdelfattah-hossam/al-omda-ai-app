export type WordDocumentData = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };

export function parseWordDocument(text: string, forceSevenColumns: boolean, tableOnly: boolean, requireTable = false): { title: string; paragraphs: string[]; columns: string[]; rows: string[][] } | null {
  try {
    const source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    let value: any = null;
    try { value = JSON.parse(source); }
    catch {
      // Preserve a clean prose draft as a Word document if a provider ignores the JSON format.
      const plainText = source.replace(/^\x60\x60\x60(?:text|markdown)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "").trim();
      if (!requireTable && !tableOnly && !forceSevenColumns && plainText && !plainText.startsWith("{") && !plainText.includes("{") && plainText.length >= 40 && !/<(?:html|!doctype)/i.test(plainText)) {
        const plainParagraphs = plainText.split(/\n\s*\n/).map((part) => part.replace(/^#{1,6}\s*/, "").trim()).filter(Boolean);
        if (plainParagraphs.length) return { title: plainParagraphs[0].slice(0, 180), paragraphs: plainParagraphs, columns: [], rows: [] };
      }
      // Providers sometimes wrap JSON in a short explanation. Extract the first complete JSON object safely.
      const first = source.indexOf("{");
      if (first < 0) return null;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = first; index < source.length; index++) {
        const char = source[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          value = JSON.parse(source.slice(first, index + 1));
          break;
        }
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawTitle = value.title ?? value.name ?? value.documentTitle;
    const rawParagraphs = value.paragraphs ?? value.content ?? value.body ?? value.sections ?? value.text ?? [];
    const rawTable = value.table && typeof value.table === "object" ? value.table : value;
    const rawColumns = value.columns ?? value.headers ?? rawTable.headers ?? rawTable.columns ?? [];
    const rawRows = value.rows ?? rawTable.rows ?? [];
    const toText = (item: any): string => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item).trim();
      if (item && typeof item === "object") {
        const heading = typeof item.heading === "string" ? item.heading.trim() : typeof item.title === "string" ? item.title.trim() : "";
        const body = typeof item.content === "string" ? item.content.trim() : typeof item.text === "string" ? item.text.trim() : "";
        return [heading, body].filter(Boolean).join("\n\n");
      }
      return "";
    };
    if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) return null;
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, 180) : "مستند جديد";
    let paragraphs: string[] = [];
    if (typeof rawParagraphs === "string") paragraphs = rawParagraphs.split(/\n\s*\n/).map((part: string) => part.trim()).filter(Boolean);
    else if (Array.isArray(rawParagraphs)) paragraphs = rawParagraphs.map(toText).filter(Boolean);
    else return null;
    // Preserve long documents instead of rejecting them for having many small sections.
    if (paragraphs.length > 12) {
      const grouped: string[] = [];
      for (let index = 0; index < paragraphs.length; index += Math.ceil(paragraphs.length / 12)) grouped.push(paragraphs.slice(index, index + Math.ceil(paragraphs.length / 12)).join("\n\n"));
      paragraphs = grouped;
    }
    if (paragraphs.some((item) => item.length > 8000)) return null;
    const columns = rawColumns.map(toText);
    if (columns.some((item: string) => !item || item.length > 180)) return null;
    if (columns.length > 12 || rawRows.length > 100) return null;
    if (forceSevenColumns && columns.length !== 7) return null;
    if (requireTable && columns.length === 0) return null;
    if (!requireTable && columns.length > 0) return null;
    if (tableOnly && columns.length === 0) return null;
    if (columns.length === 0 && (rawRows.length > 0 || paragraphs.length === 0)) return null;
    const rows = columns.length ? rawRows.map((row: any) => {
      if (Array.isArray(row)) return row.map((cell: any) => toText(cell));
      if (row && typeof row === "object") return columns.map((column: string, index: number) => toText(row[column] ?? Object.values(row)[index]));
      return [];
    }) : [];
    if (rows.some((row: string[]) => row.length !== columns.length || row.some((cell) => cell.length > 2000))) return null;
    const finalRows = tableOnly ? Array.from({ length: 8 }, () => columns.map(() => "")) : rows;
    if (columns.length > 0 && finalRows.length === 0 && !tableOnly) return null;
    if (JSON.stringify({ title, paragraphs, columns, rows: finalRows }).length > 70000) return null;
    return { title, paragraphs: tableOnly ? [] : paragraphs, columns, rows: finalRows };
  } catch { return null; }
}
