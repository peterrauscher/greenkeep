import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
import { getGithubAccessToken } from "./auth/github-token.server";
import { requirePremiumEntitlement } from "./billing/verify.server";
import { GITHUB_USERNAME_RE } from "./github";
import { resolveGithubDestination } from "./github-api.server";
import {
  disablePremiumSync as disableStoredPremiumSync,
  resumePremiumSync as resumeStoredPremiumSync,
  getPremiumSyncStatus as getStoredPremiumSyncStatus,
  savePremiumSync as saveStoredPremiumSync,
} from "./premium-sync-store.server";

const syncConfigSchema = z.object({
  sourceUsernames: z
    .array(z.string().trim().min(1).max(39).regex(GITHUB_USERNAME_RE))
    .min(1)
    .max(8),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repo: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  commitEmail: z.email(),
  intensity: z.enum(["days", "levels", "counts"]),
  isPrivate: z.boolean(),
});

export const getPremiumSync = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => getStoredPremiumSyncStatus(context.userId));

export const savePremiumSync = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(syncConfigSchema)
  .handler(async ({ data, context }) => {
    await requirePremiumEntitlement(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const earliest = new Date();
    earliest.setUTCFullYear(earliest.getUTCFullYear() - 5);
    const earliestDate = earliest.toISOString().slice(0, 10);
    if (data.startDate > today) throw new Error("Automatic sync cannot start in the future");
    if (data.startDate < earliestDate) {
      throw new Error("Automatic sync can backfill up to five years");
    }

    const { accessToken } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    const destination = await resolveGithubDestination(accessToken);
    const commitEmail = data.commitEmail.trim();
    if (!destination.emails.some((email) => email.toLowerCase() === commitEmail.toLowerCase())) {
      throw new Error("Use a verified email from your GitHub account");
    }

    return saveStoredPremiumSync({
      userId: context.userId,
      sourceUsernames: [...new Set(data.sourceUsernames.map((username) => username.toLowerCase()))],
      startDate: data.startDate,
      repo: data.repo,
      commitName: destination.name,
      commitEmail,
      intensity: data.intensity,
      isPrivate: data.isPrivate,
    });
  });

export const disablePremiumSync = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(({ context }) => disableStoredPremiumSync(context.userId));

export const resumePremiumSync = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requirePremiumEntitlement(context.userId);
    return resumeStoredPremiumSync(context.userId);
  });
