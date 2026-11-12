export type BingSearchResult = { title: string; url: string; snippet: string; publishedAt?: string };
export type BingSearchPayload = { results: BingSearchResult[]; totalEstimatedMatches?: number };

export function buildBingCompatibleSearchUrl(
  endpoint: string,
  query: string,
  count = 5,
  market?: string,
  safeSearch = "Strict",
): URL {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Search endpoint must be an HTTPS URL without credentials or a fragment.");
  }
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 1000) throw new Error("Search query must contain 1 to 1,000 characters.");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("count", String(Math.max(1, Math.min(10, Math.floor(count) || 5))));
  url.searchParams.set("safeSearch", safeSearch === "Off" || safeSearch === "Moderate" ? safeSearch : "Strict");
  if (market && /^[a-z]{2}-[A-Z]{2}$/.test(market)) url.searchParams.set("mkt", market);
  return url;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function parseBingCompatibleSearchPayload(value: unknown): BingSearchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Search provider returned an invalid JSON object.");
  const payload = value as Record<string, any>;
  const webPages = payload.webPages && typeof payload.webPages === "object" ? payload.webPages : {};
  const rawResults = Array.isArray(webPages.value) ? webPages.value
    : Array.isArray(payload.results) ? payload.results
    : Array.isArray(payload.value) ? payload.value
    : [];
  const results: BingSearchResult[] = rawResults.slice(0, 10).flatMap((item: any) => {
    if (!item || typeof item !== "object") return [];
    const url = text(item.url || item.link, 2048);
    const title = text(item.name || item.title, 300);
    if (!url || !title) return [];
    return [{
      title,
      url,
      snippet: text(item.snippet || item.description, 2000),
      ...(typeof item.datePublished === "string" ? { publishedAt: item.datePublished.slice(0, 80) } : {}),
    }];
  });
  const total = webPages.totalEstimatedMatches;
  return {
    results,
    ...(typeof total === "number" && Number.isFinite(total) && total >= 0 ? { totalEstimatedMatches: total } : {}),
  };
}
