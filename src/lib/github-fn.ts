import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getGithubAccessToken } from "@/lib/auth/github-token.server";
import { calendarYearWindows, type DayCount, type SourceCalendar } from "@/lib/github";

const GITHUB_API = "https://api.github.com";
const UA = "Greenkeep/1.0";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/);

type GhHeaders = Record<string, string>;

function apiHeaders(token?: string): GhHeaders {
  const headers: GhHeaders = {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghJson<T>(
  url: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      ...apiHeaders(init.token),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : `GitHub error ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}

function parseContributionHtml(html: string): DayCount[] {
  const idToDay = new Map<string, { date: string; level: number }>();
  const dayRe =
    /data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="(contribution-day-component-[^"]+)"[^>]*data-level="(\d+)"/g;
  for (const match of html.matchAll(dayRe)) {
    const date = match[1]!;
    const id = match[2]!;
    const level = Number(match[3] ?? 0);
    idToDay.set(id, { date, level });
  }

  const counts = new Map<string, number>();
  const tipRe = /for="(contribution-day-component-[^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  for (const match of html.matchAll(tipRe)) {
    const id = match[1]!;
    const body = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const day = idToDay.get(id);
    if (!day) continue;
    if (/^No contributions/i.test(body)) {
      counts.set(day.date, 0);
      continue;
    }
    const n = body.match(/^(\d+) contributions?/i);
    counts.set(day.date, n ? Number(n[1]) : day.level > 0 ? 1 : 0);
  }

  const days: DayCount[] = [];
  for (const [, day] of idToDay) {
    const count = counts.get(day.date);
    days.push({
      date: day.date,
      level: day.level,
      count: count ?? (day.level > 0 ? 1 : 0),
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

async function fetchUserProfile(login: string, token?: string) {
  try {
    const user = await ghJson<{
      login: string;
      name: string | null;
      avatar_url: string;
    }>(`${GITHUB_API}/users/${encodeURIComponent(login)}`, { token });
    return {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
    };
  } catch {
    return null;
  }
}

async function fetchCalendarHtml(login: string, from: string, to: string): Promise<DayCount[]> {
  const windows = calendarYearWindows(from, to);
  const all: DayCount[] = [];
  for (const win of windows) {
    const url = `https://github.com/users/${encodeURIComponent(login)}/contributions?from=${win.from}&to=${win.to}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? `No GitHub user named ${login}`
          : `Could not load the contribution graph for ${login}`,
      );
    }
    const html = await res.text();
    const days = parseContributionHtml(html).filter((d) => d.date >= from && d.date <= to);
    all.push(...days);
  }
  return all;
}

export const fetchSourceCalendars = createServerFn({ method: "POST" })
  .validator(
    z.object({
      usernames: z.array(usernameSchema).min(1).max(8),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }): Promise<SourceCalendar[]> => {
    if (data.from > data.to) {
      throw new Error("Start date must be before end date");
    }
    const unique = [...new Set(data.usernames.map((u) => u.toLowerCase()))];
    const results = await Promise.all(
      unique.map(async (login) => {
        const profile = await fetchUserProfile(login);
        const handle = profile?.login ?? login;
        const days = await fetchCalendarHtml(handle, data.from, data.to);
        const total = days.reduce((sum, d) => sum + d.count, 0);
        return {
          login: handle,
          name: profile?.name ?? null,
          avatarUrl: profile?.avatarUrl ?? `https://avatars.githubusercontent.com/${handle}?s=80`,
          total,
          days,
        } satisfies SourceCalendar;
      }),
    );
    return results;
  });

export const resolveDestination = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { accessToken: token } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    const user = await ghJson<{
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
    }>(`${GITHUB_API}/user`, { token });

    let emails: { email: string; primary: boolean; verified: boolean }[] = [];
    try {
      emails = await ghJson(`${GITHUB_API}/user/emails`, { token });
    } catch {
      emails = [];
    }
    const verified = emails.filter((e) => e.verified);
    const email = verified.find((e) => e.primary)?.email ?? verified[0]?.email ?? user.email;

    return {
      login: user.login,
      name: user.name ?? user.login,
      email,
      avatarUrl: user.avatar_url,
      emails: verified.map((e) => e.email),
    };
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
    const { accessToken: token } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    const user = await ghJson<{ login: string }>(`${GITHUB_API}/user`, {
      token,
    });
    const owner = user.login;
    let repoMeta: { default_branch: string; html_url: string } | null = null;
    try {
      repoMeta = await ghJson(`${GITHUB_API}/repos/${owner}/${data.repo}`, { token });
    } catch {
      repoMeta = await ghJson(`${GITHUB_API}/user/repos`, {
        method: "POST",
        token,
        body: {
          name: data.repo,
          private: data.isPrivate,
          auto_init: true,
          description: "Work contribution history kept by Greenkeep",
        },
      });
    }
    const branch = repoMeta?.default_branch ?? "main";
    const ref = await ghJson<{
      object: { sha: string };
    }>(`${GITHUB_API}/repos/${owner}/${data.repo}/git/ref/heads/${branch}`, {
      token,
    });
    const commit = await ghJson<{
      sha: string;
      tree: { sha: string };
    }>(`${GITHUB_API}/repos/${owner}/${data.repo}/git/commits/${ref.object.sha}`, {
      token,
    });
    return {
      owner,
      repo: data.repo,
      branch,
      parentSha: commit.sha,
      treeSha: commit.tree.sha,
      htmlUrl: repoMeta?.html_url ?? `https://github.com/${owner}/${data.repo}`,
    };
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
    const { accessToken: token } = await getGithubAccessToken({
      bearerToken: context.bearerToken,
    });
    let parentSha = data.parentSha;
    for (const spec of data.commits) {
      const created = await ghJson<{ sha: string }>(
        `${GITHUB_API}/repos/${data.owner}/${data.repo}/git/commits`,
        {
          method: "POST",
          token,
          body: {
            message: spec.message,
            tree: data.treeSha,
            parents: [parentSha],
            author: {
              name: data.name,
              email: data.email,
              date: spec.iso,
            },
            committer: {
              name: data.name,
              email: data.email,
              date: spec.iso,
            },
          },
        },
      );
      parentSha = created.sha;
    }
    await ghJson(`${GITHUB_API}/repos/${data.owner}/${data.repo}/git/refs/heads/${data.branch}`, {
      method: "PATCH",
      token,
      body: { sha: parentSha },
    });
    return { parentSha };
  });
