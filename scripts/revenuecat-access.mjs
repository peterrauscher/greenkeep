// @ts-check

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * RevenueCat returns `null` for a lifetime entitlement. Expired subscriptions
 * remain valid through an explicit grace-period timestamp.
 * @param {unknown} entitlement
 * @param {number} [nowMs]
 */
export function isRevenueCatEntitlementActive(entitlement, nowMs = Date.now()) {
  if (!isRecord(entitlement)) return false;

  const expiresDate = entitlement.expires_date;
  if (expiresDate === null) return true;
  if (typeof expiresDate === "string" && Date.parse(expiresDate) > nowMs) return true;

  const gracePeriodExpiresDate = entitlement.grace_period_expires_date;
  return typeof gracePeriodExpiresDate === "string" && Date.parse(gracePeriodExpiresDate) > nowMs;
}

/**
 * Query RevenueCat's server API for one authenticated application user.
 * Malformed success responses deny access; transport and HTTP failures throw so
 * callers can distinguish "not paid" from "could not verify".
 * @param {object} options
 * @param {string} options.appUserId
 * @param {string} options.apiKey
 * @param {string[]} options.entitlementIds
 * @param {typeof fetch} [options.fetchImpl]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.nowMs]
 */
export async function hasAnyRevenueCatEntitlement({
  appUserId,
  apiKey,
  entitlementIds,
  fetchImpl = fetch,
  signal,
  nowMs = Date.now(),
}) {
  const response = await fetchImpl(
    `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`RevenueCat entitlement lookup failed (${response.status})`);
  }

  const payload = await response.json();
  if (!isRecord(payload)) return false;
  const subscriber = payload.subscriber;
  if (!isRecord(subscriber)) return false;
  const entitlements = subscriber.entitlements;
  if (!isRecord(entitlements)) return false;

  return entitlementIds.some((entitlementId) =>
    isRevenueCatEntitlementActive(entitlements[entitlementId], nowMs),
  );
}
