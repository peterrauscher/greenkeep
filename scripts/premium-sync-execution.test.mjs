import assert from "node:assert/strict";
import test from "node:test";
import { executePremiumSync } from "./premium-sync-execution.mjs";

function operations({ synchronize }) {
  const calls = [];
  return {
    calls,
    value: {
      synchronize,
      complete: async () => calls.push("complete"),
      pause: async () => calls.push("pause"),
      fail: async (_config, message) => calls.push(`fail:${message}`),
      isPremiumRequired: (error) => error instanceof Error && error.message === "premium-required",
    },
  };
}

test("completes a successful claimed sync exactly once", async () => {
  const setup = operations({ synchronize: async () => 7 });
  const result = await executePremiumSync({ userId: "user-1" }, setup.value);

  assert.deepEqual(result, { outcome: "completed", addedCommits: 7 });
  assert.deepEqual(setup.calls, ["complete"]);
});

test("pauses instead of retrying when Premium is inactive", async () => {
  const setup = operations({
    synchronize: async () => {
      throw new Error("premium-required");
    },
  });
  const result = await executePremiumSync({ userId: "user-1" }, setup.value);

  assert.deepEqual(result, { outcome: "paused", addedCommits: 0 });
  assert.deepEqual(setup.calls, ["pause"]);
});

test("records retryable failures without completing the lease", async () => {
  const setup = operations({
    synchronize: async () => {
      throw new Error("GitHub unavailable");
    },
  });
  const result = await executePremiumSync({ userId: "user-1" }, setup.value);

  assert.deepEqual(result, {
    outcome: "failed",
    addedCommits: 0,
    error: "GitHub unavailable",
  });
  assert.deepEqual(setup.calls, ["fail:GitHub unavailable"]);
});
