/** Detect fabricated download links, without blocking ordinary reference URLs. */
export function hasUnverifiedDownloadLinks(text: string, evidence: string): boolean {
  const links = [...text.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi)].map(match => match[1]);
  return links.some(link => {
    if (evidence.includes(link)) return false;
    try {
      const url = new URL(link);
      return /(^|\.)(?:example\.(?:com|org|net)|test\.invalid)$/.test(url.hostname) || /\.(?:pptx|docx|xlsx|zip|mp4|pdf)(?:$|[?#])/i.test(url.pathname);
    } catch { return false; }
  });
}
