export type RevisionHistoryEntry = {
  result: string;
  executedAt?: string;
  revisionRequestedAt: string;
  note: string;
};

/** Revision history is audit data: task updates may not edit, remove, or append entries. */
export function isRevisionHistoryUnchanged(
  previous: readonly RevisionHistoryEntry[] | undefined,
  next: readonly RevisionHistoryEntry[] | undefined,
): boolean {
  const before = previous ?? [];
  const after = next ?? [];
  return before.length === after.length && before.every((entry, index) => {
    const candidate = after[index];
    return !!candidate &&
      entry.result === candidate.result &&
      entry.executedAt === candidate.executedAt &&
      entry.revisionRequestedAt === candidate.revisionRequestedAt &&
      entry.note === candidate.note;
  });
}
