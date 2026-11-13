export const MODEL_PURPOSES = ["general", "research", "proposal", "coding", "review"] as const;
export type ModelPurpose = typeof MODEL_PURPOSES[number];
export type ModelProviderConfig = { name: string; base: string; model: string; key: string; purposes: Array<ModelPurpose | "all">; priority: number };

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function parseModelProviderConfig(value: unknown, env: Record<string, string | undefined>): ModelProviderConfig[] {
  if (!Array.isArray(value)) throw new Error("Model provider configuration must be a JSON array.");
  if (value.length > 8) throw new Error("Configure no more than eight additional model providers.");
  const result: ModelProviderConfig[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid model provider entry at index " + index + ".");
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "provider-" + (index + 1);
    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    const baseValue = typeof entry.baseUrl === "string" ? entry.baseUrl.trim() : "";
    const apiKeyEnv = typeof entry.apiKeyEnv === "string" ? entry.apiKeyEnv.trim() : "";
    const priority = entry.priority === undefined ? 100 + index : entry.priority;
    const rawPurposes = entry.purposes === undefined ? ["all"] : entry.purposes;
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(name)) throw new Error("Invalid model provider name at index " + index + ".");
    if (!model || model.length > 200) throw new Error("Invalid model name for provider " + name + ".");
    if (apiKeyEnv && !/^[A-Z_][A-Z0-9_]{0,100}$/.test(apiKeyEnv)) throw new Error("Invalid API key environment variable name for provider " + name + ".");
    if (!Number.isInteger(priority) || (priority as number) < 1 || (priority as number) > 999) throw new Error("Provider priority for " + name + " must be an integer from 1 to 999.");
    if (!Array.isArray(rawPurposes) || rawPurposes.length < 1 || rawPurposes.length > MODEL_PURPOSES.length + 1 ||
      rawPurposes.some((purpose) => purpose !== "all" && !MODEL_PURPOSES.includes(purpose as ModelPurpose)) ||
      new Set(rawPurposes).size !== rawPurposes.length) {
      throw new Error("Invalid purposes for model provider " + name + ".");
    }
    if (apiKeyEnv && !env[apiKeyEnv]?.trim()) continue;
    let url: URL;
    try { url = new URL(baseValue); } catch { throw new Error("Invalid baseUrl for model provider " + name + "."); }
    if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && isLoopback(url.hostname)))) {
      throw new Error("Model provider " + name + " must use HTTPS or an explicit loopback HTTP endpoint, without credentials or query parameters.");
    }
    result.push({ name, base: url.toString().replace(/\/+$/, ""), model, key: apiKeyEnv ? env[apiKeyEnv]!.trim() : "", purposes: [...rawPurposes] as Array<ModelPurpose | "all">, priority: priority as number });
  }
  return result;
}

export function orderModelProvidersByPurpose<T extends { purposes: Array<ModelPurpose | "all">; priority: number }>(providers: T[], purpose: ModelPurpose | "all"): T[] {
  if (purpose === "all") return [...providers].sort((a, b) => a.priority - b.priority);
  const targeted = providers.filter((provider) => !provider.purposes.includes("all") && provider.purposes.includes(purpose)).sort((a, b) => a.priority - b.priority);
  const global = providers.filter((provider) => provider.purposes.includes("all")).sort((a, b) => a.priority - b.priority);
  return [...targeted, ...global];
}
