export type PowerPointSlide = { title: string; body: string; bullets: string[]; speakerNotes: string };
export type PowerPointPresentation = { title: string; slides: PowerPointSlide[] };

export function parsePowerPointPresentation(text: string): PowerPointPresentation | null {
  try {
    const source = text.trim().replace(/^\s*\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1));
    if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 180 || !Array.isArray(value.slides)) return null;
    if (value.slides.length < 1 || value.slides.length > 40) return null;
    const slides: PowerPointSlide[] = [];
    for (const item of value.slides) {
      if (!item || typeof item !== "object" || typeof item.title !== "string" || !item.title.trim() || item.title.length > 180) return null;
      const rawBullets = Array.isArray(item.bullets) ? item.bullets : [];
      if (rawBullets.some((bullet: unknown) => typeof bullet !== "string")) return null;
      const bullets = rawBullets.slice(0, 10).map((bullet: string) => bullet.trim().slice(0, 150)).filter(Boolean);
      const body = typeof item.body === "string" ? item.body.trim().slice(0, bullets.length ? 250 : 900) : "";
      const speakerNotes = typeof item.speakerNotes === "string" ? item.speakerNotes.trim().slice(0, 2000) : "";
      if (!body && bullets.length === 0 && !speakerNotes) return null;
      slides.push({ title: item.title.trim(), body, bullets, speakerNotes });
    }
    if (JSON.stringify({ title: value.title.trim(), slides }).length > 120000) return null;
    return { title: value.title.trim(), slides };
  } catch { return null; }
}
