import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Briefcase,
  Check,
  Clock,
  FileText,
  GitBranch,
  Github,
  Heart,
  Layers,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Share,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ContributionGraph } from "@/components/contribution-graph";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GITHUB_PROVIDER_ID, authEnabled, signIn } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Landing });

// Realistic commit dataset for 2025-09-01 to 2026-03-01:
// Personal profile baseline (personal only: 13 contributions across 6 months)
const PERSONAL_COUNTS: Record<string, number> = {
  "2025-09-14": 1,
  "2025-10-04": 2,
  "2025-11-12": 3,
  "2025-12-28": 1,
  "2026-01-18": 4,
  "2026-02-14": 2,
};

// Work account history (Monday-Friday corporate commits: 636 contributions across 119 workdays)
const WORK_COUNTS: Record<string, number> = (() => {
  const start = new Date("2025-09-01");
  const end = new Date("2026-03-01");
  const counts: Record<string, number> = {};
  const cur = new Date(start);
  let seed = 42;
  function prng() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  while (cur <= end) {
    const day = cur.getDay();
    const iso = cur.toISOString().slice(0, 10);
    if (day >= 1 && day <= 5) {
      if (prng() > 0.15) {
        counts[iso] = Math.floor(prng() * 8) + 2;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return counts;
})();

// Merged history (unified profile: combined work + personal contributions)
const MERGED_COUNTS: Record<string, number> = (() => {
  const merged: Record<string, number> = { ...WORK_COUNTS };
  for (const [date, count] of Object.entries(PERSONAL_COUNTS)) {
    merged[date] = (merged[date] ?? 0) + count;
  }
  return merged;
})();

const CYCLE_VIEWS = ["from", "to", "result"] as const;

function Landing() {
  const [heroView, setHeroView] = useState<"from" | "to" | "result">("from");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeTab, setActiveTab] = useState<"after" | "before">("after");

  useEffect(() => {
    if (hasInteracted) return;
    const interval = setInterval(() => {
      setHeroView((prev) => {
        const idx = CYCLE_VIEWS.indexOf(prev);
        const nextIdx = (idx + 1) % CYCLE_VIEWS.length;
        return CYCLE_VIEWS[nextIdx];
      });
    }, 2200);
    return () => clearInterval(interval);
  }, [hasInteracted]);
  const personalTotal = useMemo(
    () => Object.values(PERSONAL_COUNTS).reduce((sum, val) => sum + val, 0),
    [],
  );
  const workTotal = useMemo(
    () => Object.values(WORK_COUNTS).reduce((sum, val) => sum + val, 0),
    [],
  );
  const mergedTotal = useMemo(
    () => Object.values(MERGED_COUNTS).reduce((sum, val) => sum + val, 0),
    [],
  );

  const heroCounts =
    heroView === "from" ? WORK_COUNTS : heroView === "to" ? PERSONAL_COUNTS : MERGED_COUNTS;

  const heroTotal =
    heroView === "from" ? workTotal : heroView === "to" ? personalTotal : mergedTotal;

  const heroSubtitle =
    heroView === "from"
      ? "Work account activity (Enterprise SSO)"
      : heroView === "to"
        ? "Personal profile (Before mirror)"
        : "Merged contribution calendar (Sep 2025 – Mar 2026)";

  const heroRepoLabel =
    heroView === "from"
      ? "company-org / internal-services"
      : heroView === "to"
        ? "octocat (public personal profile)"
        : "octocat / greenkeep-commit-copies";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-brand text-base font-bold tracking-[0.18em] uppercase text-foreground">
                Greenkeep
              </span>
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
            </Link>
            <div className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
              <a href="#how-it-works" className="transition-colors hover:text-foreground">
                How it works
              </a>
              <a href="#features" className="transition-colors hover:text-foreground">
                Features
              </a>
              <a href="#get-hired" className="transition-colors hover:text-foreground">
                Get Hired
              </a>
              <a href="#privacy" className="transition-colors hover:text-foreground">
                Privacy
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              to="/login"
              className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
            >
              Log in
            </Link>
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 active:translate-y-[1px]"
            >
              Preview free
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO — "Get email or get scroll"
          Job: Stop the right visitor and drive first preview action
          ───────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-24 md:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
              Keep the credit for the code you write at work.
            </h1>

            <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              Greenkeep mirrors your enterprise and client commit activity onto your personal GitHub
              profile using empty, backdated commits. Your contribution graph stays green—without a
              single line of work code leaving your employer.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/app"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:translate-y-[1px]"
              >
                Preview your graph free
                <ArrowRight className="size-4" />
              </Link>
              <GitHubButton />
            </div>

            {/* Micro-trust signals */}
            <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-500" /> 0 lines of code copied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-500" /> 100% empty private commits
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-500" /> No employer permissions needed
              </span>
            </div>
          </div>

          {/* Visual Anchor: Interactive Graph Card */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm ring-1 ring-border/50 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Github className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-xs font-semibold text-foreground truncate">
                    {heroRepoLabel}
                  </span>
                </div>
                <div className="flex rounded-full bg-muted p-0.5">
                  {(
                    [
                      ["from", "Work"],
                      ["to", "Personal"],
                      ["result", "Merged"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setHasInteracted(true);
                        setHeroView(id);
                      }}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer",
                        heroView === id
                          ? "bg-background text-foreground ring-1 ring-border shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{heroSubtitle}</span>
                  <span className="font-medium text-foreground">{heroTotal} contributions</span>
                </div>

                <ContributionGraph
                  from="2025-09-01"
                  to="2026-03-01"
                  counts={heroCounts}
                  className="mt-3"
                />
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <LockKeyhole className="size-3.5 text-emerald-500" />
                  Completely private repository
                </span>
                <span>Verified undetectable</span>
              </div>
              <div className="mt-3 grid grid-cols-1 items-start text-xs leading-relaxed text-muted-foreground [&>*]:col-start-1 [&>*]:row-start-1">
                <p
                  className={cn(
                    "transition-opacity duration-150",
                    heroView === "from"
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none select-none",
                  )}
                >
                  Original commit history locked behind corporate SSO. Visible only to teammates.
                </p>
                <p
                  className={cn(
                    "transition-opacity duration-150",
                    heroView === "to" ? "opacity-100" : "opacity-0 pointer-events-none select-none",
                  )}
                >
                  What your public personal GitHub profile currently shows without work history.
                </p>
                <p
                  className={cn(
                    "transition-opacity duration-150",
                    heroView === "result"
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none select-none",
                  )}
                >
                  What your personal profile looks like after mirroring your work contributions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: SUCCESS — "Kill buyer's remorse"
          Job: Show this works and reduce post-click anxiety
          ───────────────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-card/40 py-16 sm:py-20" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
              Proven Outcome
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Reclaim years of engineering history in 90 seconds.
            </h2>
            <p className="mx-auto mt-3 max-w-[55ch] text-base text-muted-foreground">
              A clean, verified mirror that runs in three simple steps—or completely on autopilot.
            </p>
          </div>

          {/* 3-Column Metrics Snapshot */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-5" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">0 Lines</p>
              <h3 className="mt-1 text-base font-semibold">Zero Code Transmitted</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Proprietary code is never read, stored, or copied. All mirrored activity consists of
                empty, metadata-only contributions with backdated timestamps.
              </p>
            </div>

            <div className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <LockKeyhole className="size-5" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">100% Private</p>
              <h3 className="mt-1 text-base font-semibold">Isolated Dedicated Repo</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Written exclusively to a private repository on your personal account. Your
                employer&apos;s organization never receives a webhook, commit, or alert.
              </p>
            </div>

            <div className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-2xs sm:col-span-2 lg:col-span-1">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Layers className="size-5" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">8+ Sources</p>
              <h3 className="mt-1 text-base font-semibold">Multi-Account Federation</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Consolidate previous employers, client contractor handles, and freelance accounts
                into one seamless, unified timeline on your primary profile.
              </p>
            </div>
          </div>

          {/* Process Strip */}
          <div className="mt-10 rounded-xl border border-border bg-card/70 p-5 sm:p-6">
            <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-6">
              <div className="flex items-start gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Connect work handles</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Enter the GitHub usernames whose contribution history you want to preserve.
                  </p>
                </div>
              </div>

              <div
                className="hidden items-center justify-center text-muted-foreground/70 md:flex"
                aria-hidden="true"
              >
                <ArrowRight className="size-5 shrink-0" />
              </div>
              <div
                className="flex items-center justify-center py-1 text-muted-foreground/50 md:hidden"
                aria-hidden="true"
              >
                <ArrowDown className="size-4 shrink-0" />
              </div>

              <div className="flex items-start gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Preview merged graph</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Inspect the merged heat-map, tune contrast curves, and pick your date window.
                  </p>
                </div>
              </div>

              <div
                className="hidden items-center justify-center text-muted-foreground/70 md:flex"
                aria-hidden="true"
              >
                <ArrowRight className="size-5 shrink-0" />
              </div>
              <div
                className="flex items-center justify-center py-1 text-muted-foreground/50 md:hidden"
                aria-hidden="true"
              >
                <ArrowDown className="size-4 shrink-0" />
              </div>

              <div className="flex items-start gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Write once or sync daily
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Push via cloud OAuth, download a standalone local shell script, or automate
                    nightly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: PROBLEM-AGITATE — "Make status quo painful"
          Job: Increase motivation to change now (The Enterprise Black Hole)
          ───────────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-destructive">
              The Enterprise Profile Penalty
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              You ship production code 40 hours a week. To recruiters, your GitHub looks abandoned.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Corporate SSO creates an invisible wall between your daily output and your career
              reputation.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                <Briefcase className="size-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold">The SSO Black Hole</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                You design distributed systems, resolve critical production incidents, and push code
                daily—locked behind corporate enterprise firewalls and private orgs.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                <Clock className="size-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold">The Sudden Evaporation</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The day you change jobs, your company switches SSO providers, or client contracts
                end, that entire multi-year track record disappears overnight. You walk away with
                zero public proof.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                <UserX className="size-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold">The Recruiter Filter</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Hiring managers reviewing hundreds of applicant resumes glance at your personal
                GitHub, see 12 sparse contributions, and assume you haven&apos;t written code in
                months.
              </p>
            </div>
          </div>

          {/* Cost of Inaction Callout Box */}
          <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-border/80 bg-muted/40 p-6">
            <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">
              The Cost of Inaction
            </p>
            <blockquote className="mt-2 text-base leading-relaxed font-medium text-foreground italic">
              &ldquo;Spending the first 10 minutes of every technical screen explaining: &apos;I
              actually write code every single day, it&apos;s just on an internal corporate
              GitLab/Enterprise account.&apos;&rdquo;
            </blockquote>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: VALUE STACK — "Make saying no feel stupid"
          Job: Increase perceived value versus price/effort (The Full Toolkit)
          ───────────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-card/40 py-16 sm:py-24" id="features">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
              Full Toolkit
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to keep your personal profile accurate.
            </h2>
            <p className="mx-auto mt-3 max-w-[62ch] text-base text-muted-foreground">
              Engineered specifically for developers who demand clean git mechanics, realistic
              contribution curves, and zero security compromises.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                  <GitBranch className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Multi-Account Aggregation</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Federate up to 8 GitHub identities. Merge history from current employers, past
                  agencies, freelance accounts, and personal repos into one unified view.
                </p>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">Up to 8 handles</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Sliders className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">6 Intensity Curves</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Linear, Square Root, Balanced, Logarithmic, Accentuated, and Plateau. Prevent a
                  single 80-commit rebase day from washing out the rest of your year.
                </p>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">Mathematical smoothing</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Terminal className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Air-Gapped Bash Script</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Prefer not to grant OAuth write access? Download a self-contained shell script
                  (macOS, Linux, Windows) and push empty commits locally from your own terminal.
                </p>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">Zero OAuth permissions</p>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-2xs">
              <div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                  <RefreshCw className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Automated Nightly Sync</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Set it once and stay green forever. Our background worker quietly checks your work
                  handles daily and mirrors new work days automatically without lifting a finger.
                </p>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">24/7 background worker</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: SOCIAL PROOF — "Let others convince them"
          Job: Transfer trust from existing users / market reality
          ───────────────────────────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-24" id="get-hired">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-sky-600 dark:text-sky-400">
              Market Reality
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Hiring managers screen with their eyes first.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              GitHub grass isn&apos;t proof of code quality—it&apos;s the fastest visual heuristic
              that someone actually builds things.
            </p>
          </div>

          {/* Featured Tweet Artifact */}
          <figure className="mx-auto mt-10 max-w-xl rounded-2xl border border-border bg-card p-5 shadow-sm ring-1 ring-border/50 sm:p-6">
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
                  <p className="flex items-center gap-1 font-semibold tracking-tight text-foreground">
                    Kyle Finken <BadgeCheck className="size-4 text-sky-500" />
                  </p>
                  <p className="text-sm text-muted-foreground">@KyleFinken</p>
                </div>
              </div>
              <a
                href="https://x.com/KyleFinken/status/2089789887734259774"
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                aria-label="Open the original post on X"
              >
                View on X
              </a>
            </div>

            <blockquote className="mt-3 text-[17px] leading-snug font-normal text-foreground">
              if your github grass looks anything like this DM me and I will personally guarantee
              you an interview
            </blockquote>

            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <img
                src="/tweet/grass.png"
                alt="Kyle Finken's GitHub contribution graph showing 4,821 contributions in the last year"
                width={1200}
                height={327}
                loading="lazy"
                className="h-auto w-full object-cover"
              />
            </div>

            <div className="mt-3 rounded-xl border border-border bg-muted/20">
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
                  <span className="font-semibold text-foreground">Mintlify</span>{" "}
                  <BadgeCheck className="inline size-4 text-amber-400" />{" "}
                  <span className="text-muted-foreground">@mintlify · Aug 18</span>
                </p>
              </div>
              <p className="px-3 pt-1 text-[15px] text-foreground">
                we&apos;re hiring across sf &amp; ny
              </p>
              <pre className="px-3 py-3 font-mono text-[14px] leading-relaxed text-muted-foreground">
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

          {/* Context Commentary */}
          <div className="mx-auto mt-8 max-w-xl text-center text-sm text-muted-foreground">
            <p>
              In a sea of 500 applicant resumes for an engineering role, an active contribution
              graph is the fastest visual proof that you write and ship software.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 6: TRANSFORMATION — "Make outcome tangible"
          Job: Visualize future state with Before vs. After
          ───────────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-card/40 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
              The Visual Difference
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Turn years of invisible work into undeniable proof.
            </h2>
            <p className="mx-auto mt-3 max-w-[55ch] text-base text-muted-foreground">
              See the exact contrast between what recruiters see today versus what your profile
              reflects after Greenkeep.
            </p>

            {/* Toggle Controls */}
            <div className="mt-8 inline-flex items-center rounded-lg border border-border bg-card p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab("after")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition",
                  activeTab === "after"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                With Greenkeep
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("before")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition",
                  activeTab === "before"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Without Greenkeep
              </button>
            </div>
          </div>

          {/* Interactive Comparison Card */}
          <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between border-b border-border pb-5">
              <span className="font-mono text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {activeTab === "after"
                  ? "Reads: Active Senior Contributor"
                  : "Reads: Inactive / Sparse Personal Account"}
              </span>
              <div className="flex items-center gap-2 font-mono text-sm">
                <span className="rounded-md bg-muted px-2.5 py-1 font-semibold text-foreground">
                  {activeTab === "after"
                    ? `${mergedTotal} contributions`
                    : `${personalTotal} contributions`}
                </span>
              </div>
            </div>

            <div className="flex justify-center pt-6">
              <ContributionGraph
                from="2025-09-01"
                to="2026-03-01"
                counts={activeTab === "after" ? MERGED_COUNTS : PERSONAL_COUNTS}
              />
            </div>

            <div className="mt-6 rounded-xl bg-muted/40 p-4 text-center">
              <p className="font-mono text-xs font-semibold text-muted-foreground">
                Recruiter Impression
              </p>
              <p className="mx-auto mt-1 text-sm font-medium text-foreground max-w-xl">
                {activeTab === "after"
                  ? "“Consistent builder shipping daily production code. Strong work ethic and continuous momentum.”"
                  : "“Does this guy even ship? Did they step away from technical work?”"}
              </p>
            </div>
          </div>

          {/* Identity Shift Banner */}
          <div className="mx-auto mt-8 max-w-3xl text-center">
            <p className="font-mono text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Identity Transformation
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              <span className="text-destructive">“I promise I write code at my day job”</span> →{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                undeniable visual proof on your profile
              </span>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 7: SECONDARY CTA — "Catch the scrollers"
          Job: Convert users who need one more nudge & clear objections
          ───────────────────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-28" id="privacy">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="rounded-3xl border border-border bg-linear-to-b from-card to-muted/30 p-8 shadow-md text-center sm:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-3.5" />
              Try it free in under 2 minutes
            </div>

            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              See what your unified profile looks like right now.
            </h2>

            <p className="mx-auto mt-4 max-w-[55ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              No credit card required. No write permissions required to preview. Connect your handle
              and inspect your merged graph before committing a single square.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:translate-y-[1px]"
              >
                Preview your graph free
                <ArrowRight className="size-4" />
              </Link>
              <GitHubButton />
            </div>

            {/* Objection-Buster Checklist */}
            <div className="mt-8 grid gap-2.5 text-left sm:grid-cols-2 sm:gap-3 max-w-xl mx-auto">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Check className="size-4 shrink-0 text-emerald-500" />
                <span>100% empty, metadata-only contributions</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Check className="size-4 shrink-0 text-emerald-500" />
                <span>Zero corporate repo or source code access</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Check className="size-4 shrink-0 text-emerald-500" />
                <span>Offline local bash script option</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Check className="size-4 shrink-0 text-emerald-500" />
                <span>Reversible anytime by deleting the private repo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 8: FOOTER — "Professional legitimacy"
          Job: Close trust gaps and satisfy compliance expectations
          ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            {/* Col 1 & 2: Brand and Security Mission */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <span className="font-brand text-lg font-bold tracking-[0.18em] uppercase text-foreground">
                  Greenkeep
                </span>
                <span className="inline-block size-2 rounded-full bg-emerald-500" />
              </div>
              <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                Ethical commit mirroring for professional software engineers, contractors, and
                agency developers.
              </p>
              <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-emerald-500" /> Zero-Code Privacy Guarantee
                </p>
                <p className="mt-1 leading-relaxed">
                  Greenkeep reads public contribution calendars only. We never access, store, or
                  transmit proprietary source code, branch names, or files.
                </p>
              </div>
            </div>

            {/* Col 3: Product */}
            <div>
              <p className="text-xs font-bold tracking-wider uppercase text-foreground">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link to="/app" className="transition hover:text-foreground">
                    Interactive Workbench
                  </Link>
                </li>
                <li>
                  <Link to="/app" className="transition hover:text-foreground">
                    Bash Script Generator
                  </Link>
                </li>
                <li>
                  <Link to="/app" className="transition hover:text-foreground">
                    Automated Nightly Sync
                  </Link>
                </li>
                <li>
                  <Link to="/app" className="transition hover:text-foreground">
                    Lifetime &amp; Monthly Plans
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 4: Security & Legal */}
            <div>
              <p className="text-xs font-bold tracking-wider uppercase text-foreground">
                Trust &amp; Legal
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <SecurityModelModal />
                </li>
                <li>
                  <GitHubComplianceModal />
                </li>
                <li>
                  <TermsModal />
                </li>
                <li>
                  <PrivacyModal />
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <p>© 2026 Greenkeep. All rights reserved.</p>
            <p className="max-w-[60ch]">
              GitHub is a registered trademark of GitHub, Inc. Greenkeep is an independent tool and
              is not affiliated with, sponsored by, or endorsed by GitHub, Inc.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function GitHubButton() {
  const [pending, setPending] = useState(false);
  if (!authEnabled) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signIn(GITHUB_PROVIDER_ID, { callbackURL: "/app" }).catch((err: unknown) => {
          setPending(false);
          toast.error(err instanceof Error ? err.message : "Sign-in failed");
        });
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold transition hover:bg-muted/60 active:translate-y-[1px] disabled:opacity-60 cursor-pointer"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Github className="size-4" />}
      Continue with GitHub
    </button>
  );
}

/* Modals for Trust & Compliance */

function SecurityModelModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-left text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Security Architecture
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" />
            Security &amp; Zero-Code Guarantee
          </DialogTitle>
          <DialogDescription>
            How Greenkeep ensures your employer&apos;s code and intellectual property never leak.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">1. Strictly Empty Commits:</strong> Greenkeep only
            generates empty contributions containing zero file contents, code diffs, branch names,
            or commit messages.
          </p>
          <p>
            <strong className="text-foreground">2. Public Graph Scraping:</strong> Greenkeep reads
            the public contribution calendar via the public GitHub API or web endpoints. It never
            requests read access to your company&apos;s private repositories.
          </p>
          <p>
            <strong className="text-foreground">3. Isolated Private Repository:</strong> Commits are
            written exclusively to a dedicated private repository in your personal account (e.g.{" "}
            <code className="font-mono text-xs text-foreground">greenkeep-commit-copies</code>).
          </p>
          <p>
            <strong className="text-foreground">4. Completely Reversible:</strong> Deleting the
            destination repository from your GitHub account immediately deletes all mirrored
            contributions from your profile.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GitHubComplianceModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-left text-muted-foreground hover:text-foreground cursor-pointer"
        >
          GitHub API Compliance
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            GitHub API &amp; Terms Compliance
          </DialogTitle>
          <DialogDescription>
            Information about git standards and GitHub platform policies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Greenkeep creates standard contributions adhering to the official Git specification. Git
            natively supports author dating and metadata-only commits.
          </p>
          <p>
            GitHub calculates the user contribution graph by counting all commits made by verified
            email addresses belonging to that account in repositories accessible to the profile.
          </p>
          <p>
            Greenkeep respects GitHub API rate limits, uses official OAuth endpoints, and provides
            an offline script option for developers who do not wish to authenticate via the cloud.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TermsModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-left text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Terms of Service
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Terms of Service
          </DialogTitle>
          <DialogDescription>Summary of Greenkeep terms of use.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            By using Greenkeep, you agree to mirror only contribution timelines that you are
            authorized to represent.
          </p>
          <p>
            Greenkeep is provided &ldquo;as is&rdquo; without warranties of any kind. You retain
            full ownership and responsibility for your GitHub profile and private repositories.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-left text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Privacy Policy
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-5 text-emerald-500" />
            Privacy Policy
          </DialogTitle>
          <DialogDescription>How Greenkeep handles your information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Greenkeep stores your user account record and your chosen sync preferences if you enable
            automated background sync.
          </p>
          <p>
            We do not sell, rent, or share personal data. We do not track, inspect, or log the
            contents of your repositories.
          </p>
          <p>You may request complete deletion of your account and sync preferences at any time.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
