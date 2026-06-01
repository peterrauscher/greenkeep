# commit-graph-copier

Creates mock commits so your GitHub contribution graph can mirror another account (for example, when work uses a separate GitHub account).

## Requirements

- Python 3.10+
- `git`
- GitHub CLI (`gh`) authenticated with the account you want to populate:
  - `gh auth login`

## Usage

Run inside a git repository you want to use for mirror commits:

```bash
python3 commit_graph_copier.py \
  --source-user SOURCE_GITHUB_USERNAME \
  --start-date 2025-01-01 \
  --end-date 2025-12-31
```

Useful options:

- `--dry-run`: print what would be committed without creating commits
- `--max-commits-per-day N`: cap mirrored commits per day
- `--allow-dirty`: allow running with uncommitted changes present

After generating commits, push your branch to GitHub for contributions to appear on your graph.
