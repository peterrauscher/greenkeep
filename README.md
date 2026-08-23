# Greenkeep

![Greenkeep](banner.jpg)

Bring a work GitHub contribution graph onto your personal account.

Work stays on the company org. Greenkeep reads that public calendar, then writes empty, backdated commits to a private repo on the account you sign in with. GitHub paints the squares there.

Use it for accounts you own.

## Stack

- TanStack Start + React + Vite
- Better Auth (`/api/auth/*`) with Sign in with GitHub (`repo` + `user:email`)
- GitHub REST API for graphs, repo create, and git commits

## Auth today

Header **Log In** / **Sign Up** both open the same dialog. The only button is **Continue with GitHub**. After sign-in the GitHub access token is stored on the Better Auth account and used server-side to create the private repo. There is no client PAT field.

## Run

```bash
npm install
npm run dev
```

App listens on port 8080.

## Write path

Server functions in `src/lib/github-fn.ts` fetch contribution calendars, create/reuse a private repo, and append empty commits. Destination identity comes from the signed-in GitHub user (`/user` + `/user/emails`). Writes fail closed if the grant lacks `repo`. Sign-out wipes the stored GitHub token.
