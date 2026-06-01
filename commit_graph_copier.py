#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path


GRAPHQL_QUERY = """
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
"""

MAX_SECONDS_OFFSET_IN_DAY = 86399
MIDDAY_SECONDS = 12 * 60 * 60
MARKER_FILE_NAME = ".commit_graph_copier"


def run(
    command: list[str],
    cwd: Path | None = None,
    check: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=cwd, check=check, text=True, capture_output=True, env=env)


def require_gh_auth() -> None:
    status = run(["gh", "auth", "status"], check=False)
    if status.returncode != 0:
        raise SystemExit("GitHub CLI is not authenticated. Run: gh auth login")


def fetch_contribution_counts_by_date(source_user: str, start_date: dt.date, end_date: dt.date) -> dict[str, int]:
    variables = {
        "login": source_user,
        "from": f"{start_date.isoformat()}T00:00:00Z",
        "to": f"{end_date.isoformat()}T23:59:59Z",
    }
    response = run(
        [
            "gh",
            "api",
            "graphql",
            "-f",
            f"query={GRAPHQL_QUERY}",
            "-f",
            f"variables={json.dumps(variables)}",
        ]
    )
    payload = json.loads(response.stdout)
    errors = payload.get("errors")
    if errors:
        message = errors[0].get("message", "Unknown GitHub GraphQL error; check gh auth status and network access")
        raise SystemExit(f"GitHub GraphQL query failed: {message}")

    user = payload.get("data", {}).get("user")
    if user is None:
        raise SystemExit(f"Could not resolve GitHub user '{source_user}' from GraphQL response.")

    days: dict[str, int] = {}
    for week in user["contributionsCollection"]["contributionCalendar"]["weeks"]:
        for day in week["contributionDays"]:
            days[day["date"]] = int(day["contributionCount"])
    return days


def ensure_git_repo(repo_path: Path) -> None:
    run(["git", "rev-parse", "--is-inside-work-tree"], cwd=repo_path)


def ensure_clean_worktree(repo_path: Path) -> None:
    status = run(["git", "status", "--porcelain"], cwd=repo_path)
    if status.stdout.strip():
        raise SystemExit("Repository has uncommitted changes. Commit or stash them, or use --allow-dirty.")


def create_mock_commits(
    repo_path: Path,
    counts: dict[str, int],
    max_commits_per_day: int | None,
    dry_run: bool,
) -> int:
    marker_path = repo_path / MARKER_FILE_NAME
    created = 0
    for date_str in sorted(counts.keys()):
        count = counts[date_str]
        if max_commits_per_day is not None:
            count = min(count, max_commits_per_day)
        if count <= 0:
            continue

        for i in range(1, count + 1):
            if count == 1:
                seconds_offset = MIDDAY_SECONDS
            else:
                seconds_offset = int(((i - 1) * MAX_SECONDS_OFFSET_IN_DAY) / (count - 1))
            hour = seconds_offset // 3600
            minute = (seconds_offset % 3600) // 60
            second = seconds_offset % 60
            timestamp = f"{date_str}T{hour:02d}:{minute:02d}:{second:02d}"
            message = f"mirror: graph {date_str} ({i}/{count})"
            if dry_run:
                print(f"[dry-run] {timestamp} {message}")
                created += 1
                continue

            with marker_path.open("a", encoding="utf-8") as marker:
                marker.write(f"{timestamp} {message}\n")

            run(["git", "add", marker_path.name], cwd=repo_path)
            env = {
                **os.environ,
                "GIT_AUTHOR_DATE": timestamp,
                "GIT_COMMITTER_DATE": timestamp,
            }
            run(["git", "commit", "-m", message], cwd=repo_path, env=env)
            created += 1

    return created


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mirror another GitHub user's contribution graph with mock local commits."
    )
    parser.add_argument("--source-user", required=True, help="GitHub username to mirror")
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Path to a git repository where mock commits will be created",
    )
    parser.add_argument(
        "--start-date",
        required=True,
        help="Start date in YYYY-MM-DD format",
    )
    parser.add_argument(
        "--end-date",
        required=True,
        help="End date in YYYY-MM-DD format",
    )
    parser.add_argument(
        "--max-commits-per-day",
        type=int,
        default=None,
        help="Cap the number of mirrored commits created for each day",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Allow running even when the repository has uncommitted changes",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned commits without creating any commits",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_path = Path(args.repo_path).resolve()

    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)
    if end_date < start_date:
        raise SystemExit("--end-date must be on or after --start-date")

    require_gh_auth()
    ensure_git_repo(repo_path)
    if not args.allow_dirty:
        ensure_clean_worktree(repo_path)

    counts = fetch_contribution_counts_by_date(args.source_user, start_date, end_date)
    created = create_mock_commits(repo_path, counts, args.max_commits_per_day, args.dry_run)
    print(f"Created {created} mock commits.")
    if not args.dry_run:
        print("Push your branch to GitHub to update your contribution graph.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
