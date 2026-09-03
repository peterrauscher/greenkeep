// @ts-check

/**
 * @typedef {{ date: string, commits: number }} CommitPlanItem
 * @typedef {{ date: string, iso: string, message: string }} CommitSpec
 */

/**
 * Build only the commits still missing from a durable per-day ledger. Starting
 * each day's timestamp index after the copied count keeps retries deterministic.
 * @param {CommitPlanItem[]} plan
 * @param {Record<string, number>} copiedCounts
 * @returns {CommitSpec[]}
 */
export function buildSyncCommitSpecs(plan, copiedCounts) {
  /** @type {CommitSpec[]} */
  const specs = [];
  for (const item of plan) {
    const copied = Math.max(0, Math.floor(copiedCounts[item.date] ?? 0));
    for (let index = copied; index < item.commits; index += 1) {
      const hour = String(10 + (index % 12)).padStart(2, "0");
      const minute = String((index * 3) % 60).padStart(2, "0");
      specs.push({
        date: item.date,
        iso: `${item.date}T${hour}:${minute}:00Z`,
        message: `chore: graph ${item.date}`,
      });
    }
  }
  return specs;
}

/**
 * Apply a confirmed GitHub batch to an immutable ledger snapshot.
 * @param {Record<string, number>} copiedCounts
 * @param {CommitSpec[]} committed
 * @returns {Record<string, number>}
 */
export function applyCommittedSpecs(copiedCounts, committed) {
  const next = { ...copiedCounts };
  for (const spec of committed) next[spec.date] = (next[spec.date] ?? 0) + 1;
  return next;
}
