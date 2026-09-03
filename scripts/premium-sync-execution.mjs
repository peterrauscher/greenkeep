// @ts-check

/**
 * @template T
 * @typedef {object} PremiumSyncOperations
 * @property {(config: T) => Promise<number>} synchronize
 * @property {(config: T) => Promise<void>} complete
 * @property {(config: T) => Promise<void>} pause
 * @property {(config: T, message: string) => Promise<void>} fail
 * @property {(error: unknown) => boolean} isPremiumRequired
 */

/**
 * Apply exactly one terminal state to a claimed job.
 * @template T
 * @param {T} config
 * @param {PremiumSyncOperations<T>} operations
 * @returns {Promise<
 *   | { outcome: "completed", addedCommits: number }
 *   | { outcome: "paused", addedCommits: 0 }
 *   | { outcome: "failed", addedCommits: 0, error: string }
 * >}
 */
export async function executePremiumSync(config, operations) {
  try {
    const addedCommits = await operations.synchronize(config);
    await operations.complete(config);
    return { outcome: "completed", addedCommits };
  } catch (error) {
    if (operations.isPremiumRequired(error)) {
      await operations.pause(config);
      return { outcome: "paused", addedCommits: 0 };
    }
    const message = error instanceof Error ? error.message : "Automatic sync failed";
    await operations.fail(config, message);
    return { outcome: "failed", addedCommits: 0, error: message };
  }
}
