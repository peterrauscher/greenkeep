import { calendarYearWindows, type DayCount, type SourceCalendar } from "./github";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Greenkeep/1.0";

export type GithubDestination = {
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string;
  emails: string[];
};

export type MirrorRepoSession = {
  owner: string;
  repo: string;
  branch: string;
  parentSha: string;
  treeSha: string;
  htmlUrl: string;
};

export type CommitSpec = {
  date: string;
  iso: string;
  message: string;
};

class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

function apiHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson<T>(
  url: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      ...apiHeaders(init.token),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }
  if (!response.ok) {
    let message = `GitHub error ${response.status}`;
    if (json && typeof json === "object" && "message" in json) {
      message = String(json.message);
    }
    throw new GithubApiError(response.status, message);
  }
  return json as T;
}

function parseContributionHtml(html: string): DayCount[] {
  const idToDay = new Map<string, { date: string; level: number }>();
  const dayPattern =
    /data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="(contribution-day-component-[^"]+)"[^>]*data-level="(\d+)"/g;
  for (const match of html.matchAll(dayPattern)) {
    idToDay.set(match[2]!, { date: match[1]!, level: Number(match[3] ?? 0) });
  }

  const counts = new Map<string, number>();
  const tooltipPattern = /for="(contribution-day-component-[^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  for (const match of html.matchAll(tooltipPattern)) {
    const body = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const day = idToDay.get(match[1]!);
    if (!day) continue;
    if (/^No contributions/i.test(body)) {
      counts.set(day.date, 0);
      continue;
    }
    const count = body.match(/^(\d+) contributions?/i);
    counts.set(day.date, count ? Number(count[1]) : day.level > 0 ? 1 : 0);
  }

  const days = [...idToDay.values()].map((day) => ({
    date: day.date,
    level: day.level,
    count: counts.get(day.date) ?? (day.level > 0 ? 1 : 0),
  }));
  days.sort((left, right) => left.date.localeCompare(right.date));
  return days;
}

async function fetchUserProfile(login: string, token?: string) {
  try {
    const user = await githubJson<{
      login: string;
      name: string | null;
      avatar_url: string;
    }>(`${GITHUB_API}/users/${encodeURIComponent(login)}`, { token });
    return { login: user.login, name: user.name, avatarUrl: user.avatar_url };
  } catch {
    return null;
  }
}

async function fetchCalendar(login: string, from: string, to: string): Promise<DayCount[]> {
  const days: DayCount[] = [];
  for (const window of calendarYearWindows(from, to)) {
    const url = `https://github.com/users/${encodeURIComponent(login)}/contributions?from=${window.from}&to=${window.to}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? `No GitHub user named ${login}`
          : `Could not load the contribution graph for ${login}`,
      );
    }
    const html = await response.text();
    days.push(...parseContributionHtml(html).filter((day) => day.date >= from && day.date <= to));
  }
  return days;
}

export async function fetchGithubSourceCalendars(
  usernames: string[],
  from: string,
  to: string,
): Promise<SourceCalendar[]> {
  if (from > to) throw new Error("Start date must be before end date");
  const unique = [...new Set(usernames.map((username) => username.toLowerCase()))];
  return Promise.all(
    unique.map(async (login) => {
      const profile = await fetchUserProfile(login);
      const handle = profile?.login ?? login;
      const days = await fetchCalendar(handle, from, to);
      return {
        login: handle,
        name: profile?.name ?? null,
        avatarUrl: profile?.avatarUrl ?? `https://avatars.githubusercontent.com/${handle}?s=80`,
        total: days.reduce((sum, day) => sum + day.count, 0),
        days,
      } satisfies SourceCalendar;
    }),
  );
}

export async function resolveGithubDestination(token: string): Promise<GithubDestination> {
  const user = await githubJson<{
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  }>(`${GITHUB_API}/user`, { token });

  let emails: { email: string; primary: boolean; verified: boolean }[] = [];
  try {
    emails = await githubJson(`${GITHUB_API}/user/emails`, { token });
  } catch {
    emails = [];
  }
  const verified = emails.filter((email) => email.verified);
  return {
    login: user.login,
    name: user.name ?? user.login,
    email: verified.find((email) => email.primary)?.email ?? verified[0]?.email ?? user.email,
    avatarUrl: user.avatar_url,
    emails: verified.map((email) => email.email),
  };
}

export async function beginMirrorRepository(
  token: string,
  repo: string,
  isPrivate: boolean,
): Promise<MirrorRepoSession> {
  const user = await githubJson<{ login: string }>(`${GITHUB_API}/user`, { token });
  const owner = user.login;
  let repoMeta: { default_branch: string; html_url: string };
  try {
    repoMeta = await githubJson(`${GITHUB_API}/repos/${owner}/${repo}`, { token });
  } catch (error) {
    if (!(error instanceof GithubApiError) || error.status !== 404) throw error;
    repoMeta = await githubJson(`${GITHUB_API}/user/repos`, {
      method: "POST",
      token,
      body: {
        name: repo,
        private: isPrivate,
        auto_init: true,
        description: "Work contribution history kept by Greenkeep",
      },
    });
  }

  const branch = repoMeta.default_branch || "main";
  const ref = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { token },
  );
  const commit = await githubJson<{ sha: string; tree: { sha: string } }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${ref.object.sha}`,
    { token },
  );
  return {
    owner,
    repo,
    branch,
    parentSha: commit.sha,
    treeSha: commit.tree.sha,
    htmlUrl: repoMeta.html_url,
  };
}

export async function appendMirrorCommitsWithToken(
  token: string,
  session: Pick<MirrorRepoSession, "owner" | "repo" | "branch" | "parentSha" | "treeSha">,
  author: { name: string; email: string },
  commits: CommitSpec[],
): Promise<{ parentSha: string }> {
  let parentSha = session.parentSha;
  for (const spec of commits) {
    const created = await githubJson<{ sha: string }>(
      `${GITHUB_API}/repos/${session.owner}/${session.repo}/git/commits`,
      {
        method: "POST",
        token,
        body: {
          message: spec.message,
          tree: session.treeSha,
          parents: [parentSha],
          author: { name: author.name, email: author.email, date: spec.iso },
          committer: { name: author.name, email: author.email, date: spec.iso },
        },
      },
    );
    parentSha = created.sha;
  }
  await githubJson(
    `${GITHUB_API}/repos/${session.owner}/${session.repo}/git/refs/heads/${session.branch}`,
    { method: "PATCH", token, body: { sha: parentSha } },
  );
  return { parentSha };
}

export async function listGreenkeepCommitCounts(
  token: string,
  owner: string,
  repo: string,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let page = 1; ; page += 1) {
    let commits: { commit: { message: string } }[];
    try {
      const query = new URLSearchParams({
        since: `${from}T00:00:00Z`,
        until: `${to}T23:59:59Z`,
        per_page: "100",
        page: String(page),
      });
      commits = await githubJson(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query}`,
        { token },
      );
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 404) return {};
      throw error;
    }

    for (const item of commits) {
      const match = item.commit.message.match(/^chore: graph (\d{4}-\d{2}-\d{2})(?:\s|$)/);
      const day = match?.[1];
      if (day && day >= from && day <= to) counts[day] = (counts[day] ?? 0) + 1;
    }
    if (commits.length < 100) return counts;
  }
}
