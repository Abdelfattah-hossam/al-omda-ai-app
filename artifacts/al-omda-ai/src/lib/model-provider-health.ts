export type ModelProviderHealth = {
  name: string;
  model: string;
  kind: "local" | "remote";
  reachable: boolean;
  endpointAvailable: boolean;
  status: number | null;
  latencyMs: number;
  modelAvailable: boolean | null;
  discoveredModels: string[];
  error?: string;
};

export type ModelProviderInfo = {
  name: string;
  model: string;
  kind: "local" | "remote";
  hasApiKey: boolean;
  purposes?: string[];
  priority?: number;
};

export function parseModelProviderHealth(value: unknown): ModelProviderHealth[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModelProviderHealth => {
    if (!item || typeof item !== "object") return false;
    const provider = item as Record<string, unknown>;
    return typeof provider.name === "string" &&
      typeof provider.model === "string" &&
      (provider.kind === "local" || provider.kind === "remote") &&
      typeof provider.reachable === "boolean" &&
      typeof provider.endpointAvailable === "boolean" &&
      (provider.status === null || typeof provider.status === "number") &&
      typeof provider.latencyMs === "number" && Number.isFinite(provider.latencyMs) &&
      (provider.modelAvailable === null || typeof provider.modelAvailable === "boolean") &&
      Array.isArray(provider.discoveredModels) &&
      provider.discoveredModels.every((model) => typeof model === "string") &&
      (provider.error === undefined || typeof provider.error === "string");
  });
}

export function parseModelProviderInfo(value: unknown): ModelProviderInfo[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModelProviderInfo => {
    if (!item || typeof item !== "object") return false;
    const provider = item as Record<string, unknown>;
    return typeof provider.name === "string" &&
      typeof provider.model === "string" &&
      (provider.kind === "local" || provider.kind === "remote") &&
      typeof provider.hasApiKey === "boolean" &&
      (provider.purposes === undefined || (Array.isArray(provider.purposes) && provider.purposes.every((purpose) => typeof purpose === "string"))) &&
      (provider.priority === undefined || (typeof provider.priority === "number" && Number.isFinite(provider.priority)));
  });
}

export function providerStatusLabel(provider: ModelProviderHealth | null | undefined, ar: boolean): string {
  if (!provider) return ar ? "لم يُفحص" : "Not tested";
  if (!provider.reachable) return provider.error === "timeout" ? (ar ? "انتهت المهلة" : "Timed out") : (ar ? "غير متصل" : "Offline");
  if (provider.endpointAvailable && provider.modelAvailable === true) return ar ? "النموذج ظاهر في القائمة" : "Model listed";
  if (provider.endpointAvailable && provider.modelAvailable === false) return ar ? "النموذج غير موجود" : "Model not listed";
  if (provider.endpointAvailable) return ar ? "الخادم متصل" : "Endpoint reachable";
  if (provider.error === "authentication_failed") return ar ? "المصادقة مرفوضة" : "Auth rejected";
  return ar ? "واجهة النماذج غير متاحة" : "Models endpoint unavailable";
}
