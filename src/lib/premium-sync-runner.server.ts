import { executePremiumSync } from "../../scripts/premium-sync-execution.mjs";
import { applyCommittedSpecs, buildSyncCommitSpecs } from "../../scripts/premium-sync-plan.mjs";
import { getStoredGithubAccessToken } from "./auth/github-token.server";
import { PremiumRequiredError, requirePremiumEntitlement } from "./billing/verify.server";
import { mergeCalendars, planCommits } from "./github";
import {
  appendMirrorCommitsWithToken,
  beginMirrorRepository,
  fetchGithubSourceCalendars,
  listGreenkeepCommitCounts,
  resolveGithubDestination,
} from "./github-api.server";
import {
  claimDuePremiumSync,
  completePremiumSync,
  failPremiumSync,
  getCopiedCommitCounts,
  pausePremiumSyncForBilling,
  replaceCopiedCommitCounts,
  upsertCopiedCommitCounts,
  type ClaimedPremiumSync,
} from "./premium-sync-store.server";

const COMMIT_BATCH_SIZE = 20;

async function synchronize(config: ClaimedPremiumSync): Promise<number> {
  await requirePremiumEntitlement(config.userId);
  const { accessToken } = await getStoredGithubAccessToken(config.userId);
  const destination = await resolveGithubDestination(accessToken);
  if (
    !destination.emails.some((email) => email.toLowerCase() === config.commitEmail.toLowerCase())
  ) {
    throw new Error("The automatic sync commit email is no longer verified on GitHub.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const calendars = await fetchGithubSourceCalendars(
    config.sourceUsernames,
    config.startDate,
    today,
  );
  const plan = planCommits(mergeCalendars(calendars), config.intensity, config.startDate, today);
  const session = await beginMirrorRepository(accessToken, config.repo, config.isPrivate);

  let copiedCounts: Record<string, number>;
  if (config.reconcileRequired) {
    copiedCounts = await listGreenkeepCommitCounts(
      accessToken,
      session.owner,
      session.repo,
      config.startDate,
      today,
    );
    await replaceCopiedCommitCounts(config.userId, copiedCounts);
  } else {
    copiedCounts = await getCopiedCommitCounts(config.userId);
  }

  const pending = buildSyncCommitSpecs(plan, copiedCounts);
  let parentSha = session.parentSha;
  for (let offset = 0; offset < pending.length; offset += COMMIT_BATCH_SIZE) {
    const batch = pending.slice(offset, offset + COMMIT_BATCH_SIZE);
    const result = await appendMirrorCommitsWithToken(
      accessToken,
      { ...session, parentSha },
      { name: config.commitName, email: config.commitEmail },
      batch,
    );
    parentSha = result.parentSha;
    copiedCounts = applyCommittedSpecs(copiedCounts, batch);
    const changedDays = Object.fromEntries(
      [...new Set(batch.map((spec) => spec.date))].map((day) => [day, copiedCounts[day] ?? 0]),
    );
    await upsertCopiedCommitCounts(config.userId, changedDays);
  }
  return pending.length;
}

const executionOperations = {
  synchronize,
  complete: (config: ClaimedPremiumSync) => completePremiumSync(config.userId, config.revision),
  pause: (config: ClaimedPremiumSync) => pausePremiumSyncForBilling(config.userId, config.revision),
  fail: (config: ClaimedPremiumSync, message: string) =>
    failPremiumSync(config.userId, config.revision, message),
  isPremiumRequired: (error: unknown) => error instanceof PremiumRequiredError,
};

export type PremiumSyncRunSummary = {
  claimed: number;
  completed: number;
  paused: number;
  failed: number;
  addedCommits: number;
};

export async function runDuePremiumSyncs(limit = 1): Promise<PremiumSyncRunSummary> {
  const summary: PremiumSyncRunSummary = {
    claimed: 0,
    completed: 0,
    paused: 0,
    failed: 0,
    addedCommits: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const config = await claimDuePremiumSync();
    if (!config) break;
    summary.claimed += 1;
    const result = await executePremiumSync(config, executionOperations);
    summary.addedCommits += result.addedCommits;
    if (result.outcome === "completed") {
      summary.completed += 1;
    } else if (result.outcome === "paused") {
      summary.paused += 1;
    } else {
      console.error("[premium-sync] run failed", result.error);
      summary.failed += 1;
    }
  }
  return summary;
}
