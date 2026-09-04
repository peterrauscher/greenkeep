import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Github,
  Heart,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Share,
  WandSparkles,
} from "lucide-react";
import { ContributionGraph } from "@/components/contribution-graph";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({ component: Landing });

const COUNTS: Record<string, number> = {
  "2025-09-08": 4,
  "2025-09-09": 7,
  "2025-09-15": 2,
  "2025-09-16": 6,
  "2025-09-17": 9,
  "2025-09-22": 3,
  "2025-09-24": 8,
  "2025-10-01": 5,
  "2025-10-06": 7,
  "2025-10-13": 4,
  "2025-10-20": 6,
  "2025-10-27": 9,
  "2025-11-03": 5,
  "2025-11-10": 8,
  "2025-11-17": 3,
  "2025-12-01": 6,
  "2025-12-08": 7,
  "2026-01-12": 5,
  "2026-02-02": 9,
};

function Landing() {
  return (
    <main className="bg-background text-foreground">
      <header className="border-b border-border">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <p className="font-brand text-sm font-bold tracking-[0.18em] uppercase">Greenkeep</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/app"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition active:translate-y-[1px]"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-24 pb-16 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl leading-none font-semibold tracking-tighter md:text-5xl lg:text-6xl">
            Your work graph, on your own profile.
          </h1>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
            Greenkeep copies a work GitHub history onto your personal account with private backdated
            commits.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition active:translate-y-[1px]"
            >
              Make history <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition active:translate-y-[1px]"
            >
              <Github className="size-4" /> Continue with GitHub
            </Link>
          </div>
        </div>
        <div className="rounded-xl bg-card p-5 ring-1 ring-border">
          <p className="font-mono text-xs text-muted-foreground">octocat / greenkeep</p>
          <ContributionGraph from="2025-09-01" to="2026-03-01" counts={COUNTS} className="mt-3" />
          <p className="mt-3 text-sm text-muted-foreground">
            What your personal profile looks like after a mirror. The commits are empty and private.
          </p>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="mx-auto max-w-[24ch] text-center text-3xl font-semibold tracking-tighter">
            It is a vanity metric. But employers still care.
          </h2>
          <p className="mx-auto mt-2 max-w-[55ch] text-center text-base leading-relaxed text-muted-foreground">
            Hiring managers do look at the grass. This post passed 340K views in a day.
          </p>
          <figure className="mx-auto mt-8 max-w-xl rounded-2xl bg-card p-5 ring-1 ring-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/tweet/kyle.jpg"
                  alt="Kyle Finken profile photo"
                  width={48}
                  height={48}
                  loading="lazy"
                  className="size-12 rounded-full object-cover"
                />
                <div>
                  <p className="flex items-center gap-1 font-semibold tracking-tight">
                    Kyle Finken <BadgeCheck className="size-4 text-sky-500" />
                  </p>
                  <p className="text-sm text-muted-foreground">@KyleFinken</p>
                </div>
              </div>
              <a
                href="https://x.com/KyleFinken/status/2089789887734259774"
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Open the original post on X"
              >
                View on X
              </a>
            </div>
            <blockquote className="mt-3 text-[17px] leading-snug">
              if your github grass looks anything like this DM me and I will personally guarantee
              you an interview
            </blockquote>
            <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-border">
              <img
                src="/tweet/grass.png"
                alt="Kyle Finken's GitHub contribution graph showing 4,821 contributions in the last year"
                width={1200}
                height={327}
                loading="lazy"
                className="h-auto w-full object-cover"
              />
            </div>
            <div className="mt-3 rounded-xl ring-1 ring-border">
              <div className="flex items-center gap-2 px-3 pt-3">
                <img
                  src="/tweet/mintlify.jpg"
                  alt="Mintlify profile photo"
                  width={24}
                  height={24}
                  loading="lazy"
                  className="size-6 rounded-full object-cover"
                />
                <p className="text-sm">
                  <span className="font-semibold">Mintlify</span>{" "}
                  <BadgeCheck className="inline size-4 text-amber-400" />{" "}
                  <span className="text-muted-foreground">@mintlify · Aug 18</span>
                </p>
              </div>
              <p className="px-3 pt-1 text-[15px]">we&apos;re hiring across sf &amp; ny</p>
              <pre className="px-3 py-3 font-mono text-[15px] leading-relaxed">
                {
                  "┏━━━━━━━━━━━━━━━━━━━━━━━┓\n┃ Applied AI Engineer   ┃\n┃ Product Engineer      ┃\n┃ Forward Deployed Eng  ┃"
                }
              </pre>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              12:01 PM · Aug 18, 2026 ·{" "}
              <span className="font-semibold text-foreground">346.6K</span> Views
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MessageCircle className="size-4" strokeWidth={1.5} /> 483
              </span>
              <span className="flex items-center gap-1.5">
                <Repeat2 className="size-4" strokeWidth={1.5} /> 81
              </span>
              <span className="flex items-center gap-1.5">
                <Heart className="size-4" strokeWidth={1.5} /> 2K
              </span>
              <span className="flex items-center gap-1.5">
                <Bookmark className="size-4" strokeWidth={1.5} /> 794
              </span>
              <Share className="size-4" strokeWidth={1.5} />
            </div>
          </figure>
        </div>
      </section>
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 pt-16 text-center">
          <h2 className="mx-auto max-w-[24ch] text-3xl font-semibold tracking-tighter">
            Three moves and the graph is yours.
          </h2>
          <p className="mx-auto mt-2 max-w-[65ch] text-base leading-relaxed text-muted-foreground">
            Nothing gets installed at work. You read the history, check how it looks, then write it
            to a repo you own.
          </p>
        </div>
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3">
          <div className="flex aspect-square flex-col items-center justify-center rounded-xl bg-card px-8 ring-1 ring-border">
            <Github className="mx-auto size-9" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-medium tracking-tight">Connect</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Point Greenkeep at the work usernames whose history should follow you. Nothing is
              written to work repos.
            </p>
          </div>
          <div className="flex aspect-square flex-col items-center justify-center rounded-xl bg-card px-8 ring-1 ring-border md:mt-8">
            <WandSparkles className="mx-auto size-9" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-medium tracking-tight">Preview</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              See the merged year before anything is written. Pick the date range and how dark the
              squares get.
            </p>
          </div>
          <div className="flex aspect-square flex-col items-center justify-center rounded-xl bg-card px-8 ring-1 ring-border">
            <RefreshCw className="mx-auto size-9" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-medium tracking-tight">Keep</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Write once with a script, or turn on the nightly sync and new work days copy over on
              their own.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-16 text-center">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5" /> Private by design
          </p>
          <h2 className="mx-auto max-w-[20ch] text-3xl font-semibold tracking-tighter">
            Empty commits. No code leaves work.
          </h2>
          <p className="mx-auto max-w-[65ch] text-base leading-relaxed text-muted-foreground">
            Greenkeep writes empty commits with backdated authorship into a private repo on your
            personal account. The counts come over. The code stays at work.
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition active:translate-y-[1px]"
          >
            Open the tool <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 text-sm text-muted-foreground">
          <p className="font-brand text-xs font-bold tracking-[0.18em] uppercase">Greenkeep</p>
          <Link to="/login" className="hover:text-foreground">
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
