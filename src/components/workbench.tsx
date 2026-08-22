import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Github, LoaderCircle, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AuthBar, AuthDialog, type AuthMode } from "@/components/auth-dialog";
import { ContributionGraph, GraphLegend } from "@/components/contribution-graph";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  activeDays,
  defaultRange,
  generateBashScript,
  intensityLabel,
  isGithubUsername,
  mergeCalendars,
  planCommits,
  totalPlanned,
  type IntensityMode,
  type SourceCalendar,
} from "@/lib/github";
import {
  appendMirrorCommits,
  beginMirrorRepo,
  fetchSourceCalendars,
  resolveDestination,
} from "@/lib/github-fn";
import { cn } from "@/lib/utils";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const TOKEN_KEY = "graph-copier-token";
const PREFS_KEY = "graph-copier-prefs";
const BATCH = 20;
const MAX_SOURCES = 8;

type Dest = {
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string;
  emails: string[];
};

type Prefs = {
  repo: string;
  intensity: IntensityMode;
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { repo: "graph-copy", intensity: "levels" };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      repo: parsed.repo || "graph-copy",
      intensity:
        parsed.intensity === "days" || parsed.intensity === "counts"
          ? parsed.intensity
          : "levels",
    };
  } catch {
    return { repo: "graph-copy", intensity: "levels" };
  }
}

function expandPlan(plan: ReturnType<typeof planCommits>) {
  const specs: { date: string; iso: string; message: string }[] = [];
  for (const item of plan) {
    for (let i = 0; i < item.commits; i++) {
      const hour = String(10 + (i % 12)).padStart(2, "0");
      const minute = String((i * 3) % 60).padStart(2, "0");
      specs.push({
        date: item.date,
        iso: `${item.date}T${hour}:${minute}:00Z`,
        message: `chore: graph ${item.date}`,
      });
    }
  }
  return specs;
}

export function Workbench() {
  const range = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [draftUser, setDraftUser] = useState("");
  const [sources, setSources] = useState<SourceCalendar[]>([]);
  const [loadingLogins, setLoadingLogins] = useState<string[]>([]);
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [destLoginDraft, setDestLoginDraft] = useState("");
  const [repo, setRepo] = useState("graph-copy");
  const [email, setEmail] = useState("");
  const [intensity, setIntensity] = useState<IntensityMode>("levels");
  const [isPrivate, setIsPrivate] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(0);
  const [writeTotal, setWriteTotal] = useState(0);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const abortRef = useRef(false);
  const { user, isPending: authPending } = useCurrentUserState();

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY) ?? "";
    const prefs = loadPrefs();
    setToken(stored);
    setTokenDraft(stored);
    setRepo(prefs.repo);
    setIntensity(prefs.intensity);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ repo, intensity } satisfies Prefs),
    );
  }, [repo, intensity]);

  useEffect(() => {
    if (!token) {
      setDest(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveDestination({ data: { token } })
      .then((user) => {
        if (cancelled) return;
        setDest(user);
        setDestLoginDraft(user.login);
        setEmail(
          user.email || `${user.login}@users.noreply.github.com`,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDest(null);
        toast.error(
          err instanceof Error ? err.message : "Could not read that token",
        );
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const counts = useMemo(() => mergeCalendars(sources), [sources]);
  const plan = useMemo(
    () => planCommits(counts, intensity, from, to),
    [counts, intensity, from, to],
  );
  const planned = totalPlanned(plan);
  const daysActive = activeDays(plan);
  const sourceTotal = sources.reduce((sum, s) => sum + s.total, 0);

  async function loadUsers(usernames: string[]) {
    const unique = [...new Set(usernames.map((u) => u.toLowerCase()))];
    if (unique.length === 0) return;
    setFetching(true);
    setLoadingLogins(unique);
    try {
      const calendars = await fetchSourceCalendars({
        data: {
          usernames: unique,
          from,
          to,
          token: token || undefined,
        },
      });
      setSources((prev) => {
        const next = new Map(prev.map((s) => [s.login.toLowerCase(), s]));
        for (const cal of calendars) next.set(cal.login.toLowerCase(), cal);
        return [...next.values()];
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load graphs");
    } finally {
      setFetching(false);
      setLoadingLogins([]);
    }
  }

  function addSource() {
    const login = draftUser.trim().replace(/^@/, "");
    if (!isGithubUsername(login)) {
      toast.error("Enter a valid GitHub username");
      return;
    }
    if (sources.some((s) => s.login.toLowerCase() === login.toLowerCase())) {
      toast.error("That account is already in the list");
      return;
    }
    if (sources.length >= MAX_SOURCES) {
      toast.error(`You can copy from up to ${MAX_SOURCES} accounts`);
      return;
    }
    setDraftUser("");
    void loadUsers([...sources.map((s) => s.login), login]);
  }

  function removeSource(login: string) {
    setSources((prev) => prev.filter((s) => s.login !== login));
  }

  function saveToken() {
    const next = tokenDraft.trim();
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
    setToken(next);
    toast.success(next ? "GitHub token saved on this device" : "GitHub token cleared");
  }

  function downloadScript() {
    const owner = dest?.login || destLoginDraft.trim() || "YOUR_USERNAME";
    const name = dest?.name || owner;
    const mail = email || `${owner}@users.noreply.github.com`;
    const body = generateBashScript({
      owner,
      repo: repo.trim() || "graph-copy",
      name,
      email: mail,
      plan,
    });
    const blob = new Blob([body], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph-copy.sh";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded graph-copy.sh");
  }

  async function runWrite() {
    if (!user) {
      setAuthMode("login");
      return;
    }
    if (!token || !dest) {
      toast.error("Add a GitHub token under Copy to so we can open the private repo");
      return;
    }
    const mail = email.trim();
    if (!mail.includes("@")) {
      toast.error("Set the commit email that GitHub will count");
      return;
    }
    const specs = expandPlan(plan);
    if (specs.length === 0) {
      toast.error("Nothing to copy in this range");
      return;
    }
    abortRef.current = false;
    setWriting(true);
    setWritten(0);
    setWriteTotal(specs.length);
    setRepoUrl(null);
    try {
      const session = await beginMirrorRepo({
        data: {
          token,
          repo: repo.trim() || "graph-copy",
          isPrivate,
        },
      });
      setRepoUrl(session.htmlUrl);
      let parentSha = session.parentSha;
      for (let i = 0; i < specs.length; i += BATCH) {
        if (abortRef.current) throw new Error("Stopped");
        const chunk = specs.slice(i, i + BATCH);
        const result = await appendMirrorCommits({
          data: {
            token,
            owner: session.owner,
            repo: session.repo,
            branch: session.branch,
            parentSha,
            treeSha: session.treeSha,
            name: dest.name,
            email: mail,
            commits: chunk,
          },
        });
        parentSha = result.parentSha;
        setWritten(Math.min(specs.length, i + chunk.length));
      }
      toast.success("Mock commits pushed. GitHub may take a few minutes to draw the graph.");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Write failed");
    } finally {
      setWriting(false);
    }
  }

  const destLabel = dest?.login || destLoginDraft || "destination";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="leading-tight">
            <p className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
              Graph Copier
            </p>
            <p className="text-sm font-medium">Contribution mirror</p>
          </div>
        </div>
        <AuthBar
          onLogin={() => setAuthMode("login")}
          onSignup={() => setAuthMode("signup")}
        />
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex w-full flex-col gap-6 border-t border-border p-4 sm:p-6 lg:order-1 lg:w-80 lg:shrink-0 lg:border-r lg:border-t-0">
          <section className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
                  01
                </p>
                <h2 className="text-sm font-medium">Copy from</h2>
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {sources.length}/{MAX_SOURCES}
              </span>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addSource();
              }}
            >
              <Input
                value={draftUser}
                onChange={(e) => setDraftUser(e.target.value)}
                placeholder="GitHub username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Source GitHub username"
              />
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                aria-label="Add account"
              >
                <Plus />
              </Button>
            </form>
            {sources.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Add the work accounts whose public graphs you want on your
                  personal profile.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["gaearon", "octocat"].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                      onClick={() => void loadUsers([sample])}
                    >
                      @{sample}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {sources.map((source) => (
                <li
                  key={source.login}
                  className="flex items-center gap-3 rounded-lg bg-card p-2 pr-1 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]"
                >
                  <img
                    src={source.avatarUrl}
                    alt=""
                    className="size-8 rounded-md"
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{source.login}</p>
                    <p className="truncate text-2xs tabular-nums text-muted-foreground">
                      {source.total.toLocaleString()} contributions
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${source.login}`}
                    onClick={() => removeSource(source.login)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
              {loadingLogins.length > 0 && (
                <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Reading graphs
                </li>
              )}
            </ul>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
                02
              </p>
              <h2 className="text-sm font-medium">Date range</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={sources.length === 0 || fetching}
              onClick={() => void loadUsers(sources.map((s) => s.login))}
            >
              <RefreshCw className={cn(fetching && "animate-spin")} />
              Reload range
            </Button>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
                03
              </p>
              <h2 className="text-sm font-medium">Copy to</h2>
            </div>
            {dest ? (
              <div className="flex items-center gap-3 rounded-lg bg-card p-2 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
                <img
                  src={dest.avatarUrl}
                  alt=""
                  className="size-8 rounded-md"
                  width={32}
                  height={32}
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{dest.login}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {dest.name}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dest">Destination account</Label>
                <Input
                  id="dest"
                  value={destLoginDraft}
                  onChange={(e) => setDestLoginDraft(e.target.value)}
                  placeholder="your-username"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repo">Private repo</Label>
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="graph-copy"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token">GitHub token</Label>
              <div className="flex gap-2">
                <Input
                  id="token"
                  type="password"
                  autoComplete="off"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  placeholder="ghp_…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={saveToken}
                >
                  Save
                </Button>
              </div>
              <p className="text-2xs text-muted-foreground">
                Repo scope, stored only on this device. Needed to create the
                private mirror — sign-in does not grant GitHub write access.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Commit email</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@users.noreply.github.com"
                inputMode="email"
              />
              <p className="text-2xs text-muted-foreground">
                Must be a verified address on {destLabel}, or GitHub will not
                paint the squares.
              </p>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Keep the mirror repo private
            </label>
          </section>
        </aside>

        <main className="order-1 flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-8 lg:order-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Copy a graph onto your own.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Merge public contribution calendars from other GitHub accounts
                you use at work, then write backdated empty commits to a private
                repo on the account you want to show.
              </p>
            </div>
            <GraphLegend />
          </div>

          {sources.length === 0 && (
            <form
              className="flex flex-col gap-2 lg:hidden"
              onSubmit={(e) => {
                e.preventDefault();
                addSource();
              }}
            >
              <div className="flex gap-2">
                <Input
                  value={draftUser}
                  onChange={(e) => setDraftUser(e.target.value)}
                  placeholder="GitHub username to copy"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Source GitHub username"
                />
                <Button type="submit" size="icon" variant="secondary" aria-label="Add account">
                  <Plus />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {["gaearon", "octocat"].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                    onClick={() => void loadUsers([sample])}
                  >
                    @{sample}
                  </button>
                ))}
              </div>
            </form>
          )}

          <section className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255/0.06)] sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Merged preview</p>
                <p className="font-mono text-sm tabular-nums">
                  {sources.length} {sources.length === 1 ? "account" : "accounts"} ·{" "}
                  {sourceTotal.toLocaleString()} contributions · {daysActive} days ·{" "}
                  {planned} commits
                </p>
              </div>
              {resolving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Checking token
                </span>
              )}
            </div>
            <ContributionGraph from={from} to={to} counts={counts} />
          </section>

          <section className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255/0.06)] sm:p-5">
            <div>
              <h2 className="text-sm font-medium">Intensity</h2>
              <p className="text-xs text-muted-foreground">
                How faithfully to replay each day when writing mock commits.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["days", "Presence"],
                  ["levels", "Intensity"],
                  ["counts", "Exact"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setIntensity(mode)}
                  className={cn(
                    "rounded-lg px-3 py-3 text-left transition-[background-color,box-shadow] duration-150",
                    intensity === mode
                      ? "bg-muted shadow-[0_0_0_1px_rgb(255_255_255/0.16)]"
                      : "shadow-[0_0_0_1px_rgb(255_255_255/0.06)] hover:bg-muted/60",
                  )}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {intensityLabel(mode)}
                  </p>
                </button>
              ))}
            </div>
            {intensity === "counts" && (
              <p className="text-2xs text-muted-foreground">
                Exact mode caps at 20 commits per day so a write stays
                practical.
              </p>
            )}
          </section>

          {writing && (
            <section className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
              <div className="flex items-center justify-between text-xs">
                <span>Writing backdated commits</span>
                <span className="font-mono tabular-nums">
                  {written}/{writeTotal}
                </span>
              </div>
              <Progress
                value={writeTotal ? (written / writeTotal) * 100 : 0}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => {
                  abortRef.current = true;
                }}
              >
                Stop
              </Button>
            </section>
          )}

          {repoUrl && !writing && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-graph-4 hover:underline"
            >
              <Github className="size-4" />
              Open {repo} on GitHub
            </a>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="min-h-11"
              disabled={planned === 0 || writing}
              onClick={() => {
                if (authPending) return;
                if (!user) {
                  setAuthMode("login");
                  return;
                }
                if (!token) {
                  toast.error("Add a GitHub token under Copy to");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              {writing ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              Write {planned.toLocaleString()} commits
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={planned === 0}
              onClick={downloadScript}
            >
              <Download />
              Download script
            </Button>
            {sources.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setSources([])}
              >
                <Trash2 />
                Clear sources
              </Button>
            )}
          </div>
        </main>
      </div>

      <AuthDialog mode={authMode} onModeChange={setAuthMode} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write mock commits?</DialogTitle>
            <DialogDescription>
              This creates or reuses the private repo{" "}
              <span className="font-mono text-foreground">
                {dest?.login || destLoginDraft}/{repo || "graph-copy"}
              </span>{" "}
              and appends {planned.toLocaleString()} empty, backdated commits
              so GitHub paints the copied graph. Use this for accounts you
              own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={writing}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void runWrite()} disabled={writing}>
              {writing ? <LoaderCircle className="animate-spin" /> : null}
              Write commits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LogoMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 rounded-md"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" className="fill-card" />
      <g className="fill-graph-0">
        <rect x="6" y="6" width="4" height="4" rx="0.7" />
        <rect x="11.3" y="6" width="4" height="4" rx="0.7" />
        <rect x="16.6" y="6" width="4" height="4" rx="0.7" />
        <rect x="21.9" y="6" width="4" height="4" rx="0.7" />
        <rect x="6" y="11.3" width="4" height="4" rx="0.7" />
        <rect x="21.9" y="21.9" width="4" height="4" rx="0.7" />
      </g>
      <rect x="11.3" y="6" width="4" height="4" rx="0.7" className="fill-graph-1" />
      <rect x="16.6" y="6" width="4" height="4" rx="0.7" className="fill-graph-3" />
      <rect x="6" y="11.3" width="4" height="4" rx="0.7" className="fill-graph-2" />
      <rect x="11.3" y="11.3" width="4" height="4" rx="0.7" className="fill-graph-4" />
      <rect x="21.9" y="11.3" width="4" height="4" rx="0.7" className="fill-graph-1" />
      <rect x="16.6" y="16.6" width="4" height="4" rx="0.7" className="fill-graph-2" />
      <rect x="21.9" y="16.6" width="4" height="4" rx="0.7" className="fill-graph-3" />
      <rect x="11.3" y="21.9" width="4" height="4" rx="0.7" className="fill-graph-1" />
      <rect x="16.6" y="21.9" width="4" height="4" rx="0.7" className="fill-graph-4" />
    </svg>
  );
}
