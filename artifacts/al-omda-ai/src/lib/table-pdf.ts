// View-safe PDF export for documents with tables.
//
// The iOS Files / Quick Look viewer ignores every Word table-width setting
// and shrinks tables to their text (verified on a real iPhone with five width
// techniques). A PDF renders identically everywhere, so this module draws the
// document on canvas pages (browser text shaping handles Arabic and mixed
// numbers correctly) and packs the pages into a standards-compliant PDF.
// No third-party library and no network access.

export type PdfBlock =
  | { type: "title"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][] };

export type JpegPage = { jpeg: Uint8Array; width: number; height: number };

const PAGE_W = 595;
const PAGE_H = 842;

/** Assembles JPEG page images into a PDF (one full-page image per page). Pure and unit-tested. */
export function assemblePdfFromJpegPages(pages: JpegPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("A PDF needs at least one page.");
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const beginObject = (id: number) => { offsets[id] = length; push(id + " 0 obj\n"); };
  // Object ids: 1 catalog, 2 pages, then per page i: 3+3i page, 4+3i content, 5+3i image.
  push("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  push("<< /Type /Pages /Count " + pages.length + " /Kids [" + pages.map((_, index) => (3 + index * 3) + " 0 R").join(" ") + "] >>\nendobj\n");
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    beginObject(pageId);
    push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] /Resources << /XObject << /Im0 " + imageId + " 0 R >> >> /Contents " + contentId + " 0 R >>\nendobj\n");
    const content = "q " + PAGE_W + " 0 0 " + PAGE_H + " 0 0 cm /Im0 Do Q";
    beginObject(contentId);
    push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n");
    beginObject(imageId);
    push("<< /Type /XObject /Subtype /Image /Width " + page.width + " /Height " + page.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + page.jpeg.length + " >>\nstream\n");
    push(page.jpeg);
    push("\nendstream\nendobj\n");
  });
  const objectCount = 2 + pages.length * 3;
  const xrefStart = length;
  let xref = "xref\n0 " + (objectCount + 1) + "\n0000000000 65535 f \n";
  for (let id = 1; id <= objectCount; id += 1) xref += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  push(xref + "trailer\n<< /Size " + (objectCount + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF\n");
  const out = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of parts) { out.set(chunk, cursor); cursor += chunk.length; }
  return out;
}

// Design constants (gold on dark header, warm zebra rows). One place to change the look.
export const PDF_THEME = {
  text: "#2B2417",
  muted: "#8A6D2B",
  headBg: "#1A1712",
  headText: "#E3C16F",
  zebra: "#FBF6E7",
  frame: "#C9A24B",
  inner: "#E7DDBF",
  rule: "#C9A24B",
};

const SCALE = 2.5;
const MARGIN = 40;
const FONT = "Arial, 'Noto Sans Arabic', 'Geeza Pro', sans-serif";
const PAD_X = 9;
const PAD_Y = 8;
const BODY_SIZE = 11;
const LINE_H = 17;

type Ctx = CanvasRenderingContext2D;

function hasArabic(text: string): boolean {
  return /[\u0590-\u08ff]/.test(text);
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        if (!current && ctx.measureText(word).width > maxWidth) {
          // A single word wider than the cell: break it by characters.
          let chunk = "";
          for (const char of Array.from(word)) {
            if (ctx.measureText(chunk + char).width > maxWidth && chunk) { lines.push(chunk); chunk = char; } else chunk += char;
          }
          current = chunk;
        } else current = candidate;
      } else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines;
}

/** Column widths that fill the table width: content-proportional, never below the longest word. */
export function computeColumnWidths(natural: number[], minimum: number[], total: number): number[] {
  const sumNatural = natural.reduce((a, b) => a + b, 0);
  if (sumNatural <= total) return natural.map((width) => (width / sumNatural) * total);
  const sumMin = minimum.reduce((a, b) => a + b, 0);
  if (sumMin >= total) return minimum.map((width) => (width / sumMin) * total);
  const spare = total - sumMin;
  const extra = natural.map((width, index) => Math.max(0, width - minimum[index]));
  const sumExtra = extra.reduce((a, b) => a + b, 0) || 1;
  return minimum.map((width, index) => width + (extra[index] / sumExtra) * spare);
}

/** Renders blocks to a PDF blob. Browser only (needs canvas). */
export async function createDocumentPdfBlob(blocks: PdfBlock[], rtlOverride?: boolean): Promise<Blob> {
  const rtl = rtlOverride ?? hasArabic(blocks.map((block) => block.type === "table" ? block.rows.flat().join(" ") : block.text).join(" "));
  const canvases: HTMLCanvasElement[] = [];
  let canvas!: HTMLCanvasElement;
  let ctx!: Ctx;
  let y = MARGIN;
  const contentW = PAGE_W - MARGIN * 2;
  const newPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * SCALE);
    canvas.height = Math.round(PAGE_H * SCALE);
    ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "middle";
    ctx.direction = rtl ? "rtl" : "ltr";
    canvases.push(canvas);
    y = MARGIN;
  };
  const setFont = (size: number, bold = false) => { ctx.font = (bold ? "bold " : "") + size + "px " + FONT; };
  const drawLines = (lines: string[], x: number, startY: number, align: CanvasTextAlign, lineHeight: number) => {
    ctx.textAlign = align;
    lines.forEach((line, index) => ctx.fillText(line, x, startY + lineHeight * index + lineHeight / 2));
  };
  const textX = (left: number, width: number, pad = 0) => rtl ? left + width - pad : left + pad;
  const align: CanvasTextAlign = rtl ? "right" : "left";

  newPage();

  const drawTable = (rows: string[][]) => {
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (!columnCount) return;
    const norm = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
    const natural: number[] = [];
    const minimum: number[] = [];
    for (let col = 0; col < columnCount; col += 1) {
      let nat = 0;
      let min = 0;
      norm.forEach((row, rowIndex) => {
        setFont(BODY_SIZE, rowIndex === 0 || col === 0);
        for (const line of row[col].split("\n")) nat = Math.max(nat, ctx.measureText(line).width);
        for (const word of row[col].split(/\s+/)) min = Math.max(min, Math.min(ctx.measureText(word).width, 120));
      });
      natural.push(nat + PAD_X * 2 + 6);
      minimum.push(min + PAD_X * 2 + 4);
    }
    const widths = computeColumnWidths(natural, minimum, contentW);
    // Visual column order: right-to-left for Arabic, so the first column sits on the right.
    const colLeft: number[] = [];
    if (rtl) {
      let right = MARGIN + contentW;
      widths.forEach((width, col) => { colLeft[col] = right - width; right -= width; });
    } else {
      let left = MARGIN;
      widths.forEach((width, col) => { colLeft[col] = left; left += width; });
    }
    const drawRow = (row: string[], rowIndex: number, isHeader: boolean): void => {
      const cellLines = row.map((cell, col) => {
        setFont(BODY_SIZE, isHeader || col === 0);
        return wrapText(ctx, cell, widths[col] - PAD_X * 2);
      });
      const rowH = Math.max(isHeader ? 30 : 26, Math.max(...cellLines.map((lines) => lines.length)) * LINE_H + PAD_Y * 2);
      if (y + rowH > PAGE_H - MARGIN - 14) {
        newPage();
        if (!isHeader) { drawRow(norm[0], 0, true); }
      }
      row.forEach((_, col) => {
        ctx.fillStyle = isHeader ? PDF_THEME.headBg : (rowIndex % 2 === 0 ? PDF_THEME.zebra : "#ffffff");
        ctx.fillRect(colLeft[col], y, widths[col], rowH);
        ctx.strokeStyle = isHeader ? PDF_THEME.headBg : PDF_THEME.inner;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(colLeft[col], y, widths[col], rowH);
        setFont(BODY_SIZE, isHeader || col === 0);
        ctx.fillStyle = isHeader ? PDF_THEME.headText : PDF_THEME.text;
        const blockH = cellLines[col].length * LINE_H;
        drawLines(cellLines[col], textX(colLeft[col], widths[col], PAD_X), y + (rowH - blockH) / 2, align, LINE_H);
      });
      if (isHeader) {
        ctx.strokeStyle = PDF_THEME.frame;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(MARGIN, y + rowH); ctx.lineTo(MARGIN + contentW, y + rowH); ctx.stroke();
      }
      y += rowH;
    };
    const tableTopPage = canvases.length;
    const tableTop = y;
    norm.forEach((row, rowIndex) => drawRow(row, rowIndex, rowIndex === 0));
    if (canvases.length === tableTopPage) {
      ctx.strokeStyle = PDF_THEME.frame;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(MARGIN, tableTop, contentW, y - tableTop);
    }
    y += 14;
  };

  for (const block of blocks) {
    if (block.type === "table") { drawTable(block.rows); continue; }
    const isTitle = block.type === "title";
    const heading = block.type === "paragraph" ? block.text.match(/^(#{1,3})\s+(.+)$/) : null;
    const bullet = block.type === "paragraph" ? block.text.match(/^[-*]\s+(.+)$/) : null;
    const text = isTitle ? block.text : heading ? heading[2] : bullet ? "\u2022 " + bullet[1] : block.text;
    const size = isTitle ? 22 : heading ? [20, 17, 14][heading[1].length - 1] : BODY_SIZE + 1;
    const lineH = Math.round(size * 1.55);
    setFont(size, isTitle || Boolean(heading));
    const lines = wrapText(ctx, text, contentW);
    if (y + lines.length * lineH > PAGE_H - MARGIN - 14) newPage();
    setFont(size, isTitle || Boolean(heading));
    ctx.fillStyle = isTitle ? PDF_THEME.text : heading ? PDF_THEME.muted : PDF_THEME.text;
    drawLines(lines, isTitle ? PAGE_W / 2 : textX(MARGIN, contentW), y, isTitle ? "center" : align, lineH);
    y += lines.length * lineH;
    if (isTitle) {
      ctx.strokeStyle = PDF_THEME.rule;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(MARGIN, y + 6); ctx.lineTo(PAGE_W - MARGIN, y + 6); ctx.stroke();
      y += 22;
    } else y += heading ? 6 : 8;
  }

  // Page numbers, drawn once the total is known.
  canvases.forEach((pageCanvas, index) => {
    const pageCtx = pageCanvas.getContext("2d")!;
    pageCtx.font = "9px " + FONT;
    pageCtx.fillStyle = PDF_THEME.muted;
    pageCtx.textAlign = "center";
    pageCtx.textBaseline = "middle";
    pageCtx.direction = "ltr";
    pageCtx.fillText((index + 1) + " / " + canvases.length, PAGE_W / 2, PAGE_H - 24);
  });

  const pages: JpegPage[] = [];
  for (const pageCanvas of canvases) {
    const blob: Blob | null = await new Promise((resolve) => pageCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Could not render the PDF page.");
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: pageCanvas.width, height: pageCanvas.height });
  }
  const bytes = assemblePdfFromJpegPages(pages);
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
}
