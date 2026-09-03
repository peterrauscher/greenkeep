import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getGithubAccessToken } from "@/lib/auth/github-token.server";
import { requireWriteEntitlement } from "@/lib/billing/verify.server";
import {
  appendMirrorCommitsWithToken,
  beginMirrorRepository,
  fetchGithubSourceCalendars,
  resolveGithubDestination,
} from "@/lib/github-api.server";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/);
export const fetchSourceCalendars = createServerFn({ method: "POST" })
  .validator(
    z.object({
      usernames: z.array(usernameSchema).min(1).max(8),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => fetchGithubSourceCalendars(data.usernames, data.from, data.to));

export const resolveDestination = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { accessToken } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    return resolveGithubDestination(accessToken);
  });

const commitSpec = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  iso: z.string(),
  message: z.string().min(1).max(200),
});

export const beginMirrorRepo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      repo: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9_.-]+$/),
      isPrivate: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireWriteEntitlement(context.userId);
    const { accessToken } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    return beginMirrorRepository(accessToken, data.repo, data.isPrivate);
  });

export const appendMirrorCommits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      owner: usernameSchema,
      repo: z.string().min(1).max(100),
      branch: z.string().min(1),
      parentSha: z.string().min(7),
      treeSha: z.string().min(7),
      name: z.string().min(1).max(100),
      email: z.email(),
      commits: z.array(commitSpec).min(1).max(40),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireWriteEntitlement(context.userId);
    const { accessToken } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    return appendMirrorCommitsWithToken(
      accessToken,
      {
        owner: data.owner,
        repo: data.repo,
        branch: data.branch,
        parentSha: data.parentSha,
        treeSha: data.treeSha,
      },
      { name: data.name, email: data.email },
      data.commits,
    );
  });
