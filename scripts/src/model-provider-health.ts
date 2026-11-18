export type ModelListInspection = {
  modelAvailable: boolean | null;
  discoveredModels: string[];
};

export function inspectOpenAIModelList(payload: unknown, configuredModel: string): ModelListInspection {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return { modelAvailable: null, discoveredModels: [] };
  }
  const allDiscoveredModels = ((payload as { data: unknown[] }).data)
    .filter((item): item is { id: string } => Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
    .map((item) => item.id.trim())
    .filter((id) => Boolean(id) && id.length <= 200);
  return {
    modelAvailable: allDiscoveredModels.includes(configuredModel.trim()),
    discoveredModels: allDiscoveredModels.slice(0, 50),
  };
}
