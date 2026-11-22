export const WORKSPACE_ASSET_PAGE_SIZE = 100;

// The API keeps a bounded response size. Callers cancel on folder changes or close.
export async function loadAssetPages<T>(
  load: (offset: number, signal?: AbortSignal) => Promise<T[]>,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  const checkCancellation = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
  };
  for (let offset = 0; ; offset += WORKSPACE_ASSET_PAGE_SIZE) {
    checkCancellation();
    const page = await load(offset, signal);
    checkCancellation();
    items.push(...page);
    if (page.length < WORKSPACE_ASSET_PAGE_SIZE) return items;
  }
}
