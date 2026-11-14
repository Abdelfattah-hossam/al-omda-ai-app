export type PowerPointData = {
  title: string;
  slides: Array<{ title: string; body: string; bullets: string[]; speakerNotes: string }>;
};

export function parsePowerPointData(value: unknown): PowerPointData | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.title !== "string" || !source.title.trim() || source.title.length > 180 ||
    !Array.isArray(source.slides) || source.slides.length < 1 || source.slides.length > 40) return null;
  const slides: PowerPointData["slides"] = [];
  for (const item of source.slides) {
    if (!item || typeof item !== "object") return null;
    const slide = item as Record<string, unknown>;
    if (typeof slide.title !== "string" || !slide.title.trim() || slide.title.length > 180) return null;
    const bullets = Array.isArray(slide.bullets)
      ? slide.bullets.filter((bullet): bullet is string => typeof bullet === "string" && Boolean(bullet.trim())).slice(0, 10).map((bullet) => bullet.trim().slice(0, 150))
      : [];
    const body = typeof slide.body === "string" ? slide.body.trim().slice(0, bullets.length ? 250 : 900) : "";
    const speakerNotes = typeof slide.speakerNotes === "string" ? slide.speakerNotes.slice(0, 2000) : "";
    if (!body && bullets.length === 0 && !speakerNotes) return null;
    slides.push({ title: slide.title.trim(), body, bullets, speakerNotes });
  }
  const presentation = { title: source.title.trim(), slides };
  if (JSON.stringify(presentation).length > 120000) return null;
  return presentation;
}

export function parsePowerPointResult(result?: string): PowerPointData | null {
  const prefix = "ALOMDA_PPTX_JSON:";
  if (!result?.startsWith(prefix)) return null;
  try { return parsePowerPointData(JSON.parse(result.slice(prefix.length))); }
  catch { return null; }
}

export function isPowerPointRtl(data: PowerPointData): boolean {
  return /[\u0590-\u08ff]/.test([data.title, ...data.slides.map((slide) => [slide.title, slide.body, ...slide.bullets].join(" "))].join(" "));
}

export function safePowerPointFileName(value: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "AL-OMDA-presentation";
}

function estimateLines(value: string, charactersPerLine: number): number {
  return value.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

function fitFontSize(value: string, baseSize: number, maxLines: number, charactersPerLine: number): number {
  if (!value) return baseSize;
  const lines = estimateLines(value, charactersPerLine);
  return Math.max(11, Math.min(baseSize, Math.floor(baseSize * maxLines / lines)));
}

export async function buildPowerPointBlob(data: PowerPointData): Promise<Blob> {
  const primaryModuleUrl = "https://esm.sh/pptxgenjs@3.12.0";
  const fallbackModuleUrl = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm";
  let module: any;
  try { module = await import(/* @vite-ignore */ primaryModuleUrl); }
  catch {
    try { module = await import(/* @vite-ignore */ fallbackModuleUrl); }
    catch { throw new Error("The PowerPoint generator could not be loaded. No fake file was created; check your connection and retry."); }
  }
  const PptxGenJS = module.default ?? module;
  const rtl = isPowerPointRtl(data);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.rtlMode = rtl;
  pptx.author = "AL OMDA AI";
  pptx.subject = data.title;
  pptx.title = data.title;
  pptx.lang = rtl ? "ar-SA" : "en-US";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: rtl ? "ar-SA" : "en-US" };
  data.slides.forEach((item, slideIndex) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(item.title, {
      x: 0.65, y: 0.45, w: 12.05, h: 0.8, fontFace: "Arial",
      fontSize: fitFontSize(item.title, 28, 2, 62), bold: true, color: "17243A",
      align: rtl ? "right" : "left", rtlMode: rtl, margin: 0.04,
    });
    let bodyY = 1.55;
    if (item.body) {
      const hasBullets = item.bullets.length > 0;
      slide.addText(item.body, {
        x: 0.8, y: bodyY, w: 11.7, h: hasBullets ? 1.25 : 4.9,
        fontFace: "Arial", fontSize: fitFontSize(item.body, 19, hasBullets ? 3 : 14, 92),
        color: "354052", align: rtl ? "right" : "left", rtlMode: rtl,
        valign: "mid", paraSpaceAfterPt: 12, margin: 0.04,
      });
      if (hasBullets) bodyY += 1.55;
    }
    if (item.bullets.length) {
      const bulletText = item.bullets.join("\n");
      const runs = item.bullets.map((bullet, index) => ({
        text: bullet,
        options: { bullet: { indent: 20 }, hanging: 4, breakLine: index < item.bullets.length - 1 },
      }));
      slide.addText(runs, {
        x: 0.9, y: bodyY, w: 11.5, h: Math.max(2.2, 4.9 - (bodyY - 1.55)),
        fontFace: "Arial", fontSize: fitFontSize(bulletText, 19, 14, 92),
        color: "253247", align: rtl ? "right" : "left", rtlMode: rtl,
        valign: "mid", paraSpaceAfterPt: 12, margin: 0.04,
      });
    }
    if (item.speakerNotes && typeof slide.addNotes === "function") slide.addNotes(item.speakerNotes);
    slide.addText(String(slideIndex + 1), {
      x: 12.1, y: 7.08, w: 0.5, h: 0.2, fontFace: "Arial",
      fontSize: 9, color: "7B8493", align: "center", margin: 0,
    });
  });
  const output = await pptx.write({ outputType: "blob" });
  const file = output instanceof Blob ? output : new Blob([output as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  if (file.size < 1500) throw new Error("The generated PowerPoint file is incomplete.");
  return file;
}
