export type AgentToolWarningItem = { tool?: unknown; message?: unknown };

/** Render a bounded, localized warning without changing the assistant's underlying prose. */
export function buildAgentToolWarning(failures: unknown, ar: boolean): string {
  const allItems = Array.isArray(failures) ? failures as AgentToolWarningItem[] : [];
  const items = allItems.slice(0, 5);
  if (!items.length) return "";
  const omitted = Math.max(0, allItems.length - items.length);
  const heading = ar
    ? "تنبيه تنفيذ: فشلت بعض الأدوات، لذلك لا يُعد التنفيذ مكتملًا بالكامل:"
    : "Execution warning: some tools failed, so the run is not fully verified:";
  return "\n\n" + heading + items.map((failure) =>
    "\n- " + String(failure.tool || "tool") + ": " + String(failure.message || "failed").slice(0, 240)
  ).join("");
}
