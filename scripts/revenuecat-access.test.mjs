import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAnyRevenueCatEntitlement,
  isRevenueCatEntitlementActive,
} from "./revenuecat-access.mjs";

const NOW = Date.parse("2026-08-23T12:00:00Z");

test("accepts lifetime, unexpired, and grace-period entitlements", () => {
  assert.equal(isRevenueCatEntitlementActive({ expires_date: null }, NOW), true);
  assert.equal(isRevenueCatEntitlementActive({ expires_date: "2026-08-24T00:00:00Z" }, NOW), true);
  assert.equal(
    isRevenueCatEntitlementActive(
      {
        expires_date: "2026-08-22T00:00:00Z",
        grace_period_expires_date: "2026-08-24T00:00:00Z",
      },
      NOW,
    ),
    true,
  );
});

test("denies missing, malformed, and fully expired entitlements", () => {
  assert.equal(isRevenueCatEntitlementActive(undefined, NOW), false);
  assert.equal(isRevenueCatEntitlementActive({ expires_date: "not-a-date" }, NOW), false);
  assert.equal(
    isRevenueCatEntitlementActive(
      {
        expires_date: "2026-08-22T00:00:00Z",
        grace_period_expires_date: "2026-08-23T11:59:59Z",
      },
      NOW,
    ),
    false,
  );
});

test("grants when any allowed entitlement is active", async () => {
  /** @type {{ url?: string, init?: RequestInit }} */
  const request = {};
  const granted = await hasAnyRevenueCatEntitlement({
    appUserId: "github/user 42",
    apiKey: "server-secret",
    entitlementIds: ["pro", "premium"],
    nowMs: NOW,
    fetchImpl: async (url, init) => {
      request.url = String(url);
      request.init = init;
      return new Response(
        JSON.stringify({
          subscriber: {
            entitlements: {
              premium: { expires_date: "2026-09-23T12:00:00Z" },
              legacy: { expires_date: "2020-01-01T00:00:00Z" },
            },
          },
        }),
        { status: 200 },
      );
    },
  });

  assert.equal(granted, true);
  assert.equal(request.url, "https://api.revenuecat.com/v1/subscribers/github%2Fuser%2042");
  assert.equal(new Headers(request.init?.headers).get("authorization"), "Bearer server-secret");
});

test("fails closed for malformed success responses and RevenueCat HTTP errors", async () => {
  const denied = await hasAnyRevenueCatEntitlement({
    appUserId: "user-1",
    apiKey: "server-secret",
    entitlementIds: ["premium"],
    nowMs: NOW,
    fetchImpl: async () => new Response(JSON.stringify({ subscriber: {} }), { status: 200 }),
  });
  assert.equal(denied, false);

  await assert.rejects(
    hasAnyRevenueCatEntitlement({
      appUserId: "user-1",
      apiKey: "server-secret",
      entitlementIds: ["pro", "premium"],
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    }),
    /lookup failed \(503\)/,
  );
});
