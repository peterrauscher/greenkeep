import assert from "node:assert/strict";
import { test } from "node:test";
import { hasRepoScope, parseGithubScopes } from "./github-scope.mjs";

test("parseGithubScopes splits GitHub spaces and Better Auth commas", () => {
  assert.deepEqual(parseGithubScopes("repo user:email"), ["repo", "user:email"]);
  assert.deepEqual(parseGithubScopes("repo,user:email"), ["repo", "user:email"]);
  assert.deepEqual(parseGithubScopes(["repo", "user:email"]), [
    "repo",
    "user:email",
  ]);
  assert.deepEqual(parseGithubScopes(null), []);
  assert.deepEqual(parseGithubScopes(""), []);
});

test("hasRepoScope fails closed without classic repo", () => {
  assert.equal(hasRepoScope("repo"), true);
  assert.equal(hasRepoScope("repo,user:email"), true);
  assert.equal(hasRepoScope(["read:user", "repo", "user:email"]), true);
  assert.equal(hasRepoScope("user:email"), false);
  assert.equal(hasRepoScope("public_repo"), false);
  assert.equal(hasRepoScope("public_repo user:email"), false);
  assert.equal(hasRepoScope(null), false);
  assert.equal(hasRepoScope(""), false);
});
