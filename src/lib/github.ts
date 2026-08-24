export const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export type IntensityMode = "days" | "levels" | "counts";

export type DayCount = {
  date: string;
  count: number;
  level: number;
};

export type SourceCalendar = {
  login: string;
  name: string | null;
  avatarUrl: string;
  total: number;
  days: DayCount[];
};

export type CommitPlanItem = {
  date: string;
  commits: number;
};

export function isGithubUsername(value: string): boolean {
  return GITHUB_USERNAME_RE.test(value.trim());
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

export function addDays(value: string, days: number): string {
  const d = parseIsoDate(value);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 364);
  return { from: isoDate(from), to: isoDate(to) };
}

export function calendarYearWindows(from: string, to: string): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    const yearEnd = `${start.slice(0, 4)}-12-31`;
    const end = yearEnd < to ? yearEnd : to;
    windows.push({ from: start, to: end });
    if (end === to) break;
    start = `${String(Number(start.slice(0, 4)) + 1).padStart(4, "0")}-01-01`;
  }
  return windows;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function weekdayIndex(date: string): number {
  return parseIsoDate(date).getDay();
}

export function mergeCalendars(calendars: SourceCalendar[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const cal of calendars) {
    for (const day of cal.days) {
      map[day.date] = (map[day.date] ?? 0) + day.count;
    }
  }
  return map;
}

export function countsToLevels(counts: Record<string, number>): Record<string, number> {
  const values = Object.values(counts)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    const empty: Record<string, number> = {};
    for (const k of Object.keys(counts)) empty[k] = 0;
    return empty;
  }
  const q = (p: number) =>
    values[Math.min(values.length - 1, Math.floor(p * (values.length - 1)))] ?? 0;
  const q1 = q(0.25);
  const q2 = q(0.5);
  const q3 = q(0.75);
  const levels: Record<string, number> = {};
  for (const [date, count] of Object.entries(counts)) {
    if (count <= 0) levels[date] = 0;
    else if (count <= q1) levels[date] = 1;
    else if (count <= q2) levels[date] = 2;
    else if (count <= q3) levels[date] = 3;
    else levels[date] = 4;
  }
  return levels;
}

const LEVEL_COMMITS = [0, 1, 2, 4, 8] as const;

export function planCommits(
  counts: Record<string, number>,
  mode: IntensityMode,
  from: string,
  to: string,
): CommitPlanItem[] {
  const days = eachDay(from, to);
  if (mode === "days") {
    return days
      .map((date) => ({ date, commits: (counts[date] ?? 0) > 0 ? 1 : 0 }))
      .filter((d) => d.commits > 0);
  }
  if (mode === "levels") {
    const filled: Record<string, number> = {};
    for (const date of days) filled[date] = counts[date] ?? 0;
    const levels = countsToLevels(filled);
    return days
      .map((date) => ({ date, commits: LEVEL_COMMITS[levels[date] ?? 0] ?? 0 }))
      .filter((d) => d.commits > 0);
  }
  return days
    .map((date) => ({
      date,
      commits: counts[date] ?? 0,
    }))
    .filter((d) => d.commits > 0);
}

export function totalPlanned(plan: CommitPlanItem[]): number {
  return plan.reduce((sum, d) => sum + d.commits, 0);
}

export function activeDays(plan: CommitPlanItem[]): number {
  return plan.length;
}

export function formatDayLabel(date: string): string {
  return parseIsoDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function monthLabel(date: string): string {
  return parseIsoDate(date).toLocaleDateString("en-US", { month: "short" });
}

export function buildWeeks(from: string, to: string): string[][] {
  const days = eachDay(from, to);
  if (days.length === 0) return [];
  const first = days[0]!;
  const lead = weekdayIndex(first);
  const padded: (string | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  const weeks: string[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    const chunk = padded.slice(i, i + 7);
    while (chunk.length < 7) chunk.push(null);
    weeks.push(chunk.map((d) => d ?? ""));
  }
  return weeks;
}

export function generateBashScript(opts: {
  owner: string;
  repo: string;
  name: string;
  email: string;
  plan: CommitPlanItem[];
}): string {
  const lines: string[] = [
    "#!/usr/bin/env bash",
    "# Greenkeep — empty, backdated commits for a private GitHub repo.",
    "# Usage: bash greenkeep.sh",
    "# Requires git. Create the empty private repo on GitHub first, then push.",
    "set -euo pipefail",
    "",
    `OWNER=${shellQuote(opts.owner)}`,
    `REPO=${shellQuote(opts.repo)}`,
    `GIT_AUTHOR_NAME=${shellQuote(opts.name)}`,
    `GIT_AUTHOR_EMAIL=${shellQuote(opts.email)}`,
    'GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"',
    'GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"',
    "export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL",
    "",
    'DIR="$(mktemp -d /tmp/greenkeep.XXXXXX)"',
    'cd "$DIR"',
    "git init -b main",
    'echo "# $REPO" > README.md',
    'echo "Work contribution history kept by Greenkeep." >> README.md',
    "git add README.md",
    'git commit -m "chore: init greenkeep history"',
    "",
  ];

  for (const item of opts.plan) {
    for (let i = 0; i < item.commits; i++) {
      const hour = String(10 + (i % 12)).padStart(2, "0");
      const minute = String((i * 3) % 60).padStart(2, "0");
      const stamp = `${item.date}T${hour}:${minute}:00`;
      lines.push(
        `GIT_AUTHOR_DATE="${stamp}" GIT_COMMITTER_DATE="${stamp}" git commit --allow-empty -m "chore: graph ${item.date}"`,
      );
    }
  }

  lines.push(
    "",
    'echo "Created $(git rev-list --count HEAD) commits in $DIR"',
    'echo "Create a private repo named $REPO on GitHub, then:"',
    'echo "  git remote add origin git@github.com:$OWNER/$REPO.git"',
    'echo "  git push -u origin main"',
    "",
  );
  return lines.join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function intensityLabel(mode: IntensityMode): string {
  if (mode === "days") return "One commit per active day";
  if (mode === "levels") return "Same shade of green, not necessarily the same commit count";
  return "One commit per contribution";
}
