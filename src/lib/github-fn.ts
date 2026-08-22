import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DayCount, SourceCalendar } from "@/lib/github";

const GITHUB_API = "https://api.github.com";
const UA = "GraphCopier/1.0";

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

function levelFromGraphql(level: string): number {
  switch (level) {
    case "FIRST_QUARTILE":
      return 1;
    case "SECOND_QUARTILE":
      return 2;
    case "THIRD_QUARTILE":
      return 3;
    case "FOURTH_QUARTILE":
      return 4;
    default:
      return 0;
  }
}

function yearWindows(from: string, to: string): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 364);
    const end = endDate.toISOString().slice(0, 10);
    const clamped = end < to ? end : to;
    windows.push({ from: start, to: clamped });
    const next = new Date(`${clamped}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }
  return windows;
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
  const tipRe =
    /for="(contribution-day-component-[^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
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

async function fetchCalendarGraphql(
  login: string,
  from: string,
  to: string,
  token: string,
): Promise<DayCount[] | null> {
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;
  const windows = yearWindows(from, to);
  const all: DayCount[] = [];
  for (const win of windows) {
    const res = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: {
        ...apiHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          login,
          from: `${win.from}T00:00:00Z`,
          to: `${win.to}T23:59:59Z`,
        },
      }),
    });
    const body = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              weeks: {
                contributionDays: {
                  date: string;
                  contributionCount: number;
                  contributionLevel: string;
                }[];
              }[];
            };
          };
        };
      };
      errors?: { message: string }[];
    };
    if (!res.ok || body.errors?.length || !body.data?.user) {
      return null;
    }
    const weeks =
      body.data.user.contributionsCollection?.contributionCalendar?.weeks ?? [];
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        if (day.date < from || day.date > to) continue;
        all.push({
          date: day.date,
          count: day.contributionCount,
          level: levelFromGraphql(day.contributionLevel),
        });
      }
    }
  }
  return all;
}

async function fetchCalendarHtml(
  login: string,
  from: string,
  to: string,
): Promise<DayCount[]> {
  const windows = yearWindows(from, to);
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
    const days = parseContributionHtml(html).filter(
      (d) => d.date >= from && d.date <= to,
    );
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
      token: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SourceCalendar[]> => {
    if (data.from > data.to) {
      throw new Error("Start date must be before end date");
    }
    const unique = [...new Set(data.usernames.map((u) => u.toLowerCase()))];
    const results = await Promise.all(
      unique.map(async (login) => {
        const profile = data.token
          ? await fetchUserProfile(login, data.token)
          : null;
        const handle = profile?.login ?? login;
        let days: DayCount[] | null = null;
        if (data.token) {
          days = await fetchCalendarGraphql(
            handle,
            data.from,
            data.to,
            data.token,
          );
        }
        if (!days) {
          days = await fetchCalendarHtml(handle, data.from, data.to);
        }
        const total = days.reduce((sum, d) => sum + d.count, 0);
        return {
          login: handle,
          name: profile?.name ?? null,
          avatarUrl:
            profile?.avatarUrl ??
            `https://avatars.githubusercontent.com/${handle}?s=80`,
          total,
          days,
        } satisfies SourceCalendar;
      }),
    );
    return results;
  });

export const resolveDestination = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(8) }))
  .handler(async ({ data }) => {
    const user = await ghJson<{
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
    }>(`${GITHUB_API}/user`, { token: data.token });

    let emails: { email: string; primary: boolean; verified: boolean }[] = [];
    try {
      emails = await ghJson(`${GITHUB_API}/user/emails`, { token: data.token });
    } catch {
      emails = [];
    }
    const verified = emails.filter((e) => e.verified);
    const email =
      verified.find((e) => e.primary)?.email ??
      verified[0]?.email ??
      user.email;

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
  .validator(
    z.object({
      token: z.string().min(8),
      repo: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9_.-]+$/),
      isPrivate: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await ghJson<{ login: string }>(`${GITHUB_API}/user`, {
      token: data.token,
    });
    const owner = user.login;
    let repoMeta: { default_branch: string; html_url: string } | null = null;
    try {
      repoMeta = await ghJson(
        `${GITHUB_API}/repos/${owner}/${data.repo}`,
        { token: data.token },
      );
    } catch {
      repoMeta = await ghJson(`${GITHUB_API}/user/repos`, {
        method: "POST",
        token: data.token,
        body: {
          name: data.repo,
          private: data.isPrivate,
          auto_init: true,
          description: "Private contribution mirror generated by Graph Copier",
        },
      });
    }
    const branch = repoMeta?.default_branch ?? "main";
    const ref = await ghJson<{
      object: { sha: string };
    }>(`${GITHUB_API}/repos/${owner}/${data.repo}/git/ref/heads/${branch}`, {
      token: data.token,
    });
    const commit = await ghJson<{
      sha: string;
      tree: { sha: string };
    }>(`${GITHUB_API}/repos/${owner}/${data.repo}/git/commits/${ref.object.sha}`, {
      token: data.token,
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
  .validator(
    z.object({
      token: z.string().min(8),
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
  .handler(async ({ data }) => {
    let parentSha = data.parentSha;
    for (const spec of data.commits) {
      const created = await ghJson<{ sha: string }>(
        `${GITHUB_API}/repos/${data.owner}/${data.repo}/git/commits`,
        {
          method: "POST",
          token: data.token,
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
    await ghJson(
      `${GITHUB_API}/repos/${data.owner}/${data.repo}/git/refs/heads/${data.branch}`,
      {
        method: "PATCH",
        token: data.token,
        body: { sha: parentSha },
      },
    );
    return { parentSha };
  });
