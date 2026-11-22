/**
 * Holds the Worker's Workers AI binding so the Express API (which only sees
 * process.env) can use the keyless in-platform provider. The worker entry
 * captures the binding from each fetch's env; provider code reads it here.
 */
export type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

let binding: WorkersAiBinding | null = null;

export function setWorkersAiBinding(value: unknown): void {
  binding =
    value && typeof (value as WorkersAiBinding).run === "function"
      ? (value as WorkersAiBinding)
      : null;
}

export function getWorkersAiBinding(): WorkersAiBinding | null {
  return binding;
}
