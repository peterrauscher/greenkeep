import assert from "node:assert/strict";
import test from "node:test";
import { applyCommittedSpecs, buildSyncCommitSpecs } from "./premium-sync-plan.mjs";

test("plans only per-day commits missing from the durable ledger", () => {
  const specs = buildSyncCommitSpecs(
    [
      { date: "2026-08-22", commits: 3 },
      { date: "2026-08-23", commits: 1 },
    ],
    { "2026-08-22": 1, "2026-08-23": 2 },
  );

  assert.deepEqual(specs, [
    {
      date: "2026-08-22",
      iso: "2026-08-22T11:03:00Z",
      message: "chore: graph 2026-08-22",
    },
    {
      date: "2026-08-22",
      iso: "2026-08-22T12:06:00Z",
      message: "chore: graph 2026-08-22",
    },
  ]);
});

test("a confirmed batch advances only its represented days", () => {
  const committed = buildSyncCommitSpecs(
    [
      { date: "2026-08-22", commits: 2 },
      { date: "2026-08-23", commits: 1 },
    ],
    { "2026-08-22": 1 },
  );
  const next = applyCommittedSpecs({ "2026-08-22": 1 }, committed.slice(0, 1));

  assert.deepEqual(next, { "2026-08-22": 2 });
  assert.deepEqual(
    buildSyncCommitSpecs(
      [
        { date: "2026-08-22", commits: 2 },
        { date: "2026-08-23", commits: 1 },
      ],
      next,
    ),
    [
      {
        date: "2026-08-23",
        iso: "2026-08-23T10:00:00Z",
        message: "chore: graph 2026-08-23",
      },
    ],
  );
});

test("reconciliation counts at or above the target make retries a no-op", () => {
  assert.deepEqual(
    buildSyncCommitSpecs(
      [
        { date: "2026-08-22", commits: 1 },
        { date: "2026-08-23", commits: 4 },
      ],
      { "2026-08-22": 3, "2026-08-23": 4 },
    ),
    [],
  );
});
