# Graph Copier

Web app that copies GitHub contribution graphs from other accounts onto a private repo using backdated mock commits.

This is the app successor to the original `commit-graph-copier` idea: paste source GitHub usernames, preview the merged graph, then write empty backdated commits to a private repo so GitHub paints the same squares on your profile.

## Stack

- TanStack Start + React + Vite
- Better Auth (`/api/auth/*`) with Google and X via the Grok auth broker
- GitHub REST API for graphs, repo create, and git commits

## Auth today

Header **Log In** / **Sign Up** opens a dialog. OAuth options are **Google** and **X**. Writing commits still needs a GitHub personal access token (repo scope) in the Copy-to panel, because Google/X sign-in does not grant GitHub write access.

## Run

```bash
npm install
npm run dev
```

App listens on port 8080.

## Write path

Server functions in `src/lib/github-fn.ts` fetch contribution calendars, create/reuse a private repo, and append empty commits. Destination identity comes from the GitHub token (`/user` + `/user/emails`).
