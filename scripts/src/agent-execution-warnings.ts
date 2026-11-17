export type AgentToolFailureSummary = { callId: string; tool: string; message: string };

export function summarizeAgentToolFailures(toolFailures: readonly AgentToolFailureSummary[]): {
  toolExecutionStatus: "with_warnings" | "no_tool_errors";
  toolFailures: AgentToolFailureSummary[];
} {
  const failures = [...toolFailures];
  return {
    toolExecutionStatus: failures.length ? "with_warnings" : "no_tool_errors",
    toolFailures: failures,
  };
}
