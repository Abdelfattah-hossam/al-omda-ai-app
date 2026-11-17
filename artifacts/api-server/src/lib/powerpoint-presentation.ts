export type PowerPointSlide = { title: string; bullets: string[]; notes?: string };
export type PowerPointPresentation = { title: string; slides: PowerPointSlide[] };

export function parsePowerPointPresentation(text: string): PowerPointPresentation | null {
  if (typeof text !== "string" || text.length > 1_000_000) return null;
  try {
    const source = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const value = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 180 || !Array.isArray(value.slides) || value.slides.length < 3 || value.slides.length > 30) return null;
    const slides = value.slides.map((slide: unknown): PowerPointSlide | null => {
      if (!slide || typeof slide !== "object") return null;
      const item = slide as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 180 || !Array.isArray(item.bullets) || item.bullets.length < 1 || item.bullets.length > 8 || item.bullets.some((bullet: unknown) => typeof bullet !== "string" || !bullet.trim() || bullet.length > 700)) return null;
      if (item.notes !== undefined && (typeof item.notes !== "string" || item.notes.length > 2000)) return null;
      return {
        title: item.title.trim(),
        bullets: item.bullets.map((bullet: string) => bullet.trim()),
        ...(typeof item.notes === "string" && item.notes.trim() ? { notes: item.notes.trim() } : {}),
      };
    });
    if (slides.some((slide) => slide === null)) return null;
    const validSlides = slides as PowerPointSlide[];
    if (validSlides.some((slide) => slide.bullets.reduce((total, bullet) => total + bullet.length, 0) > 2400)) return null;
    const normalized = { title: value.title.trim(), slides: validSlides };
    if (JSON.stringify(normalized).length > 85000) return null;
    return normalized;
  } catch {
    return null;
  }
}

/** Extracts an explicitly requested slide count without guessing when none is stated. */
export function getRequestedPowerPointSlideCount(request: string): number | null {
  const normalized = request.normalize("NFKC").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = normalized.match(/(?:^|\D)(\d{1,2})\s*(?:slides?|شرائح|شريحة)/i);
  if (!match) return null;
  const count = Number(match[1]);
  return count >= 3 && count <= 30 ? count : null;
}
