/**
 * Parses PowerPoint slide XML into a positioned shape model and renders each
 * slide to a PNG data URL on a canvas, so workspace previews can show slides
 * visually instead of extracted text. Pure parsing lives here (no DOM APIs)
 * so it stays unit-testable in Node; only renderSlidePng needs a browser canvas.
 */

export type SlideRun = { text: string; sizePt: number; color: string; bold: boolean; rtl: boolean };
export type SlideParagraph = { align: "l" | "ctr" | "r"; rtl: boolean; bullet: boolean; runs: SlideRun[] };
export type SlideShape = { name: string; x: number; y: number; cx: number; cy: number; paragraphs: SlideParagraph[] };
export type ParsedSlide = { background: string | null; shapes: SlideShape[] };

const EMU_PER_INCH = 914400;
const DEFAULT_SLIDE_CX = 12192000;
const DEFAULT_SLIDE_CY = 6858000;

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function tagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) attributes[match[1]] = match[2];
  return attributes;
}

function parseParagraph(source: string): SlideParagraph {
  const pPrMatch = source.match(/<a:pPr\b([^>]*?)(\/>|>)/);
  const pPr = pPrMatch ? tagAttributes(pPrMatch[1]) : {};
  const bullet = /<a:buChar\b/.test(source);
  const alignAttr = pPr.algn === "ctr" ? "ctr" : pPr.algn === "r" ? "r" : "l";
  const runs: SlideRun[] = [];
  const runPattern = /<a:r>([\s\S]*?)<\/a:r>/g;
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runPattern.exec(source))) {
    const runSource = runMatch[1];
    const rPrMatch = runSource.match(/<a:rPr\b([^>]*?)(\/>|>)/);
    const rPr = rPrMatch ? tagAttributes(rPrMatch[1]) : {};
    const colorMatch = runSource.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/);
    const textMatch = runSource.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
    const lang = rPr.lang ?? "";
    runs.push({
      text: textMatch ? xmlUnescape(textMatch[1]) : "",
      sizePt: rPr.sz ? Number(rPr.sz) / 100 : 18,
      color: colorMatch ? "#" + colorMatch[1].toUpperCase() : "#F1F5F9",
      bold: rPr.b === "1",
      rtl: rPr.rtl === "1" || /^ar|he|fa|ur/i.test(lang),
    });
  }
  const rtl = pPr.rtl === "1" || runs.some((run) => run.rtl) || /[\u0590-\u08FF]/.test(runs.map((run) => run.text).join(""));
  return { align: alignAttr, rtl, bullet, runs };
}

/** Parses one ppt/slides/slideN.xml document into positioned text shapes. */
export function parseSlideXml(xml: string): ParsedSlide {
  const bgMatch = xml.match(/<p:bg>[\s\S]*?<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/);
  const shapes: SlideShape[] = [];
  const shapePattern = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let shapeMatch: RegExpExecArray | null;
  while ((shapeMatch = shapePattern.exec(xml))) {
    const source = shapeMatch[1];
    const nameMatch = source.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/);
    const offMatch = source.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
    const extMatch = source.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    const paragraphs: SlideParagraph[] = [];
    const paragraphPattern = /<a:p>([\s\S]*?)<\/a:p>/g;
    let paragraphMatch: RegExpExecArray | null;
    while ((paragraphMatch = paragraphPattern.exec(source))) {
      const paragraph = parseParagraph(paragraphMatch[1]);
      if (paragraph.runs.some((run) => run.text.trim())) paragraphs.push(paragraph);
    }
    if (!paragraphs.length) continue;
    shapes.push({
      name: nameMatch ? xmlUnescape(nameMatch[1]) : "",
      x: offMatch ? Number(offMatch[1]) : 0,
      y: offMatch ? Number(offMatch[2]) : 0,
      cx: extMatch ? Number(extMatch[1]) : DEFAULT_SLIDE_CX,
      cy: extMatch ? Number(extMatch[2]) : DEFAULT_SLIDE_CY / 4,
      paragraphs,
    });
  }
  return { background: bgMatch ? "#" + bgMatch[1].toUpperCase() : null, shapes };
}

/** Reads the slide size (EMU) from ppt/presentation.xml, defaulting to 16:9. */
export function parsePresentationSize(xml: string): { cx: number; cy: number } {
  const match = xml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (!match) return { cx: DEFAULT_SLIDE_CX, cy: DEFAULT_SLIDE_CY };
  return { cx: Number(match[1]), cy: Number(match[2]) };
}

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let index = 1; index < words.length; index++) {
    const candidate = current + " " + words[index];
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Renders one parsed slide to a PNG data URL. Returns null when no 2D canvas
 * is available (very old browsers), letting callers fall back to text preview.
 */
export function renderSlidePng(
  slide: ParsedSlide,
  slideSize: { cx: number; cy: number },
  width = 960,
): string | null {
  const canvas = document.createElement("canvas");
  const height = Math.round((width * slideSize.cy) / slideSize.cx);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const px = (emu: number) => (emu * width) / slideSize.cx;
  const fontPx = (pt: number) => (pt * width * EMU_PER_INCH) / (slideSize.cx * 72);

  ctx.fillStyle = slide.background ?? "#101722";
  ctx.fillRect(0, 0, width, height);

  for (const shape of slide.shapes) {
    const shapeWidth = px(shape.cx);
    type LaidOutLine = { text: string; font: string; color: string; align: SlideParagraph["align"]; rtl: boolean; lineHeight: number };
    const lines: LaidOutLine[] = [];
    for (const paragraph of shape.paragraphs) {
      const text = paragraph.runs.map((run) => run.text).join("");
      if (!text.trim()) continue;
      const firstRun = paragraph.runs.find((run) => run.text.trim()) ?? paragraph.runs[0];
      const size = fontPx(firstRun.sizePt);
      const font = (firstRun.bold ? "bold " : "") + size + "px Arial, sans-serif";
      ctx.font = font;
      const wrapped = wrapLine(ctx, text, Math.max(shapeWidth - 8, 40));
      wrapped.forEach((line, index) => {
        lines.push({
          text: paragraph.bullet && index === 0 ? (paragraph.rtl ? line + " •" : "• " + line) : line,
          font,
          color: firstRun.color,
          align: paragraph.align,
          rtl: paragraph.rtl,
          lineHeight: size * 1.3,
        });
      });
    }
    if (!lines.length) continue;
    const totalHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
    let cursorY = px(shape.y) + Math.max((px(shape.cy) - totalHeight) / 2, 0);
    for (const line of lines) {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.direction = line.rtl ? "rtl" : "ltr";
      const left = px(shape.x);
      const textY = cursorY + line.lineHeight * 0.75;
      if (line.align === "ctr") {
        ctx.textAlign = "center";
        ctx.fillText(line.text, left + shapeWidth / 2, textY);
      } else if (line.align === "r") {
        ctx.textAlign = "right";
        ctx.fillText(line.text, left + shapeWidth, textY);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(line.text, left, textY);
      }
      cursorY += line.lineHeight;
    }
  }
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
