export type ModelListInspection = {
  modelAvailable: boolean | null;
  discoveredModels: string[];
};

export function inspectOpenAIModelList(payload: unknown, configuredModel: string): ModelListInspection {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return { modelAvailable: null, discoveredModels: [] };
  }
  const discoveredModels = ((payload as { data: unknown[] }).data)
    .filter((item): item is { id: string } => Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
    .map((item) => item.id.trim())
    .filter((id) => Boolean(id) && id.length <= 200)
    .slice(0, 50);
  return {
    modelAvailable: discoveredModels.includes(configuredModel),
    discoveredModels,
  };
}
