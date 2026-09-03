import { getSql } from "./db";
import type { IntensityMode } from "./github";

export type PremiumSyncInput = {
  userId: string;
  sourceUsernames: string[];
  startDate: string;
  repo: string;
  commitName: string;
  commitEmail: string;
  intensity: IntensityMode;
  isPrivate: boolean;
};

export type PremiumSyncStatus = Omit<PremiumSyncInput, "userId"> & {
  enabled: boolean;
  disabledReason: "user" | "subscription" | null;
  nextSyncAt: string;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  copiedCommits: number;
};

export type ClaimedPremiumSync = PremiumSyncInput & {
  revision: number;
  reconcileRequired: boolean;
};

type SyncRow = {
  userId: string;
  sourceUsernames: unknown;
  startDate: string;
  repo: string;
  commitName: string;
  commitEmail: string;
  intensity: IntensityMode;
  isPrivate: boolean;
  enabled: boolean;
  disabledReason: "user" | "subscription" | null;
  revision: number;
  reconcileRequired?: boolean;
  nextSyncAt: string | Date;
  lastStartedAt: string | Date | null;
  lastCompletedAt: string | Date | null;
  lastError: string | null;
  copiedCommits?: number;
};

const STATUS_COLUMNS = `
  p.user_id as "userId",
  p.source_usernames as "sourceUsernames",
  p.start_date as "startDate",
  p.repo,
  p.commit_name as "commitName",
  p.commit_email as "commitEmail",
  p.intensity,
  p.is_private as "isPrivate",
  p.enabled,
  p.disabled_reason as "disabledReason",
  p.revision,
  p.next_sync_at as "nextSyncAt",
  p.last_started_at as "lastStartedAt",
  p.last_completed_at as "lastCompletedAt",
  p.last_error as "lastError",
  coalesce((select sum(d.copied_commits) from premium_sync_day d where d.user_id = p.user_id), 0)::int as "copiedCommits"
`;

function timestamp(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sourceUsernames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toStatus(row: SyncRow): PremiumSyncStatus {
  return {
    sourceUsernames: sourceUsernames(row.sourceUsernames),
    startDate: row.startDate,
    repo: row.repo,
    commitName: row.commitName,
    commitEmail: row.commitEmail,
    intensity: row.intensity,
    isPrivate: row.isPrivate,
    enabled: row.enabled,
    disabledReason: row.disabledReason,
    nextSyncAt: timestamp(row.nextSyncAt)!,
    lastStartedAt: timestamp(row.lastStartedAt),
    lastCompletedAt: timestamp(row.lastCompletedAt),
    lastError: row.lastError,
    copiedCommits: Number(row.copiedCommits ?? 0),
  };
}

export async function getPremiumSyncStatus(userId: string): Promise<PremiumSyncStatus | null> {
  const sql = await getSql();
  const rows = await sql.query<SyncRow>(
    `select ${STATUS_COLUMNS} from premium_sync p where p.user_id = $1`,
    [userId],
  );
  return rows[0] ? toStatus(rows[0]) : null;
}

export async function savePremiumSync(input: PremiumSyncInput): Promise<PremiumSyncStatus> {
  const sql = await getSql();
  await sql.query(
    `insert into premium_sync (
       user_id, source_usernames, start_date, repo, commit_name, commit_email,
       intensity, is_private, enabled, disabled_reason, needs_reconcile, next_sync_at
     ) values ($1, $2::jsonb, $3::date, $4, $5, $6, $7, $8, true, null, true, current_timestamp)
     on conflict (user_id) do update set
       source_usernames = excluded.source_usernames,
       start_date = excluded.start_date,
       repo = excluded.repo,
       commit_name = excluded.commit_name,
       commit_email = excluded.commit_email,
       intensity = excluded.intensity,
       is_private = excluded.is_private,
       enabled = true,
       disabled_reason = null,
       revision = premium_sync.revision + 1,
       needs_reconcile = true,
       next_sync_at = current_timestamp,
       lease_until = null,
       last_error = null,
       updated_at = current_timestamp`,
    [
      input.userId,
      JSON.stringify(input.sourceUsernames),
      input.startDate,
      input.repo,
      input.commitName,
      input.commitEmail,
      input.intensity,
      input.isPrivate,
    ],
  );
  const status = await getPremiumSyncStatus(input.userId);
  if (!status) throw new Error("Automatic sync configuration was not saved");
  return status;
}
export async function resumePremiumSync(userId: string): Promise<PremiumSyncStatus | null> {
  const sql = await getSql();
  await sql`
    update premium_sync
    set enabled = true,
        disabled_reason = null,
        revision = revision + 1,
        needs_reconcile = true,
        next_sync_at = current_timestamp,
        lease_until = null,
        last_error = null,
        updated_at = current_timestamp
    where user_id = ${userId}
  `;
  return getPremiumSyncStatus(userId);
}

export async function disablePremiumSync(userId: string): Promise<PremiumSyncStatus | null> {
  const sql = await getSql();
  await sql`
    update premium_sync
    set enabled = false,
        disabled_reason = 'user',
        lease_until = null,
        updated_at = current_timestamp
    where user_id = ${userId}
  `;
  return getPremiumSyncStatus(userId);
}

export async function hasEnabledPremiumSync(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ enabled: boolean }>(
    "select enabled from premium_sync where user_id = $1",
    [userId],
  );
  return rows[0]?.enabled === true;
}

export async function claimDuePremiumSync(): Promise<ClaimedPremiumSync | null> {
  const sql = await getSql();
  const rows = await sql.query<SyncRow & { reconcileRequired: boolean }>(`
    with due as (
      select user_id, needs_reconcile
      from premium_sync
      where enabled
        and next_sync_at <= current_timestamp
        and (lease_until is null or lease_until <= current_timestamp)
      order by next_sync_at
      for update skip locked
      limit 1
    )
    update premium_sync p
    set lease_until = current_timestamp + interval '2 hours',
        last_started_at = current_timestamp,
        needs_reconcile = true,
        updated_at = current_timestamp
    from due
    where p.user_id = due.user_id
    returning
      p.user_id as "userId",
      p.source_usernames as "sourceUsernames",
      p.start_date as "startDate",
      p.repo,
      p.commit_name as "commitName",
      p.commit_email as "commitEmail",
      p.intensity,
      p.is_private as "isPrivate",
      p.revision,
      due.needs_reconcile as "reconcileRequired"
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    sourceUsernames: sourceUsernames(row.sourceUsernames),
    startDate: row.startDate,
    repo: row.repo,
    commitName: row.commitName,
    commitEmail: row.commitEmail,
    intensity: row.intensity,
    isPrivate: row.isPrivate,
    revision: Number(row.revision),
    reconcileRequired: row.reconcileRequired,
  };
}

export async function completePremiumSync(userId: string, revision: number): Promise<void> {
  const sql = await getSql();
  await sql`
    update premium_sync
    set next_sync_at = current_timestamp + interval '24 hours',
        lease_until = null,
        last_completed_at = current_timestamp,
        last_error = null,
        needs_reconcile = false,
        updated_at = current_timestamp
    where user_id = ${userId} and revision = ${revision}
  `;
}

export async function failPremiumSync(
  userId: string,
  revision: number,
  message: string,
): Promise<void> {
  const sql = await getSql();
  await sql`
    update premium_sync
    set next_sync_at = current_timestamp + interval '1 hour',
        lease_until = null,
        last_error = ${message.slice(0, 500)},
        needs_reconcile = true,
        updated_at = current_timestamp
    where user_id = ${userId} and revision = ${revision}
  `;
}

export async function pausePremiumSyncForBilling(userId: string, revision: number): Promise<void> {
  const sql = await getSql();
  await sql`
    update premium_sync
    set enabled = false,
        disabled_reason = 'subscription',
        lease_until = null,
        last_error = 'Premium subscription is inactive.',
        updated_at = current_timestamp
    where user_id = ${userId} and revision = ${revision}
  `;
}

export async function getCopiedCommitCounts(userId: string): Promise<Record<string, number>> {
  const sql = await getSql();
  const rows = await sql.query<{ day: string; copiedCommits: number }>(
    `select day, copied_commits as "copiedCommits"
     from premium_sync_day
     where user_id = $1`,
    [userId],
  );
  return Object.fromEntries(rows.map((row) => [row.day, Number(row.copiedCommits)]));
}

async function writeCopiedCommitCounts(
  userId: string,
  counts: Record<string, number>,
): Promise<void> {
  const entries = Object.entries(counts);
  if (entries.length === 0) return;
  const values: unknown[] = [userId];
  const tuples = entries.map(([day, count], index) => {
    const dateParameter = index * 2 + 2;
    values.push(day, count);
    return `($1, $${dateParameter}::date, $${dateParameter + 1})`;
  });
  const sql = await getSql();
  await sql.query(
    `insert into premium_sync_day (user_id, day, copied_commits)
     values ${tuples.join(", ")}
     on conflict (user_id, day) do update set
       copied_commits = excluded.copied_commits,
       updated_at = current_timestamp`,
    values,
  );
}

export async function replaceCopiedCommitCounts(
  userId: string,
  counts: Record<string, number>,
): Promise<void> {
  const sql = await getSql();
  await sql`delete from premium_sync_day where user_id = ${userId}`;
  await writeCopiedCommitCounts(userId, counts);
}

export async function upsertCopiedCommitCounts(
  userId: string,
  counts: Record<string, number>,
): Promise<void> {
  await writeCopiedCommitCounts(userId, counts);
}
