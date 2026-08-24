import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Download, Github, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AuthBar, AuthDialog, type AuthMode } from "@/components/auth-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
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

const PREFS_KEY = "greenkeep-prefs";
const DEFAULT_REPO = "greenkeep-commit-copies";
const BATCH = 20;
const MAX_SOURCES = 8;

type PreviewView = "from" | "to" | "result";

type ScriptPlatform = "macos" | "linux" | "windows";

function detectScriptPlatform(): ScriptPlatform {
  if (typeof navigator === "undefined") return "macos";
  let hint = "";
  if ("userAgentData" in navigator) {
    const data = navigator.userAgentData;
    if (data && typeof data === "object" && "platform" in data) {
      const platform = data.platform;
      if (typeof platform === "string") hint = platform;
    }
  }
  const hay = `${hint} ${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (/\bwin/.test(hay)) return "windows";
  if (/\blinux\b/.test(hay) && !/\bandroid\b/.test(hay)) return "linux";
  return "macos";
}

const SCRIPT_PLATFORMS: { id: ScriptPlatform; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
];

const SCRIPT_STEPS: Record<ScriptPlatform, { title: string; detail?: string }[]> = {
  macos: [
    { title: "Open Terminal." },
    {
      title: "Go to the folder that received the file.",
      detail: "cd ~/Downloads",
    },
    {
      title: "Run the script. Install Git first if needed.",
      detail: "bash greenkeep.sh",
    },
    {
      title:
        "Create an empty private repo on GitHub with the name in Additional settings, then add the remote and push.",
    },
  ],
  linux: [
    { title: "Open a terminal." },
    {
      title: "Go to the folder that received the file.",
      detail: "cd ~/Downloads",
    },
    {
      title: "Run the script. Install git if it is missing.",
      detail: "bash greenkeep.sh",
    },
    {
      title:
        "Create an empty private repo on GitHub with the name in Additional settings, then add the remote and push.",
    },
  ],
  windows: [
    { title: "Install Git for Windows if you do not already have Git Bash." },
    { title: "Open Git Bash." },
    {
      title: "Go to the folder that received the file.",
      detail: "cd ~/Downloads",
    },
    {
      title: "Run the script.",
      detail: "bash greenkeep.sh",
    },
    {
      title:
        "Create an empty private repo on GitHub with the name in Additional settings, then add the remote and push.",
    },
  ],
};
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
    if (!raw) return { repo: DEFAULT_REPO, intensity: "levels" };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      repo: parsed.repo && parsed.repo !== "greenkeep" ? parsed.repo : DEFAULT_REPO,
      intensity:
        parsed.intensity === "days" || parsed.intensity === "counts" ? parsed.intensity : "levels",
    };
  } catch {
    return { repo: DEFAULT_REPO, intensity: "levels" };
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
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [destCalendar, setDestCalendar] = useState<SourceCalendar | null>(null);
  const [destLoginDraft, setDestLoginDraft] = useState("");
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [email, setEmail] = useState("");
  const [intensity, setIntensity] = useState<IntensityMode>("levels");
  const [isPrivate, setIsPrivate] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptPlatform, setScriptPlatform] = useState<ScriptPlatform>("macos");
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(0);
  const [writeTotal, setWriteTotal] = useState(0);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const abortRef = useRef(false);
  const sourceLoginsRef = useRef<string[]>([]);
  const loadGen = useRef(0);
  const [previewView, setPreviewView] = useState<PreviewView>("result");
  const { user, isPending: authPending } = useCurrentUserState();

  useEffect(() => {
    const prefs = loadPrefs();
    setRepo(prefs.repo);
    setIntensity(prefs.intensity);
    try {
      localStorage.removeItem("graph-copier-token");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ repo, intensity } satisfies Prefs));
  }, [repo, intensity]);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || user?.isDevFallback) {
      setDest(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveDestination()
      .then((githubUser) => {
        if (cancelled) return;
        setDest(githubUser);
        setDestLoginDraft(githubUser.login);
        setEmail(githubUser.email ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDest(null);
        toast.error(err instanceof Error ? err.message : "Could not read the GitHub account");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, user?.isDevFallback]);

  const destLogin = dest?.login ?? null;
  useEffect(() => {
    if (!destLogin) {
      setDestCalendar(null);
      return;
    }
    let cancelled = false;
    void fetchSourceCalendars({
      data: { usernames: [destLogin], from, to },
    })
      .then((calendars) => {
        if (!cancelled) setDestCalendar(calendars[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setDestCalendar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [destLogin, from, to]);

  sourceLoginsRef.current = sources.map((s) => s.login);
  useEffect(() => {
    const logins = sourceLoginsRef.current;
    if (logins.length === 0) return;
    void loadUsers(logins);
    // Range change only. Adding an account still goes through addSource.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadUsers closes over from/to
  }, [from, to]);

  const destCounts = useMemo(
    () => (destCalendar ? mergeCalendars([destCalendar]) : {}),
    [destCalendar],
  );

  const sourceCounts = useMemo(() => mergeCalendars(sources), [sources]);
  const resultCounts = useMemo(
    () => mergeCalendars([...(destCalendar ? [destCalendar] : []), ...sources]),
    [destCalendar, sources],
  );
  const previewCounts =
    previewView === "from" ? sourceCounts : previewView === "to" ? destCounts : resultCounts;
  const plan = useMemo(
    () => planCommits(sourceCounts, intensity, from, to),
    [sourceCounts, intensity, from, to],
  );
  const planned = totalPlanned(plan);
  const daysActive = activeDays(plan);
  const sourceTotal = sources.reduce((sum, s) => sum + s.total, 0);
  const previewTotal = Object.values(previewCounts).reduce((sum, n) => sum + n, 0);
  const previewActiveDays = Object.values(previewCounts).filter((n) => n > 0).length;

  async function loadUsers(usernames: string[]) {
    const unique = [...new Set(usernames.map((u) => u.toLowerCase()))];
    if (unique.length === 0) return;
    const gen = ++loadGen.current;
    setLoadingLogins(unique);
    try {
      const calendars = await fetchSourceCalendars({
        data: {
          usernames: unique,
          from,
          to,
        },
      });
      if (gen !== loadGen.current) return;
      setSources((prev) => {
        const next = new Map(prev.map((s) => [s.login.toLowerCase(), s]));
        for (const cal of calendars) next.set(cal.login.toLowerCase(), cal);
        return [...next.values()];
      });
    } catch (err) {
      if (gen !== loadGen.current) return;
      toast.error(err instanceof Error ? err.message : "Could not load graphs");
    } finally {
      if (gen === loadGen.current) setLoadingLogins([]);
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
      toast.error(`You can add up to ${MAX_SOURCES} work accounts`);
      return;
    }
    setDraftUser("");
    void loadUsers([...sources.map((s) => s.login), login]);
  }

  function removeSource(login: string) {
    setSources((prev) => prev.filter((s) => s.login !== login));
  }

  function downloadScript() {
    const owner = dest?.login || destLoginDraft.trim() || "YOUR_USERNAME";
    const name = dest?.name || owner;
    const mail = email || `${owner}@users.noreply.github.com`;
    const body = generateBashScript({
      owner,
      repo: repo.trim() || DEFAULT_REPO,
      name,
      email: mail,
      plan,
    });
    const blob = new Blob([body], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "greenkeep.sh";
    a.click();
    URL.revokeObjectURL(url);
    setScriptOpen(false);
    toast.success("Downloaded greenkeep.sh");
  }

  async function runWrite() {
    if (!user) {
      setAuthMode("login");
      return;
    }
    if (!dest) {
      toast.error("Sign in with GitHub so we can open the private repo");
      setAuthMode("login");
      return;
    }
    const mail = email.trim();
    if (!emailAllowed) {
      toast.error("Use a verified email from your GitHub account");
      return;
    }
    const specs = expandPlan(plan);
    if (specs.length === 0) {
      toast.error("Nothing to keep in this range");
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
          repo: repo.trim() || DEFAULT_REPO,
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
      toast.success("Commits are on GitHub. The graph can take a few minutes to catch up.");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Write failed");
    } finally {
      setWriting(false);
    }
  }

  const emailAllowed =
    dest != null && dest.emails.some((item) => item.toLowerCase() === email.trim().toLowerCase());

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark />
            <p className="font-brand text-sm font-semibold tracking-[0.18em] uppercase">
              GREENKEEP
            </p>
          </div>
          <AuthBar onLogin={() => setAuthMode("login")} onSignup={() => setAuthMode("signup")} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-2xl font-medium tracking-tight sm:text-4xl">
                Work contributions.
              </h1>
              <h1 className="text-2xl font-medium tracking-tight sm:text-4xl">Personal GitHub.</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Some companies care about your GitHub grass, and your current employer may not let
                you use your own. So when you job search, all of that hard work is going unnoticed.
                Greenkeep copies all of your contributions to your personal account so you can get
                the credit you deserve.
              </p>
            </div>
            <GraphLegend />
          </div>

          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addSource();
            }}
          >
            <Input
              value={draftUser}
              onChange={(e) => setDraftUser(e.target.value)}
              placeholder="Work GitHub username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Work GitHub username"
            />
            <Button type="submit" size="icon" variant="secondary" aria-label="Add account">
              <Plus />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="hover:bg-destructive hover:text-destructive-foreground"
              disabled={sources.length === 0}
              aria-label="Clear work accounts"
              onClick={() => setSources([])}
            >
              <Trash2 />
            </Button>
          </form>
          {(sources.length > 0 || loadingLogins.length > 0) && (
            <ul className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <li
                  key={source.login}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-card p-2 pr-1 ring-1 ring-border"
                >
                  <img
                    src={source.avatarUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-md"
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 max-w-[10rem]">
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
          )}

          <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-sm tabular-nums">
                  {previewView === "from" && (
                    <>
                      {sources.length} {sources.length === 1 ? "account" : "accounts"} ·{" "}
                      {sourceTotal.toLocaleString()} contributions · {daysActive} days · {planned}{" "}
                      commits
                    </>
                  )}
                  {previewView === "to" &&
                    (destCalendar
                      ? `@${destCalendar.login} · ${destCalendar.total.toLocaleString()} contributions`
                      : "Sign in to load your personal graph")}
                  {previewView === "result" && (
                    <>
                      {previewTotal.toLocaleString()} contributions · {previewActiveDays} days
                      {destCalendar || sources.length > 0 ? " combined" : ""}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {resolving && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Reading GitHub account
                  </span>
                )}
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
                      onClick={() => setPreviewView(id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150",
                        previewView === id
                          ? "bg-background text-foreground ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <ContributionGraph from={from} to={to} counts={previewCounts} />
          </section>

          <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
            <div>
              <h2 className="text-sm font-medium">Intensity</h2>
              <p className="text-xs text-muted-foreground">
                How closely the new squares should match the work graph.
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
                      ? "bg-muted ring-1 ring-foreground/20"
                      : "ring-1 ring-border hover:bg-muted/60",
                  )}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{intensityLabel(mode)}</p>
                </button>
              ))}
            </div>
            {intensity === "counts" && (
              <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Busy days can take a while. If you have thousands of contributions, it is
                  recommended to download the script instead.
                </span>
              </p>
            )}
          </section>

          {writing && (
            <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-center justify-between text-xs">
                <span>Writing backdated commits</span>
                <span className="font-mono tabular-nums">
                  {written}/{writeTotal}
                </span>
              </div>
              <Progress value={writeTotal ? (written / writeTotal) * 100 : 0} />
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

          <p className="text-sm text-muted-foreground">
            We look at your work accounts and create mock commits for you to merge their
            contribution graphs into your own.
          </p>
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
                if (!dest) {
                  setAuthMode("login");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              {writing ? <LoaderCircle className="animate-spin" /> : <Check />}
              Write {planned.toLocaleString()} commits
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={planned === 0}
              onClick={() => {
                setScriptPlatform(detectScriptPlatform());
                setScriptOpen(true);
              }}
            >
              <Download />
              Download script
            </Button>
          </div>

          <section className="flex flex-col gap-5">
            <h2 className="text-sm font-medium">Additional settings</h2>
            <div className="grid w-full max-w-sm grid-cols-2 gap-2">
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
            {dest && (
              <div className="flex max-w-sm items-center gap-3 rounded-lg bg-card p-2 ring-1 ring-border">
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
                  <p className="truncate text-2xs text-muted-foreground">{dest.name}</p>
                </div>
              </div>
            )}
            <div className="flex max-w-sm flex-col gap-1.5">
              <Label htmlFor="repo">Repository for commits</Label>
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder={DEFAULT_REPO}
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div className="flex max-w-sm flex-col gap-1.5">
              <Label htmlFor="email">Commit email</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={dest?.email ?? "you@example.com"}
                inputMode="email"
                aria-invalid={dest != null && !emailAllowed}
              />
              {dest != null && !emailAllowed && (
                <p className="text-2xs text-muted-foreground">
                  Not a verified email on this GitHub account.{" "}
                  <a
                    href="https://github.com/settings/emails"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-4"
                  >
                    Review emails on GitHub
                  </a>
                </p>
              )}
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Keep the repo private
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm">Theme</span>
              <ThemeToggle />
            </div>
          </section>
        </main>
      </div>

      <AuthDialog mode={authMode} onModeChange={setAuthMode} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write these commits?</DialogTitle>
            <DialogDescription>
              This creates or reuses the private repo{" "}
              <span className="font-mono text-foreground">
                {dest?.login || destLoginDraft}/{repo || DEFAULT_REPO}
              </span>{" "}
              and adds {planned.toLocaleString()} empty, backdated commits. GitHub will count them
              on the signed-in account. Only do this with accounts you own.
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

      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download the script</DialogTitle>
            <DialogDescription>
              Pick your platform, then follow the steps after the file downloads. The script writes
              empty, backdated commits locally and prints the git commands to push.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Platform">
            {SCRIPT_PLATFORMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={scriptPlatform === id}
                onClick={() => setScriptPlatform(id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  scriptPlatform === id
                    ? "bg-muted text-foreground ring-1 ring-foreground/20"
                    : "text-muted-foreground ring-1 ring-border hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <ol className="flex list-decimal flex-col gap-3 pl-4 text-sm">
            {SCRIPT_STEPS[scriptPlatform].map((step, index) => (
              <li key={`${scriptPlatform}-${index}`} className="pl-1">
                <p>{step.title}</p>
                {step.detail ? (
                  <code className="mt-1 block rounded-md bg-muted px-2 py-1 font-mono text-2xs">
                    {step.detail}
                  </code>
                ) : null}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setScriptOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={downloadScript}>
              <Download />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LogoMark() {
  const cells = [
    "fill-graph-4",
    "fill-graph-3",
    "fill-graph-2",
    "fill-graph-3",
    "fill-graph-2",
    "fill-graph-1",
    "fill-graph-2",
    "fill-graph-1",
    "fill-graph-0",
  ];
  return (
    <svg viewBox="0 0 32 32" className="size-8 rounded-[3px]" aria-hidden="true">
      <rect width="32" height="32" rx="3" className="fill-foreground" />
      {cells.map((fill, i) => (
        <rect
          key={i}
          x={4 + (i % 3) * 8.5}
          y={4 + Math.floor(i / 3) * 8.5}
          width="7"
          height="7"
          rx="0.75"
          className={fill}
        />
      ))}
    </svg>
  );
}
