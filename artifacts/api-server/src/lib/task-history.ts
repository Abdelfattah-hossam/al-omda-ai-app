export type RevisionHistoryEntry = {
  result: string;
  executedAt?: string;
  revisionRequestedAt: string;
  note: string;
};

// Postgres writes JSONB datetimes in offset form ("+00:00") while API reads
// are normalized to "Z"; the same instant must compare equal either way.
function sameRevisionInstant(left: string | undefined, right: string | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return !Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime === rightTime;
}

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
      sameRevisionInstant(entry.executedAt, candidate.executedAt) &&
      sameRevisionInstant(entry.revisionRequestedAt, candidate.revisionRequestedAt) &&
      entry.note === candidate.note;
  });
}
