/**
 * Narrowing helpers for indexed access.
 *
 * `noUncheckedIndexedAccess` is on across the repo, so `rows[0]` and
 * `record[key]` are `T | undefined`. Failing loudly with a useful message beats
 * sprinkling non-null assertions through the assertions themselves.
 */
export function firstRow<T>(rows: readonly T[], description: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected at least one ${description}, found none`);
  }
  return row;
}

export function requireEntry<T>(
  record: Record<string, T | undefined>,
  key: string,
  description: string
): T {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`Expected ${description} for "${key}"`);
  }
  return value;
}
