# Greenkeep

![Greenkeep](banner.jpg)

Your work graph, on your own profile.

Greenkeep copies a work GitHub history onto your personal account with private backdated commits. The counts come over. The code stays at work.

## It is a vanity metric. But employers still care.

Hiring managers do look at the grass. When your real work happens on a company org, your personal profile looks empty through no fault of your own. Greenkeep fixes that.

## Three moves and the graph is yours

1. **Connect.** Point Greenkeep at the work usernames whose history should follow you. Nothing is written to work repos.
2. **Preview.** See the merged year before anything is written. Pick the date range and how dark the squares get.
3. **Keep.** Write once with a script, or turn on the nightly sync and new work days copy over on their own.

## Private by design

Greenkeep writes empty commits with backdated authorship into a private repo on your personal account. No code leaves work. Use it for accounts you own.

## Plans

- **Free.** Read and merge contribution history, preview the graph.
- **One-time.** Manual GitHub writes and the local script.
- **Monthly.** Everything above, plus automatic nightly sync.

## How it was built

Greenkeep is a TanStack Start app (React + Vite) with GitHub OAuth sign-in. It reads contribution calendars through the GitHub API, payments run through RevenueCat, and a small scheduled worker keeps monthly subscribers in sync.
